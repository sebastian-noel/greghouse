// v1 world generation + tile drawing, ported verbatim. Seeded rng so every
// device generates the identical garden world. Gen and draw share one rng
// stream in the same order — do not reorder calls or worlds will diverge.
import { BG } from './palette.js';

export const ART = 16, SCALE = 3, TILE = ART * SCALE;
export const T_GRASS = 0, T_PATH = 1, T_WATER = 2, T_PAD = 3;

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function genWorld(opts) {
  const world = { W: 0, H: 0, tiles: null, spots: [], trees: [], decor: [], fences: [], pxW: 0, pxH: 0, seed: 0 };
  world.seed = opts.seed != null ? opts.seed : ((Math.random() * 0x7fffffff) | 0);
  const worldRng = mulberry32(world.seed);
  const rnd = (a, b) => a + worldRng() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));

  if (opts.dims && opts.dims.W && opts.dims.H) {
    // shared garden: reuse the owner's dimensions so the map is identical everywhere
    world.W = opts.dims.W; world.H = opts.dims.H;
  } else {
    const viewW = opts.viewW || 1200, viewH = opts.viewH || 800;
    world.W = Math.max(12, Math.floor((viewW * 2) / TILE));
    world.H = Math.max(10, Math.floor((viewH * 2) / TILE));
    while (world.W * world.H * TILE * TILE > viewW * viewH * 4 && (world.W > 12 || world.H > 10)) {
      if (world.W * TILE / viewW > world.H * TILE / viewH && world.W > 12) world.W--; else if (world.H > 10) world.H--; else world.W--;
    }
  }
  world.pxW = world.W * TILE; world.pxH = world.H * TILE;
  world.tiles = new Array(world.W * world.H).fill(T_GRASS);
  const W = world.W, H = world.H;
  const tIdx = (x, y) => y * W + x;
  const tGet = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : world.tiles[tIdx(x, y)];

  /* pond — bottom right, sized to the map, kept off the path band */
  const prx = Math.min(rndi(3, 5), Math.max(2, Math.floor(W / 6)));
  const pry = Math.min(rndi(2, 3), Math.max(2, Math.floor(H / 7)));
  const pcx = W - prx - rndi(2, 3), pcy = H - pry - rndi(1, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - pcx) / prx, dy = (y - pcy) / pry;
    if (dx * dx + dy * dy <= 1 && x > 1 && y > 1 && x < W - 1 && y < H - 1) world.tiles[tIdx(x, y)] = T_WATER;
  }

  /* winding path, 2 tiles thick, left edge to right edge */
  let r = Math.round(H * 0.42);
  for (let x = 0; x < W; x++) {
    for (const yy of [r, r + 1]) {
      if (tGet(x, yy) === T_GRASS) world.tiles[tIdx(x, yy)] = T_PATH;
    }
    r += rndi(-1, 1);
    r = Math.max(3, Math.min(H - 7, r));
  }

  /* plant spots: 3 columns x 2 rows regions, snapped to clear grass */
  const regs = [];
  for (const fy of [0.32, 0.62]) for (const fx of [0.28, 0.5, 0.72])
    regs.push([Math.round(W * fx), Math.round(H * fy)]);
  let minDist = 3;
  const okSpot = (x, y) => {
    if (x < 2 || y < 2 || x > W - 4 || y > H - 4) return false;
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
      const t = tGet(x + dx, y + dy);
      if (t === T_WATER || t === T_PATH || t === T_PAD) return false;
    }
    for (const s of world.spots) { if (Math.abs(s.tx - x) + Math.abs(s.ty - y) < minDist) return false; }
    return true;
  };
  const placeSpot = (x, y) => {
    world.spots.push({ tx: x, ty: y, px: (x + 1) * TILE, py: (y + 2) * TILE - 6 });
    for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 2; xx++) world.tiles[tIdx(xx, yy)] = T_PAD;
  };
  for (const [gx, gy] of regs) {
    let placed = false;
    for (let rad = 0; rad < 12 && !placed; rad++) {
      for (let dy = -rad; dy <= rad && !placed; dy++) for (let dx = -rad; dx <= rad && !placed; dx++) {
        const x = gx + dx, y = gy + dy;
        if (okSpot(x, y)) { placeSpot(x, y); placed = true; }
      }
    }
  }
  if (world.spots.length < 6) {
    minDist = 2;
    for (let y = 2; y <= H - 4 && world.spots.length < 6; y++)
      for (let x = 2; x <= W - 4 && world.spots.length < 6; x++)
        if (okSpot(x, y)) placeSpot(x, y);
  }
  if (world.spots.length < 6) {
    const okLoose = (x, y) => {
      if (x < 1 || y < 1 || x > W - 3 || y > H - 3) return false;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
        if (tGet(x + dx, y + dy) !== T_GRASS) return false;
      for (const s of world.spots) { if (Math.abs(s.tx - x) + Math.abs(s.ty - y) < 2) return false; }
      return true;
    };
    for (let y = 1; y <= H - 3 && world.spots.length < 6; y++)
      for (let x = 1; x <= W - 3 && world.spots.length < 6; x++)
        if (okLoose(x, y)) placeSpot(x, y);
  }

  /* trees: border band + a few interior */
  const treeOk = (x, y) => {
    if (tGet(x, y) !== T_GRASS) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = tGet(x + dx, y + dy); if (t === T_PATH || t === T_PAD || t === T_WATER) return false;
    }
    for (const tr of world.trees) { if (Math.abs(tr.tx - x) < 2 && Math.abs(tr.ty - y) < 2) return false; }
    return true;
  };
  for (let x = 0; x < W; x += 1 + rndi(0, 1)) { if (treeOk(x, 0)) world.trees.push({ tx: x, ty: 0 }); }
  for (let x = 0; x < W; x += 1 + rndi(0, 2)) { if (worldRng() < 0.7 && treeOk(x, H - 1)) world.trees.push({ tx: x, ty: H - 1 }); }
  for (let y = 2; y < H - 2; y += 2) {
    if (worldRng() < 0.6 && treeOk(0, y)) world.trees.push({ tx: 0, ty: y });
    if (worldRng() < 0.6 && treeOk(W - 1, y)) world.trees.push({ tx: W - 1, ty: y });
  }
  let tries = 10;
  while (tries-- > 0) {
    const x = rndi(3, W - 4), y = rndi(3, H - 4);
    if (world.trees.filter(t => t.ty > 1 && t.ty < H - 2 && t.tx > 1 && t.tx < W - 2).length >= 6) break;
    if (treeOk(x, y)) world.trees.push({ tx: x, ty: y });
  }

  /* fences: two short runs below the top tree line, gap at the path */
  const fy = 2;
  const clearFence = x => tGet(x, fy) === T_GRASS && !world.trees.some(t => t.tx === x && Math.abs(t.ty - fy) < 2);
  let run = [];
  for (let x = 2; x < W - 2; x++) {
    if (clearFence(x) && run.length < 6) run.push(x);
    else { if (run.length >= 3) world.fences.push({ y: fy, xs: [...run] }); run = []; if (world.fences.length >= 2) break; }
  }
  if (run.length >= 3 && world.fences.length < 2) world.fences.push({ y: fy, xs: [...run] });

  /* decor: bushes, stones, mushrooms near pond, one stump */
  const decorOk = (x, y) => tGet(x, y) === T_GRASS &&
    ![T_PATH, T_PAD, T_WATER].some(tt => [tGet(x + 1, y), tGet(x - 1, y), tGet(x, y + 1), tGet(x, y - 1)].includes(tt)) &&
    !world.trees.some(t => Math.abs(t.tx - x) < 2 && Math.abs(t.ty - y) < 2) &&
    !world.decor.some(d => Math.abs(d.tx - x) < 2 && Math.abs(d.ty - y) < 2);
  let placedB = 0, guard = 60;
  while (placedB < 5 && guard-- > 0) { const x = rndi(2, W - 3), y = rndi(2, H - 3); if (decorOk(x, y)) { world.decor.push({ tx: x, ty: y, kind: 'bush' }); placedB++; } }
  let placedS = 0; guard = 60;
  while (placedS < 5 && guard-- > 0) { const x = rndi(2, W - 3), y = rndi(2, H - 3); if (decorOk(x, y)) { world.decor.push({ tx: x, ty: y, kind: 'stone' }); placedS++; } }
  let placedM = 0; guard = 80;
  while (placedM < 3 && guard-- > 0) {
    const x = rndi(2, W - 3), y = rndi(2, H - 3);
    const nearWater = [tGet(x + 1, y), tGet(x - 1, y), tGet(x, y + 1), tGet(x, y - 1), tGet(x + 2, y), tGet(x - 2, y)].includes(T_WATER);
    if (tGet(x, y) === T_GRASS && nearWater && !world.decor.some(d => d.tx === x && d.ty === y)) { world.decor.push({ tx: x, ty: y, kind: 'mushroom' }); placedM++; }
  }
  guard = 40;
  while (guard-- > 0) { const x = rndi(2, W - 3), y = rndi(2, H - 3); if (decorOk(x, y)) { world.decor.push({ tx: x, ty: y, kind: 'stump' }); break; } }

  // drawing continues on the SAME rng stream (v1 called drawWorld right here)
  world.canvas = drawWorldArt(world, worldRng);
  return world;
}

/* pixel helpers (art resolution) */
function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
function fillEllipsePx(ctx, cx, cy, rx, ry, c) {
  ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) ctx.fillRect(cx + x, cy + y, 1, 1);
  }
}

function drawWorldArt(world, worldRng) {
  const rnd = (a, b) => a + worldRng() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const W = world.W, H = world.H;
  const tIdx = (x, y) => y * W + x;
  const tGet = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : world.tiles[tIdx(x, y)];
  const off = document.createElement('canvas');
  off.width = W * ART; off.height = H * ART;
  const c = off.getContext('2d');

  /* --- ground tiles --- */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = world.tiles[tIdx(x, y)], ox = x * ART, oy = y * ART;
    if (t === T_GRASS || t === T_PAD) {
      const base = worldRng() < 0.55 ? BG.g1 : (worldRng() < 0.5 ? BG.g2 : BG.g3);
      c.fillStyle = base; c.fillRect(ox, oy, ART, ART);
      for (let i = 0; i < 4; i++) px(c, ox + rndi(0, 15), oy + rndi(0, 15), worldRng() < 0.5 ? BG.g2 : BG.g3);
      if (t === T_GRASS) {
        const roll = worldRng();
        if (roll < 0.12) { const tx = ox + rndi(2, 12), ty = oy + rndi(3, 12);
          px(c, tx, ty, BG.tuft); px(c, tx + 1, ty - 1, BG.tuft); px(c, tx + 2, ty, BG.tuft); }
        else if (roll < 0.17) { const fx = ox + rndi(3, 12), fyy = oy + rndi(3, 12);
          const col = worldRng() < 0.5 ? BG.fpink : BG.fyellow;
          px(c, fx, fyy, col); px(c, fx + 1, fyy, BG.fwhite); px(c, fx, fyy + 1, BG.fwhite); }
        else if (roll < 0.21) { fillEllipsePx(c, ox + 8, oy + 8, 5, 3, BG.patch); }
      }
    } else if (t === T_PATH) {
      c.fillStyle = BG.p1; c.fillRect(ox, oy, ART, ART);
      for (let i = 0; i < 3; i++) px(c, ox + rndi(1, 14), oy + rndi(1, 14), BG.p2);
      if (worldRng() < 0.25) fillEllipsePx(c, ox + rndi(4, 11), oy + rndi(4, 11), 2, 1, BG.pstone);
      if (tGet(x, y - 1) !== T_PATH) { c.fillStyle = BG.p2; c.fillRect(ox, oy, ART, 1); }
      if (tGet(x, y + 1) !== T_PATH) { c.fillStyle = BG.p2; c.fillRect(ox, oy + ART - 1, ART, 1); }
      if (tGet(x - 1, y) !== T_PATH) { c.fillStyle = BG.p2; c.fillRect(ox, oy, 1, ART); }
      if (tGet(x + 1, y) !== T_PATH) { c.fillStyle = BG.p2; c.fillRect(ox + ART - 1, oy, 1, ART); }
    } else if (t === T_WATER) {
      c.fillStyle = BG.w1; c.fillRect(ox, oy, ART, ART);
      if (tGet(x, y - 1) !== T_WATER) { c.fillStyle = BG.sand; c.fillRect(ox, oy, ART, 2); c.fillStyle = BG.w2; c.fillRect(ox, oy + 2, ART, 1); }
      if (tGet(x, y + 1) !== T_WATER) { c.fillStyle = BG.w2; c.fillRect(ox, oy + ART - 2, ART, 2); }
      if (tGet(x - 1, y) !== T_WATER) { c.fillStyle = BG.sand; c.fillRect(ox, oy, 2, ART); }
      if (tGet(x + 1, y) !== T_WATER) { c.fillStyle = BG.sand; c.fillRect(ox + ART - 2, oy, 2, ART); }
      if (worldRng() < 0.3) { const ry = oy + rndi(4, 11); c.fillStyle = BG.ripple; c.fillRect(ox + rndi(2, 8), ry, 4, 1); }
    }
  }
  /* soil pads (drawn over grass base for soft edges) */
  for (const s of world.spots) {
    const ox = s.tx * ART, oy = s.ty * ART, w = 2 * ART, h = 2 * ART;
    c.fillStyle = BG.soil; c.fillRect(ox + 1, oy + 1, w - 2, h - 2);
    c.fillStyle = BG.soild;
    c.fillRect(ox + 1, oy + 1, w - 2, 1); c.fillRect(ox + 1, oy + h - 2, w - 2, 1);
    c.fillRect(ox + 1, oy + 1, 1, h - 2); c.fillRect(ox + w - 2, oy + 1, 1, h - 2);
    for (let i = 0; i < 10; i++) px(c, ox + 2 + rndi(0, w - 5), oy + 2 + rndi(0, h - 5), BG.soild);
  }
  /* lily pads */
  const waterTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (world.tiles[tIdx(x, y)] === T_WATER && tGet(x + 1, y) === T_WATER && tGet(x, y + 1) === T_WATER) waterTiles.push([x, y]);
  for (let i = 0; i < Math.min(2, waterTiles.length); i++) {
    const [x, y] = waterTiles[rndi(0, waterTiles.length - 1)];
    const cx = x * ART + 8, cy = y * ART + 8;
    fillEllipsePx(c, cx, cy, 4, 3, BG.lily); fillEllipsePx(c, cx + 1, cy, 1, 1, BG.w1); px(c, cx - 2, cy - 2, BG.lilyd);
  }

  /* --- objects, painter-sorted by base y --- */
  const objs = [];
  for (const f of world.fences) objs.push({ y: f.y, draw: () => {
    const yy = f.y * ART;
    c.fillStyle = BG.fencel; c.fillRect(f.xs[0] * ART + 2, yy + 7, (f.xs.length - 1) * ART + 12, 2);
    for (const fx of f.xs) {
      c.fillStyle = BG.fence; c.fillRect(fx * ART + 6, yy + 3, 3, 10);
      c.fillStyle = BG.fenced; c.fillRect(fx * ART + 8, yy + 3, 1, 10);
      px(c, fx * ART + 6, yy + 2, BG.fencel);
    }
  } });
  for (const d of world.decor) objs.push({ y: d.ty, draw: () => {
    const bx = d.tx * ART + 8, by = d.ty * ART + 13;
    if (d.kind === 'bush') {
      fillEllipsePx(c, bx, by - 4, 7, 5, BG.c1); fillEllipsePx(c, bx - 1, by - 6, 5, 3, BG.c2);
      px(c, bx - 3, by - 7, BG.c3); px(c, bx + 2, by - 5, BG.c3);
    } else if (d.kind === 'stone') {
      fillEllipsePx(c, bx, by - 2, 3, 2, BG.stone); c.fillStyle = BG.stoned; c.fillRect(bx - 3, by - 1, 7, 1); px(c, bx - 1, by - 3, '#B5B0A6');
    } else if (d.kind === 'stump') {
      fillEllipsePx(c, bx, by - 3, 4, 3, BG.trunk); fillEllipsePx(c, bx, by - 4, 3, 2, '#A87D4B'); px(c, bx, by - 4, BG.trunkd);
      c.fillStyle = BG.trunkd; c.fillRect(bx - 4, by - 1, 8, 2);
    } else if (d.kind === 'mushroom') {
      c.fillStyle = BG.mstem; c.fillRect(bx - 1, by - 4, 3, 4);
      fillEllipsePx(c, bx, by - 5, 4, 2, BG.mcap); px(c, bx - 2, by - 6, BG.mdot); px(c, bx + 1, by - 5, BG.mdot);
    }
  } });
  for (const t of world.trees) objs.push({ y: t.ty + 0.5, draw: () => {
    const bx = t.tx * ART + 8, by = (t.ty + 1) * ART;
    c.fillStyle = BG.trunk; c.fillRect(bx - 2, by - 9, 4, 9);
    c.fillStyle = BG.trunkd; c.fillRect(bx + 1, by - 9, 1, 9);
    c.fillStyle = BG.trunkd; c.fillRect(bx - 3, by - 1, 6, 1);
    fillEllipsePx(c, bx, by - 16, 13, 10, BG.c1);
    fillEllipsePx(c, bx - 2, by - 19, 10, 7, BG.c2);
    for (let i = 0; i < 9; i++) px(c, bx - 2 + rndi(-7, 9), by - 19 + rndi(-5, 6), BG.c3);
  } });
  objs.sort((a, b) => a.y - b.y);
  for (const o of objs) o.draw();

  return off; // art-resolution canvas; BgCanvas blits it scaled with smoothing off
}

/* which pixel position is walkable (not water, tree, or out of bounds) — v1 */
export function walkableAt(world, px, py) {
  if (px < TILE * 0.4 || py < TILE * 0.4 || px > world.pxW - TILE * 0.4 || py > world.pxH - TILE * 0.4) return false;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const t = (tx < 0 || ty < 0 || tx >= world.W || ty >= world.H) ? -1 : world.tiles[ty * world.W + tx];
  if (t === T_WATER) return false;
  for (const tr of world.trees) { if (tr.tx === tx && (tr.ty === ty || tr.ty === ty + 1)) return false; }
  return true;
}

const worldCache = new Map();
export function getWorld(seed, dims, viewW, viewH) {
  const key = seed + '/' + (dims ? dims.W + 'x' + dims.H : 'auto');
  if (!worldCache.has(key)) worldCache.set(key, genWorld({ seed, dims, viewW, viewH }));
  return worldCache.get(key);
}
