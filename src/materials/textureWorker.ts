/// <reference lib="webworker" />
import type { TileSpec } from '../lib/types';
import { generateStipple, generateTerry, generateWood } from './procedural';
import { generateTileMaps } from './tileTexture';

export type TextureJob =
  | { kind: 'tile'; spec: TileSpec; image?: ImageData | null }
  | { kind: 'wood'; key: string; paint?: string }
  | { kind: 'stipple' }
  | { kind: 'terry' };

self.onmessage = (e: MessageEvent<{ id: number; job: TextureJob }>) => {
  const { id, job } = e.data;
  const maps =
    job.kind === 'tile'
      ? generateTileMaps(job.spec, job.image)
      : job.kind === 'wood'
        ? generateWood(job.key, job.paint)
        : job.kind === 'stipple'
          ? generateStipple()
          : generateTerry();
  (self as unknown as Worker).postMessage({ id, maps }, [maps.albedo.buffer, maps.normal.buffer, maps.rough.buffer]);
};
