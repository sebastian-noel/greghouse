// blits the art-resolution world canvas (drawn once per seed inside genWorld,
// on the same rng stream) scaled up with smoothing off — v1 drawWorld's blit
import { useEffect, useRef } from 'react';
import { ART } from '../../engine/worldgen.js';

export default function BgCanvas({ world }) {
  const ref = useRef(null);
  useEffect(() => {
    const bg = ref.current;
    if (!bg || !world.canvas) return;
    bg.width = world.pxW; bg.height = world.pxH;
    const dctx = bg.getContext('2d');
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(world.canvas, 0, 0, world.W * ART, world.H * ART, 0, 0, world.pxW, world.pxH);
  }, [world]);
  return <canvas id="bg" ref={ref} style={{ width: world.pxW, height: world.pxH }} />;
}
