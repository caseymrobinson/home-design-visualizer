import * as THREE from 'three';

/**
 * Keep every lit surface's output finite and below half-float range. A sun glint on polished
 * brass or a mirror edge can exceed 65 504 — the max of the 16-bit buffers used for the
 * bounce-light capture and post effects — and one Inf there floods the whole room with white.
 */
const GUARD = `
  outgoingLight = clamp(outgoingLight, vec3(0.0), vec3(20000.0));
  if (any(isnan(outgoingLight))) outgoingLight = vec3(0.0);
`;
if (!THREE.ShaderChunk.opaque_fragment.includes('20000.0')) {
  THREE.ShaderChunk.opaque_fragment = GUARD + THREE.ShaderChunk.opaque_fragment;
}
