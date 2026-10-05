import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { matte, metalMaterial } from '../../materials/library';
import { box, merge, roundedBox } from '../geom';
import { P, type ItemProps } from './common';

/** Standard (not oversized) wall plates: 4½″ tall, 2¾″ wide plus 1.81″ per extra gang. */
export const PLATE_H = 4.5;
const PLATE_T = 0.22;
const GANG_PITCH = 1.81;
export const plateWidth = (gangs: number) => 2.75 + GANG_PITCH * (gangs - 1);
/** Decora opening */
const DW = 1.31;
const DH = 2.63;

const DEVICE: Record<string, string> = { white: '#f2f1ec', black: '#1d1d1c', finish: '#f2f1ec' };

function usePlastic(hex: string) {
  const m = useMemo(() => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.32, clearcoat: 0.25, clearcoatRoughness: 0.4 }), [hex]);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

function Plate({ gangs, plate, metal }: { gangs: number; plate: string; metal: THREE.Material }) {
  const w = plateWidth(gangs);
  const geo = useMemo(() => {
    const g = roundedBox(w, PLATE_H, PLATE_T, 0.08);
    g.translate(0, PLATE_H / 2, PLATE_T / 2);
    return g;
  }, [w]);
  useEffect(() => () => geo.dispose(), [geo]);
  const plastic = usePlastic(DEVICE[plate] ?? DEVICE.white);
  return <mesh geometry={geo} material={plate === 'finish' ? metal : plastic} castShadow />;
}

const gangX = (i: number, gangs: number) => (i - (gangs - 1) / 2) * GANG_PITCH;

/** Rocker, slide dimmer or toggle switches on a 1–3 gang plate. */
export function LightSwitch({ item, design }: ItemProps) {
  const gangs = Math.max(1, Math.min(3, Math.round(P(item, 'gangs', 1))));
  const style = P(item, 'style', 'rocker');
  const plate = P(item, 'plate', 'white');
  const on = design.lighting.sconces || design.lighting.ceiling;
  const metal = metalMaterial(design.finishes.metal);
  const device = usePlastic(DEVICE[plate] ?? DEVICE.white);
  const cy = PLATE_H / 2;
  const z0 = PLATE_T;
  const parts = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];
    for (let i = 0; i < gangs; i++) {
      const x = gangX(i, gangs);
      if (style === 'toggle') {
        // Small slot with a tapered lever, thrown up when the lights are on
        dark.push(box(x - 0.2, x + 0.2, cy - 0.47, cy + 0.47, z0 - 0.02, z0 + 0.01));
        const lever = new THREE.CylinderGeometry(0.11, 0.17, 0.95, 16);
        lever.translate(0, 0.475, 0);
        lever.rotateX(Math.PI / 2 - (on ? 0.45 : -0.45));
        lever.translate(x, cy, z0);
        geos.push(lever);
      } else {
        // Decora face: rocker (full width, or narrowed beside a slide dimmer)
        const rw = style === 'dimmer' ? DW * 0.58 : DW - 0.06;
        const rx = style === 'dimmer' ? x - DW / 2 + rw / 2 + 0.03 : x;
        const rocker = roundedBox(rw, DH - 0.06, 0.16, 0.05);
        rocker.rotateX(on ? -0.035 : 0.035);
        rocker.translate(rx, cy, z0 + 0.09);
        geos.push(rocker);
        if (style === 'dimmer') {
          const tx = x + DW / 2 - 0.22;
          dark.push(box(tx - 0.035, tx + 0.035, cy - DH / 2 + 0.25, cy + DH / 2 - 0.25, z0 + 0.0, z0 + 0.03));
          const knobY = cy - DH / 2 + 0.25 + (DH - 0.5) * design.lighting.dimmer;
          geos.push(roundedBox(0.3, 0.38, 0.14, 0.04).translate(tx, knobY, z0 + 0.09));
          // Frame around the opening
          geos.push(box(x - DW / 2, x + DW / 2, cy - DH / 2, cy + DH / 2, z0 - 0.02, z0 + 0.02));
        }
      }
    }
    return { device: merge(geos), dark: dark.length ? merge(dark) : null };
  }, [gangs, style, on, cy, z0, design.lighting.dimmer]);
  useEffect(
    () => () => {
      parts.device.dispose();
      parts.dark?.dispose();
    },
    [parts],
  );
  return (
    <group>
      <Plate gangs={gangs} plate={plate} metal={metal} />
      <mesh geometry={parts.device} material={device} castShadow />
      {parts.dark && <mesh geometry={parts.dark} material={matte('#141414', 0.7)} />}
    </group>
  );
}

/** One receptacle face (two slots + ground) centered at (x, y). */
function receptacle(x: number, y: number, z: number, out: THREE.BufferGeometry[]) {
  out.push(box(x - 0.24, x - 0.17, y + 0.02, y + 0.32, z, z + 0.01)); // neutral (taller)
  out.push(box(x + 0.17, x + 0.24, y + 0.06, y + 0.32, z, z + 0.01)); // hot
  const ground = new THREE.CircleGeometry(0.11, 16, 0, Math.PI);
  ground.rotateZ(Math.PI);
  ground.translate(x, y - 0.14, z + 0.01);
  out.push(ground);
}

/** Decora outlets: GFCI (code for bathrooms), plain duplex, or USB combo. 1–2 gangs. */
export function Outlet({ item, design }: ItemProps) {
  const gangs = Math.max(1, Math.min(2, Math.round(P(item, 'gangs', 1))));
  const style = P(item, 'style', 'gfci');
  const plate = P(item, 'plate', 'white');
  const metal = metalMaterial(design.finishes.metal);
  const device = usePlastic(DEVICE[plate] ?? DEVICE.white);
  const cy = PLATE_H / 2;
  const z0 = PLATE_T;
  const parts = useMemo(() => {
    const faces: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];
    const buttons: THREE.BufferGeometry[] = [];
    for (let i = 0; i < gangs; i++) {
      const x = gangX(i, gangs);
      const zf = z0 + 0.12;
      faces.push(roundedBox(DW - 0.04, DH - 0.04, 0.12, 0.04).translate(x, cy, z0 + 0.06));
      // GFCI on the first gang only, like a real install feeding the rest
      const kind = style === 'gfci' && i > 0 ? 'duplex' : style;
      if (kind === 'usb') {
        receptacle(x, cy + 0.62, zf, dark);
        for (const sx of [-0.28, 0.28]) dark.push(box(x + sx - 0.24, x + sx + 0.24, cy - 0.75, cy - 0.57, zf, zf + 0.01));
        // USB-C
        const c = roundedBox(0.36, 0.13, 0.02, 0.06);
        c.translate(x, cy - 0.32, zf);
        dark.push(c);
      } else {
        receptacle(x, cy + 0.7, zf, dark);
        receptacle(x, cy - 0.95, zf, dark);
        if (kind === 'gfci') {
          buttons.push(roundedBox(0.5, 0.2, 0.08, 0.03).translate(x - 0.25, cy - 0.12, zf + 0.03)); // TEST
          buttons.push(roundedBox(0.5, 0.2, 0.08, 0.03).translate(x + 0.29, cy - 0.12, zf + 0.03)); // RESET
          const led = new THREE.CircleGeometry(0.03, 12);
          led.translate(x + 0.5, cy + 0.15, zf + 0.012);
          dark.push(led);
        }
      }
    }
    return { faces: merge(faces), dark: merge(dark), buttons: buttons.length ? merge(buttons) : null };
  }, [gangs, style, cy, z0]);
  useEffect(
    () => () => {
      parts.faces.dispose();
      parts.dark.dispose();
      parts.buttons?.dispose();
    },
    [parts],
  );
  return (
    <group>
      <Plate gangs={gangs} plate={plate} metal={metal} />
      <mesh geometry={parts.faces} material={device} castShadow />
      <mesh geometry={parts.dark} material={matte('#141414', 0.7)} />
      {parts.buttons && <mesh geometry={parts.buttons} material={plate === 'black' ? matte('#3a3a38', 0.4) : matte('#e6e4dd', 0.35)} />}
    </group>
  );
}
