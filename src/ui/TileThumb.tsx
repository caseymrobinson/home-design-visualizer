import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { TileSpec } from '../lib/types';
import { tilePreview } from '../materials/library';

/** A rendered swatch of a tile field. `span` is how many inches of the field it shows. */
export function TileThumb({ spec, size = 160, span }: { spec: TileSpec; size?: number; span?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    tilePreview(spec, size, span).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [spec, size, span]);
  return (
    <motion.div
      className={`tile-thumb ${src ? '' : 'shimmer'}`}
      style={src ? { backgroundImage: `url(${src})` } : undefined}
      initial={false}
      animate={{ opacity: 1 }}
    />
  );
}
