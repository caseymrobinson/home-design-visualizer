import * as THREE from 'three';
import { getWalls } from '../lib/geometry';
import type { Design, Lighting } from '../lib/types';

/**
 * Photometric calibration. Light sources use real units (lumens → candela, lux, nits),
 * and a camera exposure brings the result into display range — same as a photographer would.
 */
export const EXPOSURE_KEY = 2.2;

/**
 * Metered exposure: estimate the average illuminance in the room from sun, sky and fixtures,
 * then expose so a white wall sits comfortably below clipping — like a camera in auto mode.
 */
export function exposureFor(design: Design) {
  const l = design.lighting;
  const windows = design.room.openings.filter((o) => o.kind === 'window');
  const glassArea = windows.reduce((a, o) => a + (o.width * o.height) / 1550, 0); // m²
  // Direct sun only counts through windows that actually face it.
  const sun = sunDirection(l.time, l.northAngle);
  const walls = getWalls(design.room);
  const sunArea = windows.reduce((a, o) => {
    const w = walls[o.wall];
    if (!w || sun.y <= 0) return a;
    const facing = Math.max(0, -(sun.x * w.n.x + sun.z * w.n.y));
    return a + ((o.width * o.height) / 1550) * facing;
  }, 0);
  let lumens = 0;
  for (const it of design.items) {
    const lm = Number(it.params.lumens ?? 0);
    if (it.type === 'sconce' && l.sconces) lumens += lm;
    if (it.type === 'ceiling-light' && l.ceiling) lumens += lm;
  }
  const E = sunLux(l) * sunArea * 0.05 + skyNits(l) * glassArea * 0.35 + lumens * l.dimmer * 0.12 + 8;
  return (EXPOSURE_KEY / E) * Math.pow(2, l.exposure);
}

/** 0 at night → 1 at solar noon. */
export const dayFactor = (l: Lighting) => (l.daylight ? Math.max(0, Math.sin(((l.time - 6) / 13) * Math.PI)) : 0);

export const pointCandela = (lumens: number, l: Lighting) => (lumens / (4 * Math.PI)) * l.dimmer;

export const spotCandela = (lumens: number, halfAngle: number, l: Lighting) => (lumens / (2 * Math.PI * (1 - Math.cos(halfAngle)))) * l.dimmer;

/** Luminance of the bright shade surface (nits) for glowing materials. */
export const shadeNits = (lumens: number, l: Lighting) => (lumens / 30) * l.dimmer * 22;

export const sunLux = (l: Lighting) => (l.overcast ? 0 : 9000 * Math.pow(dayFactor(l), 0.7));

export const skyNits = (l: Lighting) => (l.daylight ? (l.overcast ? 900 : 1600) * (0.04 + dayFactor(l)) : 2);

/** Sun direction in plan/3D given time of day and which way the room faces. */
export function sunDirection(time: number, northAngle: number) {
  const az = THREE.MathUtils.degToRad(90 + ((time - 6) / 12) * 180); // bearing, clockwise from north
  const el = THREE.MathUtils.degToRad(Math.max(-4, 58 * Math.sin((Math.PI * (time - 6)) / 12)));
  // Plan: north = −y rotated by northAngle
  const n = THREE.MathUtils.degToRad(northAngle);
  const east = { x: Math.cos(n), y: Math.sin(n) };
  const north = { x: Math.sin(n), y: -Math.cos(n) };
  const px = north.x * Math.cos(az) + east.x * Math.sin(az);
  const py = north.y * Math.cos(az) + east.y * Math.sin(az);
  return new THREE.Vector3(px * Math.cos(el), Math.sin(el), py * Math.cos(el)).normalize();
}

