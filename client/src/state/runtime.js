// Mutable per-frame state that deliberately lives OUTSIDE React (v1's `char`,
// `world.panX/panY`, `net.peers` positions). The rAF game loop reads/writes
// this 60×/s; putting it in the store would re-render the world every frame.
export const char = {
  x: 0, y: 0, dir: 1, speed: 170, // px/sec (v1)
  keys: {}, joy: { x: 0, y: 0, active: false },
  near: null, waterId: null, watering: false, lastRAF: 0,
};

export const cam = { panX: 0, panY: 0, viewW: 0, viewH: 0 };

export const peerPos = {}; // id -> {x, y, tx, ty, dir}

export const net = { socket: null, connected: false, lastPosSent: 0, lastX: 0, lastY: 0, lastDir: 1 };

export let dragMovedRef = { current: false }; // drag suppresses the next plant click (v1 dragMoved)
