import type * as THREE from 'three';

/** Live scene handles shared between the room, the environment probe and interactions. */
export const registry = {
  /** Wall groups that animate down in dollhouse view. */
  walls: new Map<number, { group: THREE.Group; lowered: boolean; setFull: (full: boolean) => void }>(),
  ceiling: null as THREE.Object3D | null,
  /** Objects visible only in the raster renderer (e.g. planar reflectors). */
  rasterOnly: new Set<THREE.Object3D>(),
  /** Stand-ins visible only to the path tracer. */
  traceOnly: new Set<THREE.Object3D>(),
  /** Interaction helpers hidden from reflections, env capture & final renders. */
  helpers: new Set<THREE.Object3D>(),
  /** Things only meant to be seen from inside the room (outdoor backdrop, hallway). */
  interiorOnly: new Set<THREE.Object3D>(),
  envDirty: 0,
};

export const markEnvDirty = () => {
  registry.envDirty = performance.now();
};

