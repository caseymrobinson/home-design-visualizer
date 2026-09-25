import { useFrame, useThree } from '@react-three/fiber';
import type React from 'react';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { useStore } from '../store';
import { exposureFor } from './lightUnits';
import { registry } from './registry';
import { backgroundColor } from './Scene';

let studioEnv: THREE.DataTexture | null = null;
/** Soft studio dome for renders from outside the room. */
function studio(level: number) {
  if (studioEnv) return studioEnv;
  const w = 64;
  const h = 32;
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = y / (h - 1); // 0 = bottom
      const k = level * (0.55 + 0.45 * t);
      const i = (y * w + x) * 4;
      data[i] = k * 1.0;
      data[i + 1] = k * 0.97;
      data[i + 2] = k * 0.92;
      data[i + 3] = 1;
    }
  studioEnv = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  studioEnv.mapping = THREE.EquirectangularReflectionMapping;
  studioEnv.needsUpdate = true;
  return studioEnv;
}

export function PathTracer() {
  const { gl, scene, camera } = useThree();
  const active = useStore((s) => s.render.active);
  const pt = useRef<WebGLPathTracer | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    if (!active) return;
    const st = useStore.getState();
    const design = st.design();
    st.setRender({ phase: 'building', samples: 0, snapshot: null });
    ready.current = false;

    const restore: (() => void)[] = [];
    const hide = (o: THREE.Object3D, v: boolean) => {
      const prev = o.visible;
      o.visible = v;
      restore.push(() => (o.visible = prev));
    };
    registry.rasterOnly.forEach((o) => hide(o, false));
    registry.traceOnly.forEach((o) => hide(o, true));
    registry.helpers.forEach((o) => hide(o, false));
    // The tracer can't digest empty geometry or screen-space line helpers.
    scene.traverse((o) => {
      const m = o as THREE.Mesh & { isLine2?: boolean; isLineSegments2?: boolean };
      if (!m.isMesh || !o.visible) return;
      const pos = m.geometry?.attributes?.position;
      const mat = m.material as THREE.Material & { isLineMaterial?: boolean };
      if (!pos || pos.count === 0 || m.isLine2 || m.isLineSegments2 || mat?.isLineMaterial) hide(o, false);
    });

    const prevEnv = scene.environment;
    const prevBg = scene.background;
    const exposure = exposureFor(design);
    scene.environment = studio(0.55 / exposure);
    scene.background = backgroundColor(exposure);
    restore.push(() => {
      scene.environment = prevEnv;
      scene.background = prevBg;
    });

    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = exposure;
    restore.push(() => {
      gl.toneMapping = THREE.NoToneMapping;
      gl.toneMappingExposure = 1;
    });

    let cancelled = false;
    // The tracer is only downloaded the first time someone asks for a render.
    const t = window.setTimeout(async () => {
      try {
        const { WebGLPathTracer } = await import('three-gpu-pathtracer');
        if (cancelled) return;
        const tracer = (pt.current ??= new WebGLPathTracer(gl));
        tracer.tiles.set(2, 2);
        tracer.bounces = 7;
        tracer.transmissiveBounces = 8;
        tracer.filterGlossyFactor = 0.35;
        tracer.minSamples = 3;
        tracer.renderDelay = 0;
        tracer.fadeDuration = 400;
        tracer.pausePathTracing = false;
        tracer.renderScale = Math.min(window.devicePixelRatio, 1.5) / gl.getPixelRatio();
        // Let the overlay paint before the (blocking) BVH build.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (cancelled) return;
        tracer.setScene(scene, camera);
        tracer.reset();
        ready.current = true;
        useStore.getState().setRender({ phase: 'tracing' });
      } catch (err) {
        console.error(err);
        useStore.getState().notify('Could not start the path tracer on this GPU');
        useStore.getState().setRender({ active: false, phase: 'idle' });
      }
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      ready.current = false;
      restore.reverse().forEach((r) => r());
      useStore.getState().setRender({ phase: 'idle', samples: 0 });
    };
  }, [active, gl, scene, camera]);

  return active ? <TraceLoop pt={pt} ready={ready} /> : null;
}

/** Owns the frame loop only while tracing (a priority>0 useFrame disables R3F's auto render). */
function TraceLoop({ pt, ready }: { pt: React.RefObject<WebGLPathTracer | null>; ready: React.RefObject<boolean> }) {
  const { gl, scene, camera } = useThree();
  const frame = useRef(0);
  useFrame(() => {
    const tracer = pt.current;
    if (!tracer || !ready.current) {
      gl.render(scene, camera);
      return;
    }
    const st = useStore.getState();
    const target = st.render.target;
    tracer.pausePathTracing = tracer.samples >= target;
    tracer.renderSample();
    frame.current++;
    const samples = Math.floor(tracer.samples);
    if (frame.current % 6 === 0 || samples >= target) {
      if (samples !== st.render.samples) st.setRender({ samples, phase: samples >= target ? 'done' : 'tracing' });
    }
    if (st.render.snapshot === 'request') {
      st.setRender({ snapshot: gl.domElement.toDataURL('image/png') });
    }
  }, 1);

  return null;
}
