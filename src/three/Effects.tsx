import { Bloom, EffectComposer, N8AO, Outline, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, Effect, EffectPass, ToneMappingMode } from 'postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Design } from '../lib/types';
import { FLAGS } from '../lib/flags';
import { exposureFor } from './lightUnits';
import { registry } from './registry';

const has = (k: string) => !FLAGS.fxl || FLAGS.fxl.includes(k);

class ExposureEffect extends Effect {
  constructor() {
    super(
      'ExposureEffect',
      /* glsl */ `
        uniform float exposure;
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          vec3 c = inputColor.rgb;
          // One NaN/Inf texel (a degenerate normal, a grazing-angle BRDF) would otherwise be smeared
          // across the whole frame by bloom. Drop it here, and cap fireflies while we're at it.
          if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
          outputColor = vec4(min(c * exposure, vec3(48.0)), inputColor.a);
        }
      `,
      { blendFunction: BlendFunction.SET, uniforms: new Map([['exposure', new THREE.Uniform(1)]]) },
    );
  }
  set exposure(v: number) {
    this.uniforms.get('exposure')!.value = v;
  }
}

export function Effects({ design }: { design: Design }) {
  const camera = useThree((s) => s.camera);
  const exposure = useMemo(() => new ExposureEffect(), []);
  // Its own pass so bloom & tone mapping see exposed values rather than raw photometric ones.
  const exposurePass = useMemo(() => new EffectPass(camera, exposure), [camera, exposure]);
  const target = exposureFor(design);
  // Adapt like an eye/camera over ~½s instead of snapping, in log space so big changes feel even.
  useFrame((_, dt) => {
    const cur = registry.exposure || target;
    const next = Math.exp(Math.log(cur) + (Math.log(target) - Math.log(cur)) * (1 - Math.exp(-dt * 5)));
    registry.exposure = Math.abs(next - target) / target < 0.002 ? target : next;
    exposure.exposure = registry.exposure;
  });
  return (
    <EffectComposer multisampling={FLAGS.msaa} enableNormalPass={false} autoClear={false}>
      {has('ao') ? <N8AO aoRadius={0.3} distanceFalloff={0.8} intensity={1.6} quality="high" halfRes={false} aoSamples={16} denoiseSamples={8} /> : <></>}
      <primitive object={exposurePass} />
      {has('bloom') ? <Bloom luminanceThreshold={1} luminanceSmoothing={0.15} intensity={0.22} mipmapBlur radius={0.6} /> : <></>}
      {has('outline') ? <Outline blur edgeStrength={4} pulseSpeed={0} visibleEdgeColor={0xd08a58} hiddenEdgeColor={0x8a6a52} xRay={false} width={1400} /> : <></>}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      {has('vig') ? <Vignette offset={0.3} darkness={0.32} /> : <></>}
    </EffectComposer>
  );
}
