import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { bounds } from '../lib/geometry';
import type { Design } from '../lib/types';
import { IN } from '../lib/units';
import { useStore } from '../store';
import { registry } from './registry';

/**
 * Real-time "bounce light": capture the room into a cube map from its center and use it
 * as the scene environment. Re-capturing a few times feeds light back into itself,
 * approximating interreflection — and gives every glossy surface correct room reflections.
 */
export function EnvProbe({ design }: { design: Design }) {
  const { gl, scene } = useThree();
  const b = bounds(design.room.corners);
  const rt = useMemo(
    () =>
      new THREE.WebGLCubeRenderTarget(256, {
        type: THREE.HalfFloatType,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
      }),
    [],
  );
  const cam = useMemo(() => new THREE.CubeCamera(0.02, 40, rt), [rt]);
  const pmrem = useMemo(() => new THREE.PMREMGenerator(gl), [gl]);
  const pmremRT = useRef<THREE.WebGLRenderTarget | null>(null);
  if (import.meta.env.DEV) Object.assign(window, { __envRT: rt, __registry: registry });
  const pending = useRef(2);
  const last = useRef(0);

  useEffect(() => {
    cam.position.set(b.cx * IN, Math.min(52, design.room.ceiling * 0.55) * IN, b.cy * IN);
  }, [cam, b.cx, b.cy, design.room.ceiling]);

  useEffect(
    () => () => {
      rt.dispose();
      pmrem.dispose();
      if (pmremRT.current && scene.environment === pmremRT.current.texture) scene.environment = null;
      pmremRT.current?.dispose();
    },
    [rt, scene, pmrem],
  );

  useFrame(() => {
    if (useStore.getState().render.active) return;
    const now = performance.now();
    if (registry.envDirty > last.current && now - registry.envDirty > 120) {
      last.current = now;
      pending.current = 2;
    }
    if (pending.current <= 0) return;

    // Raise every wall, show the ceiling, hide mirrors & helpers for the capture.
    const restore: (() => void)[] = [];
    registry.walls.forEach((w) => {
      w.setFull(true);
      restore.push(() => w.setFull(false));
    });
    if (registry.ceiling) {
      const v = registry.ceiling.visible;
      registry.ceiling.visible = true;
      restore.push(() => (registry.ceiling!.visible = v));
    }
    for (const o of [...registry.rasterOnly, ...registry.helpers]) {
      const v = o.visible;
      o.visible = false;
      restore.push(() => (o.visible = v));
    }
    const bg = scene.background;
    scene.background = new THREE.Color('#bfb8ae');
    // Pass 1 sees direct light only; pass 2 adds one bounce. Never unbounded feedback.
    const firstPass = pending.current === 2;
    const env = scene.environment;
    if (firstPass) scene.environment = null;
    restore.push(() => (scene.environment = env));
    // Shadow maps are already current for this frame — don't re-render them six more times.
    const autoShadows = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    restore.push(() => (gl.shadowMap.autoUpdate = autoShadows));
    try {
      cam.update(gl, scene);
    } catch (err) {
      console.error('env capture failed', err);
    } finally {
      scene.background = bg;
      restore.forEach((r) => r());
    }
    // Prefilter now (not lazily mid-render) and reuse the same target every time.
    pending.current--;
    pmremRT.current = pmrem.fromCubemap(rt.texture, pmremRT.current ?? undefined);
    scene.environment = pmremRT.current.texture;
    scene.environmentIntensity = 1;
  });

  return null;
}
