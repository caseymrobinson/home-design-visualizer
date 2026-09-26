import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { lampColor, metalMaterial } from '../../materials/library';
import { pointCandela, shadeNits, spotCandela } from '../lightUnits';
import { lathe, P, type ItemProps } from './common';

function useGlow(on: boolean, nits: number, kelvin: number, base = '#f6f2ea', transmission = 0) {
  const m = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: base,
        roughness: 0.4,
        clearcoat: 0.5,
        transmission,
        thickness: 0.01,
      }),
    [base, transmission],
  );
  useEffect(() => () => m.dispose(), [m]);
  m.emissive.set(on ? lampColor(kelvin) : '#000000');
  m.emissiveIntensity = on ? nits : 0;
  return m;
}

export function Sconce({ item, design }: ItemProps) {
  const L = design.lighting;
  const on = L.sconces;
  const style = P(item, 'style', 'globe');
  const lumens = P(item, 'lumens', 450);
  const metal = metalMaterial(design.finishes.metal);
  const glow = useGlow(on, shadeNits(lumens, L), L.kelvin, style === 'cone' ? '#efe6d6' : '#f7f4ee');
  const color = lampColor(L.kelvin);
  const { h, d } = item;
  const cy = h * 0.55;
  const shadeZ = d - 3;
  const pleat = useMemo(() => {
    const g = lathe([
      [2.1, 0],
      [3.6, 0],
      [2.2, 5.5],
      [1.2, 5.5],
    ]);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.abs(Math.sin(a * 16)) * 0.06;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const light = useRef<THREE.PointLight>(null!);
  return (
    <group>
      {/* Backplate + arm */}
      <mesh visible={style !== 'tube'} position={[0, cy, 0.2]} rotation-x={Math.PI / 2} material={metal} castShadow>
        <cylinderGeometry args={[2.3, 2.3, 0.4, 40]} />
      </mesh>
      <mesh visible={style !== 'tube'} position={[0, cy, (shadeZ - 1.4) / 2 + 0.3]} rotation-x={Math.PI / 2} material={metal} castShadow>
        <cylinderGeometry args={[0.32, 0.32, shadeZ - 1.4, 16]} />
      </mesh>
      {style === 'tube' && (
        <>
          {/* Kalium (from photo): two frosted tubes, up and down, from a curved brushed-nickel clip */}
          <mesh position={[0, h * 0.75 + 0.9, shadeZ]} material={glow}>
            <cylinderGeometry args={[1.15, 1.15, h / 2 - 1.8, 40]} />
          </mesh>
          <mesh position={[0, h * 0.25 - 0.9, shadeZ]} material={glow}>
            <cylinderGeometry args={[1.15, 1.15, h / 2 - 1.8, 40]} />
          </mesh>
          {/* half-round clip wrapping behind the tubes */}
          <mesh position={[0, h / 2, shadeZ]} material={metal}>
            <cylinderGeometry args={[1.3, 1.3, 3.6, 40, 1, true, -Math.PI * 0.62, Math.PI * 1.24]} />
          </mesh>
          <mesh position={[0, h / 2, (shadeZ - 1.3) / 2]} material={metal}>
            <boxGeometry args={[2.2, 3.6, shadeZ - 1.1]} />
          </mesh>
        </>
      )}
      {style === 'globe' && (
        <>
          <mesh position={[0, cy - 0.3, shadeZ]} material={metal}>
            <cylinderGeometry args={[1, 1.1, 1.2, 24]} />
          </mesh>
          <mesh position={[0, cy + 2.6, shadeZ]} material={glow}>
            <sphereGeometry args={[3, 48, 32]} />
          </mesh>
        </>
      )}
      {style === 'cylinder' && (
        <>
          <mesh position={[0, cy - 4.2, shadeZ]} material={metal}>
            <cylinderGeometry args={[1.9, 1.9, 0.5, 32]} />
          </mesh>
          <mesh position={[0, cy, shadeZ]} material={glow}>
            <cylinderGeometry args={[1.75, 1.75, 8, 40]} />
          </mesh>
          <mesh position={[0, cy + 4.2, shadeZ]} material={metal}>
            <cylinderGeometry args={[1.9, 1.9, 0.5, 32]} />
          </mesh>
        </>
      )}
      {style === 'cone' && (
        <>
          <mesh position={[0, cy - 1, shadeZ]} material={glow}>
            <sphereGeometry args={[1.2, 24, 16]} />
          </mesh>
          <mesh geometry={pleat} position={[0, cy - 3.2, shadeZ]} castShadow>
            <meshPhysicalMaterial color="#efe6d6" roughness={0.9} side={THREE.DoubleSide} emissive={on ? color : '#000'} emissiveIntensity={on ? 18 : 0} sheen={0.6} />
          </mesh>
        </>
      )}
      {on && (
        <pointLight
          ref={light}
          position={[0, style === 'globe' ? cy + 2.6 : style === 'tube' ? h / 2 : cy, shadeZ]}
          color={color}
          intensity={pointCandela(lumens, L)}
          distance={0}
          decay={2}
        />
      )}
    </group>
  );
}

export function CeilingLight({ item, design }: ItemProps) {
  const L = design.lighting;
  const on = L.ceiling;
  const style = P(item, 'style', 'recessed');
  const lumens = P(item, 'lumens', 700);
  const color = lampColor(L.kelvin);
  const glow = useGlow(on, shadeNits(lumens, L) * (style === 'recessed' ? 3 : 1), L.kelvin);
  const metal = metalMaterial(design.finishes.metal);
  const target = useMemo(() => new THREE.Object3D(), []);
  const half = Math.PI / 3.2;
  const spot = useRef<THREE.SpotLight>(null!);
  useEffect(() => {
    if (spot.current) spot.current.target = target;
  }, [target, on, style]);
  if (style === 'recessed') {
    return (
      <group>
        <mesh position={[0, -0.12, 0]}>
          <cylinderGeometry args={[2.6, 2.6, 0.24, 48]} />
          <meshStandardMaterial color="#f4f2ee" roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.26, 0]} material={glow}>
          <cylinderGeometry args={[1.7, 1.7, 0.05, 40]} />
        </mesh>
        <primitive object={target} position={[0, -100, 0]} />
        {on && (
          <spotLight
            ref={spot}
            position={[0, -0.5, 0]}
            color={color}
            intensity={spotCandela(lumens, half, L)}
            angle={half}
            penumbra={0.85}
            decay={2}
            distance={0}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
            shadow-radius={6}
          />
        )}
      </group>
    );
  }
  const drop = style === 'pendant' ? 18 : 0;
  return (
    <group>
      <mesh position={[0, -0.3, 0]} material={metal}>
        <cylinderGeometry args={[2.5, 2.5, 0.6, 40]} />
      </mesh>
      {drop > 0 && (
        <mesh position={[0, -drop / 2, 0]} material={metal}>
          <cylinderGeometry args={[0.08, 0.08, drop, 8]} />
        </mesh>
      )}
      <mesh position={[0, -drop - (style === 'pendant' ? 4 : 0.6), 0]} material={glow} scale={style === 'flush' ? [1, 0.45, 1] : [1, 1, 1]}>
        <sphereGeometry args={[style === 'pendant' ? 4 : 6, 48, 32, 0, Math.PI * 2, style === 'flush' ? Math.PI / 2 : 0, style === 'flush' ? Math.PI / 2 : Math.PI]} />
      </mesh>
      {on && <pointLight position={[0, -drop - 3, 0]} color={color} intensity={pointCandela(lumens, L)} decay={2} distance={0} />}
    </group>
  );
}
