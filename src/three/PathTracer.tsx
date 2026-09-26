import { useFrame, useThree } from '@react-three/fiber';
import type React from 'react';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { useStore } from '../store';
import { exposureFor, skyNits } from './lightUnits';
import { registry } from './registry';
import { backgroundColor } from './Scene';

let studioEnv: THREE.DataTexture | null = null;
/** Soft sky dome: lights the room through its windows (and the backdrop of renders from outside). */
function studio(level: number) {
  const w = 64;
  const h = 32;
  studioEnv ??= new THREE.DataTexture(new Float32Array(w * h * 4), w, h, THREE.RGBAFormat, THREE.FloatType);
  const data = studioEnv.image.data as Float32Array;
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
  studioEnv.mapping = THREE.EquirectangularReflectionMapping;
  studioEnv.needsUpdate = true;
  return studioEnv;
}

type DenoiseQuad = FullScreenQuad & { material: THREE.ShaderMaterial & { map: THREE.Texture | null; sigma: number; threshold: number; kSigma: number } };
let denoise: DenoiseQuad;

type TracerMaterial = THREE.ShaderMaterial & { needsUpdate: boolean };
/** Brightest single sample allowed, in display whites (applied as 12 / exposure). */
const CLAMP_WHITES = 12;
const clampUniform = { value: 1e9 };

const SEE_THROUGH = '/* matte: camera sees through */';

/**
 * Re-purpose the tracer's "matte" flag: camera rays pass straight through matte surfaces, while
 * bounces and shadow rays still hit them. Cut-away walls stay physically present — they block the
 * sun and bounce light back into the room — but the camera looks through them, like the raster view.
 */
function installSeeThrough(tracer: WebGLPathTracer) {
  const internals = tracer as unknown as { _pathTracer?: { material: TracerMaterial }; _lowResPathTracer?: { material: TracerMaterial } };
  for (const r of [internals._pathTracer, internals._lowResPathTracer]) {
    const m = r?.material;
    if (!m || m.fragmentShader.includes(SEE_THROUGH)) continue;
    const next = m.fragmentShader.replace(
      /if \( material\.matte && state\.firstRay \) \{\s*gl_FragColor = vec4\( 0\.0 \);\s*break;\s*\}/,
      `if ( material.matte && state.firstRay ) { ${SEE_THROUGH}
        ray.origin = stepRayOrigin( ray.origin, ray.direction, - surfaceHit.faceNormal, surfaceHit.dist );
        i --;
        continue;
      }`,
    );
    if (next === m.fragmentShader) console.warn('path tracer: matte patch did not apply');
    // One NaN/Inf sample poisons a pixel's running average for good (it shows as black). Drop bad
    // samples instead; test the raw bits because GPU compilers may fold isnan() away.
    const guarded = next.replace(
      'gl_FragColor.a *= opacity;',
      `uvec4 fBits = floatBitsToUint( gl_FragColor ) & 0x7f800000u;
      if ( any( equal( fBits, uvec4( 0x7f800000u ) ) ) ) gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
      // Firefly clamp, far above display white: rare glints off glossy surfaces never converge.
      float fMax = max( gl_FragColor.r, max( gl_FragColor.g, gl_FragColor.b ) );
      if ( fMax > sampleClamp ) gl_FragColor.rgb *= sampleClamp / fMax;
      gl_FragColor.a *= opacity;`,
    ).replace('uniform mat4 cameraWorldMatrix;', 'uniform mat4 cameraWorldMatrix;\nuniform float sampleClamp;');
    m.uniforms.sampleClamp = clampUniform;
    if (guarded === next) console.warn('path tracer: NaN guard did not apply');
    // Lamp shades and glowing trims are only visual: their light is already carried by real
    // light sources. Emission reached through diffuse bounces would count it twice, and small
    // glowing shapes found by chance are the classic source of fireflies that never converge.
    // Keep emission seen directly or through mirrors and glass.
    const lit = guarded
      .replace(
        'state.firstRay = i == 0 && state.transmissiveTraversals == transmissiveBounces;',
        'state.firstRay = i == 0 && state.transmissiveTraversals == transmissiveBounces;\n\t\t\t\t\t\tfloat pathRoughness = state.accumulatedRoughness;',
      )
      .replace(
        'gl_FragColor.rgb += ( surf.emission * state.throughputColor );',
        'if ( pathRoughness < 0.3 ) gl_FragColor.rgb += ( surf.emission * state.throughputColor );',
      );
    if (lit === guarded || !lit.includes('pathRoughness < 0.3')) console.warn('path tracer: emission patch did not apply');
    m.fragmentShader = lit;
    m.needsUpdate = true;
  }
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
    // Outdoor/hallway backdrops are emissive stand-ins; the tracer's sky lights the window properly.
    registry.interiorOnly.forEach((o) => hide(o, false));
    // The tracer can't digest empty geometry or screen-space line helpers.
    scene.traverse((o) => {
      const m = o as THREE.Mesh & { isLine2?: boolean; isLineSegments2?: boolean };
      if (!m.isMesh || !o.visible) return;
      const pos = m.geometry?.attributes?.position;
      const mat = m.material as THREE.Material & { isLineMaterial?: boolean };
      if (!pos || pos.count === 0 || m.isLine2 || m.isLineSegments2 || mat?.isLineMaterial) hide(o, false);
    });

    // Close the room: raise every cut-away wall (and the ceiling) so light behaves as in the real
    // room, then make whatever the raster view cuts away invisible to camera rays only.
    const seeThrough = new Map<THREE.Material, THREE.Material>();
    const matte = (root: THREE.Object3D) =>
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || Array.isArray(m.material)) return;
        const orig = m.material;
        let clone = seeThrough.get(orig);
        if (!clone) {
          clone = orig.clone();
          (clone as THREE.Material & { matte?: boolean }).matte = true;
          seeThrough.set(orig, clone);
        }
        m.material = clone;
        restore.push(() => (m.material = orig));
      });
    registry.walls.forEach((w) => {
      if (w.lowered) matte(w.group);
      w.setFull(true);
      restore.push(() => w.setFull(false));
    });
    if (registry.ceiling) {
      if (!registry.ceiling.visible) matte(registry.ceiling);
      hide(registry.ceiling, true);
    }
    restore.push(() => seeThrough.forEach((c) => c.dispose()));
    // One-sided sheets (ceiling, walls) let shadow rays through from their front; make plain painted
    // surfaces solid to light. Glossy physical materials (clearcoat, glass) stay as authored: shading
    // their back faces yields NaNs on some GPUs.
    const sided = new Set<THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material])
        if (mat.side === THREE.FrontSide && !(mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) sided.add(mat);
    });
    sided.forEach((mat) => (mat.side = THREE.DoubleSide));
    restore.push(() => sided.forEach((mat) => (mat.side = THREE.FrontSide)));

    const prevEnv = scene.environment;
    const prevBg = scene.background;
    const exposure = exposureFor(design);
    // Sky seen through the windows at its real luminance (the room is closed, so it only enters there).
    scene.environment = studio(skyNits(design.lighting));
    scene.background = backgroundColor(exposure);
    restore.push(() => {
      scene.environment = prevEnv;
      scene.background = prevBg;
    });

    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = exposure;
    clampUniform.value = CLAMP_WHITES / exposure;
    metering.state = 'pending';
    metering.ev = Math.pow(2, design.lighting.exposure);
    restore.push(() => {
      gl.toneMapping = THREE.NoToneMapping;
      gl.toneMappingExposure = 1;
    });

    let cancelled = false;
    // The tracer is only downloaded the first time someone asks for a render.
    const t = window.setTimeout(async () => {
      try {
        const { WebGLPathTracer, DenoiseMaterial } = await import('three-gpu-pathtracer');
        denoise ??= new FullScreenQuad(new DenoiseMaterial()) as DenoiseQuad;
        if (cancelled) return;
        const tracer = (pt.current ??= new WebGLPathTracer(gl));
        tracer.tiles.set(2, 2);
        tracer.bounces = 5;
        tracer.transmissiveBounces = 8;
        tracer.filterGlossyFactor = 0.35;
        tracer.minSamples = 3;
        tracer.renderDelay = 0;
        tracer.fadeDuration = 0;
        tracer.renderToCanvasCallback = (target, renderer, quad) => {
          const samples = tracer.samples;
          const auto = renderer.autoClear;
          renderer.autoClear = false;
          if (samples < 1) quad.render(renderer);
          else {
            // Edge-aware denoise that relaxes as samples converge. Noise falls as 1/√samples, so
            // the edge threshold tracks it; it works on raw scene values, hence the exposure.
            const k = Math.sqrt(16 / Math.max(samples, 16));
            denoise.material.map = target.texture;
            denoise.material.sigma = Math.max(1.5, 5 * k);
            denoise.material.threshold = Math.max(0.1, 0.5 * k) / renderer.toneMappingExposure;
            denoise.material.kSigma = 1;
            denoise.render(renderer);
          }
          renderer.autoClear = auto;
        };
        tracer.pausePathTracing = false;
        tracer.renderScale = Math.min(window.devicePixelRatio, 1.5) / gl.getPixelRatio();
        // Let the overlay paint before the (blocking) BVH build.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (cancelled) return;
        installSeeThrough(tracer);
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

/**
 * The raster view's metered exposure assumes roughly one bounce of light; a path-traced room carries
 * every bounce, so it reads 2–4× brighter. After a few samples the tracer meters its own image
 * (like a camera's auto-exposure), then restarts with that exposure and a matching backdrop.
 */
const metering = { state: 'idle' as 'idle' | 'pending' | 'done', ev: 1 };
const METER_SAMPLES = 6;
/** The raster view puts a white wall near this value before tone mapping. */
const METER_KEY = 0.8;

function meter(tracer: WebGLPathTracer, gl: THREE.WebGLRenderer, bg: THREE.Color): number | null {
  const target = tracer.target;
  const { width, height } = target;
  const px = new Float32Array(width * height * 4);
  gl.readRenderTargetPixels(target, 0, 0, width, height, px);
  const lum: number[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40000)));
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (!Number.isFinite(r + g + b)) continue;
      // Skip the backdrop behind the room.
      if (Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b) < 0.02 * (bg.r + bg.g + bg.b)) continue;
      lum.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  if (lum.length < 100) return null;
  lum.sort((a, b) => a - b);
  const p85 = lum[Math.floor(lum.length * 0.85)];
  return p85 > 0 ? METER_KEY / p85 : null;
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
    if (metering.state === 'pending' && tracer.samples >= METER_SAMPLES) {
      metering.state = 'done';
      const bg = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0, 0, 0);
      // Measured with display exposure 1: the tracer's buffer holds raw scene values.
      const exposure = meter(tracer, gl, bg);
      if (exposure) {
        gl.toneMappingExposure = exposure * metering.ev;
        clampUniform.value = CLAMP_WHITES / gl.toneMappingExposure;
        scene.background = backgroundColor(gl.toneMappingExposure);
        tracer.updateEnvironment();
        tracer.reset();
      }
    }
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
