import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { bounds, getWalls } from '../lib/geometry';
import type { Design } from '../lib/types';
import { IN } from '../lib/units';
import { dayFactor, skyNits, sunDirection, sunLux } from './lightUnits';

RectAreaLightUniformsLib.init();

export function Daylight({ design }: { design: Design }) {
  const L = design.lighting;
  const b = bounds(design.room.corners);
  const center = useMemo(() => new THREE.Vector3(b.cx * IN, (design.room.ceiling / 2) * IN, b.cy * IN), [b.cx, b.cy, design.room.ceiling]);
  const dir = sunDirection(L.time, L.northAngle);
  const sun = useRef<THREE.DirectionalLight>(null!);
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    target.position.copy(center);
    target.updateMatrixWorld();
    if (sun.current) sun.current.target = target;
  }, [center, target]);
  const low = Math.max(0, dir.y);
  const sunColor = new THREE.Color('#ffb877').lerp(new THREE.Color('#fff3e2'), Math.min(1, low * 2.2));
  const lux = dir.y > 0.02 ? sunLux(L) : 0;
  const walls = getWalls(design.room);
  const skyColor = L.overcast ? '#e9edf0' : new THREE.Color('#dfe9f6').lerp(new THREE.Color('#ffd9b5'), 1 - Math.min(1, dayFactor(L) * 2.5)).getStyle();
  const nits = skyNits(L);
  const size = Math.max(b.w, b.h) * IN;

  return (
    <>
      <primitive object={target} />
      {lux > 0 && (
        <directionalLight
          ref={sun}
          position={center.clone().addScaledVector(dir, 8)}
          intensity={lux}
          color={sunColor}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0003}
          shadow-normalBias={0.015}
          shadow-radius={3}
          shadow-camera-left={-size}
          shadow-camera-right={size}
          shadow-camera-top={size}
          shadow-camera-bottom={-size}
          shadow-camera-near={0.5}
          shadow-camera-far={20}
        />
      )}
      {design.room.openings
        .filter((o) => o.kind === 'window')
        .map((o) => {
          const w = walls[o.wall];
          if (!w) return null;
          const inset = 0.5;
          const px = w.a.x + w.dir.x * o.offset + w.n.x * inset;
          const py = w.a.y + w.dir.y * o.offset + w.n.y * inset;
          const cy = o.sill + o.height / 2;
          return (
            <rectAreaLight
              key={o.id}
              position={[px * IN, cy * IN, py * IN]}
              width={(o.width - 4) * IN}
              height={(o.height - 4) * IN}
              intensity={nits * (o.glass === 'frosted' ? 0.85 : 1)}
              color={skyColor}
              ref={(l) => {
                if (l) l.lookAt((px + w.n.x * 100) * IN, cy * IN, (py + w.n.y * 100) * IN);
              }}
            />
          );
        })}
      <hemisphereLight args={['#fbf6ee', '#c9bfb2', 0.6]} />
    </>
  );
}
