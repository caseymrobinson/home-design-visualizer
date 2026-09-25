import { Selection } from '@react-three/postprocessing';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { FLAGS } from '../lib/flags';
import { IN } from '../lib/units';
import { useDesign, useStore } from '../store';
import { CameraRig } from './CameraRig';
import { Daylight } from './Daylight';
import { Dimensions } from './Dimensions';
import { Effects } from './Effects';
import { EnvProbe } from './EnvProbe';
import { DragController, Items } from './Items';
import { exposureFor } from './lightUnits';
import { PathTracer } from './PathTracer';
import { Room } from './Room';

const BG = new THREE.Color('#e8e2d9');

/** The scene is photometric, so the backdrop is scaled to read as the UI's paper color after exposure. */
export function backgroundColor(exposure: number) {
  // AgX compresses mid-tones; lift so the tone-mapped result lands on the UI paper color.
  return BG.clone().multiplyScalar(2.35 / exposure);
}

function Background() {
  const design = useDesign();
  const { scene } = useThree();
  const exposure = exposureFor(design);
  useEffect(() => {
    scene.background = backgroundColor(exposure);
  }, [scene, exposure]);
  return null;
}

function RawExposure() {
  const design = useDesign();
  const { gl } = useThree();
  const renderActive = useStore((s) => s.render.active);
  useEffect(() => {
    if (renderActive) return;
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = exposureFor(design);
  });
  return null;
}

function Contents() {
  const design = useDesign();
  const renderActive = useStore((s) => s.render.active);
  return (
    <Selection>
      <Background />
      <group scale={IN}>
        <Room design={design} />
        <Items design={design} />
        <Dimensions design={design} />
      </group>
      <Daylight design={design} />
      {FLAGS.env && <EnvProbe design={design} />}
      <CameraRig design={design} />
      <DragController />
      {!renderActive && FLAGS.fx && <Effects design={design} />}
      {!FLAGS.fx && <RawExposure />}
      <PathTracer />
    </Selection>
  );
}

export function Scene() {
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      flat
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: FLAGS.pdb }}
      camera={{ fov: 36, near: 0.03, far: 80, position: [8, 8, -8] }}
      onPointerMissed={() => useStore.getState().select(null)}
      onCreated={({ gl, scene, camera }) => {
        if (import.meta.env.DEV) Object.assign(window, { __three: { gl, scene, camera } });
        gl.toneMapping = THREE.NoToneMapping;
        gl.shadowMap.autoUpdate = true;
      }}
    >
      <Contents />
    </Canvas>
  );
}
