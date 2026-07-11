// v1 world: pannable canvas map, absolutely-positioned sprite DOM, and THE
// game loop — keyboard/joystick movement with axis-separated collision,
// camera hard-locked to the gardener while walking (drag pans freely),
// proximity audio gain driven every frame, peers lerped k=min(1,dt*12).
// Movement never touches React state.
import { useEffect, useMemo, useRef } from 'react';
import { useStore, isHardwarePlant } from '../../state/store.js';
import { char, cam, net, peerPos, dragMovedRef } from '../../state/runtime.js';
import { getWorld, TILE, walkableAt } from '../../engine/worldgen.js';
import { audio, ensureProximityGain, playClip, stopActivePlayback } from '../../engine/audio.js';
import { sendNet } from '../../hooks/useGardenSync.js';
import { waterPlant } from '../../state/actions.js';
import BgCanvas from './BgCanvas.jsx';
import PlantSprite from './PlantSprite.jsx';
import Gardener from './Gardener.jsx';
import Peer from './Peer.jsx';
import TouchJoystick from './TouchJoystick.jsx';

const PROX_RANGE = TILE * 4.5; // volume 0 at this edge, 1 on top of the plant
const WATER_RANGE = TILE * 2.2; // must actually walk up to a plant to water it

export default function WorldViewport() {
  const seed = useStore(s => s.garden.seed);
  const dims = useStore(s => s.garden.dims);
  const peers = useStore(s => s.peers);
  const isVisitor = useStore(s => s.isVisitor);
  const showBubble = useStore(s => s.showBubble);
  const world = useMemo(() => getWorld(seed, dims, window.innerWidth, window.innerHeight), [seed, dims]);
  const wrapRef = useRef(null);
  const worldRef = useRef(null);
  const charRef = useRef(null);
  const peerRefs = useRef({});
  const hintRef = useRef(null);

  /* ----- camera helpers (direct DOM, like v1) ----- */
  function clampPan() {
    cam.panX = Math.min(0, Math.max(cam.viewW - world.pxW, cam.panX));
    cam.panY = Math.min(0, Math.max(cam.viewH - world.pxH, cam.panY));
  }
  function applyPan() {
    if (worldRef.current)
      worldRef.current.style.transform = `translate3d(${Math.round(cam.panX)}px, ${Math.round(cam.panY)}px, 0)`;
  }
  function centerCamOnChar(smooth) {
    const w = worldRef.current;
    if (smooth && w) { w.classList.add('smooth'); setTimeout(() => w.classList.remove('smooth'), 400); }
    cam.panX = cam.viewW / 2 - char.x;
    cam.panY = cam.viewH / 2 - char.y;
    clampPan(); applyPan();
  }

  /* ----- spawn + initial camera ----- */
  useEffect(() => {
    const wrap = wrapRef.current;
    cam.viewW = wrap.clientWidth; cam.viewH = wrap.clientHeight;
    const spot = world.spots[0];
    char.x = spot ? spot.px : world.pxW / 2;
    char.y = spot ? spot.py + TILE : world.pxH / 2;
    if (isVisitor) {
      // scatter visitors a little so avatars don't stack on spawn
      for (let i = 0; i < 10; i++) {
        const nx = char.x + (Math.random() - 0.5) * TILE * 4;
        const ny = char.y + (Math.random() - 0.5) * TILE * 3;
        if (walkableAt(world, nx, ny)) { char.x = nx; char.y = ny; break; }
      }
    }
    centerCamOnChar(false);
    // feed avatars pan to a plant (v1 panTo with .smooth transition)
    cam.panToFn = (px, py) => {
      const w = worldRef.current;
      if (w) { w.classList.add('smooth'); setTimeout(() => w.classList.remove('smooth'), 400); }
      cam.panX = cam.viewW / 2 - px;
      cam.panY = cam.viewH / 2 - py;
      clampPan(); applyPan();
    };
    const onResize = () => {
      cam.viewW = wrap.clientWidth; cam.viewH = wrap.clientHeight;
      centerCamOnChar(false);
    };
    window.addEventListener('resize', onResize);
    const hintTimer = setTimeout(() => { if (hintRef.current) hintRef.current.style.display = 'none'; }, 3500);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(hintTimer); };
  }, [world, isVisitor]);

  /* ----- keyboard (v1: global listeners, inputs exempt) ----- */
  useEffect(() => {
    const down = e => {
      const k = e.key.toLowerCase();
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      if (k === 'e' && !typing) {
        const wid = useStore.getState().nearWaterId;
        if (wid) { waterPlant(wid); e.preventDefault(); }
        return;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        if (typing) return;
        char.keys[k] = true; e.preventDefault();
      }
    };
    const up = e => { char.keys[e.key.toLowerCase()] = false; };
    const blur = () => { char.keys = {}; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  /* ----- drag panning (v1 initDrag; >7px marks dragMoved to suppress clicks) ----- */
  useEffect(() => {
    const wrap = wrapRef.current;
    let down = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const onDown = e => {
      if (e.target.closest('#joy')) return;
      down = true; dragMovedRef.current = false;
      sx = e.clientX; sy = e.clientY; ox = cam.panX; oy = cam.panY;
      wrap.classList.add('dragging');
    };
    const onMove = e => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 7) dragMovedRef.current = true;
      cam.panX = ox + dx; cam.panY = oy + dy;
      clampPan(); applyPan();
    };
    const end = () => { down = false; wrap.classList.remove('dragging'); };
    wrap.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      wrap.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [world]);

  /* ----- THE game loop ----- */
  useEffect(() => {
    let raf;
    char.lastRAF = 0;

    function positionChar() {
      const el = charRef.current;
      if (!el) return;
      el.style.left = char.x + 'px';
      el.style.top = char.y + 'px';
      el.classList.toggle('flip', char.dir < 0);
    }

    function proximityCheck() {
      const s = useStore.getState();
      let best = null, bestD = 1e9;         // nearest plant (drives audio)
      let water = null, waterD = 1e9;       // nearest SIMULATED plant (owner → water)
      let warn = null, warnD = 1e9;         // nearest THIRSTY plant (visitor → warn)
      s.plants.slice(0, 6).forEach((p, i) => {
        const spot = world.spots[i];
        if (!spot) return;
        const d = Math.hypot(spot.px - char.x, (spot.py - TILE) - char.y);
        if (d < bestD) { bestD = d; best = p; }
        if (!isHardwarePlant(p) && d < waterD) { waterD = d; water = p; }
        if (p.mood === 'thirsty' && d < warnD) { warnD = d; warn = p; }
      });

      // publish near-plant ids only when they change (never per-frame churn).
      // owner gets the water target; visitor gets the warn target (any thirsty plant).
      const wid = (!s.isVisitor && water && waterD < WATER_RANGE) ? water.id : null;
      if (wid !== char.waterId) { char.waterId = wid; useStore.setState({ nearWaterId: wid }); }
      const nid = (s.isVisitor && warn && warnD < WATER_RANGE) ? warn.id : null;
      if (nid !== char.warnId) { char.warnId = nid; useStore.setState({ nearWarnId: nid }); }

      if (best && bestD < PROX_RANGE) {
        // vol: 0 at trigger edge, 1 right on top — driven live every frame
        const vol = Math.max(0, 1 - bestD / PROX_RANGE);
        ensureProximityGain();
        if (audio.proximityGain) audio.proximityGain.gain.value = s.muted ? 0 : vol;

        if (audio.near !== best.id) {
          audio.near = best.id;
          const sp = document.getElementById('sp-' + best.id);
          if (sp) { sp.classList.add('wave'); setTimeout(() => sp.classList.remove('wave'), 600); }
          playClip(best, best.mood === 'thirsty' ? 'thirsty' : 'general');
          showBubble(best.id, best.mood === 'thirsty' ? '(thirsty!)' : 'hi!');
        }
      } else {
        if (audio.proximityGain) audio.proximityGain.gain.value = 0;
        if (audio.near) stopActivePlayback();
        audio.near = null;
      }
    }

    const loop = ts => {
      raf = requestAnimationFrame(loop);
      if (!char.lastRAF) char.lastRAF = ts;
      const dt = Math.min(0.05, (ts - char.lastRAF) / 1000); char.lastRAF = ts;

      let vx = 0, vy = 0;
      if (char.keys['arrowleft'] || char.keys['a']) vx -= 1;
      if (char.keys['arrowright'] || char.keys['d']) vx += 1;
      if (char.keys['arrowup'] || char.keys['w']) vy -= 1;
      if (char.keys['arrowdown'] || char.keys['s']) vy += 1;
      if (char.joy.active) { vx += char.joy.x; vy += char.joy.y; }

      const mag = Math.hypot(vx, vy);
      if (char.watering) { vx = 0; vy = 0; } // rooted in place while pouring
      if (mag > 0.05 && !char.watering) {
        vx /= Math.max(mag, 1); vy /= Math.max(mag, 1);
        if (vx < -0.05) char.dir = -1; else if (vx > 0.05) char.dir = 1;
        const nx = char.x + vx * char.speed * dt;
        const ny = char.y + vy * char.speed * dt;
        // axis-separated so you slide along obstacles
        if (walkableAt(world, nx, char.y)) char.x = nx;
        if (walkableAt(world, char.x, ny)) char.y = ny;
        positionChar();
        centerCamOnChar(false); // camera hard-locked while walking (v1)
      } else if (char.watering) {
        positionChar(); // keep the body facing the plant while rooted & pouring
      }
      // runs every frame — not just while moving — so gain updates in real time
      proximityCheck();

      // glide remote avatars toward their latest position
      const k = Math.min(1, dt * 12);
      for (const id in peerPos) {
        const p = peerPos[id];
        p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
        const el = peerRefs.current[id];
        if (el) {
          el.style.left = p.x + 'px';
          el.style.top = p.y + 'px';
          el.classList.toggle('flip', p.dir < 0);
        }
      }

      // send ours, throttled
      if (net.connected) {
        const moved = char.x !== net.lastX || char.y !== net.lastY || char.dir !== net.lastDir;
        if (moved && ts - net.lastPosSent > 90) {
          net.lastPosSent = ts; net.lastX = char.x; net.lastY = char.y; net.lastDir = char.dir;
          sendNet({ t: 'pos', x: Math.round(char.x), y: Math.round(char.y), dir: char.dir });
        }
      }
    };
    positionChar();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  const plants = useStore(s => s.plants);

  return (
    <div id="room-wrap" ref={wrapRef}>
      <div id="world" ref={worldRef} style={{ width: world.pxW, height: world.pxH }}>
        <BgCanvas world={world} />
        {plants.slice(0, 6).map((p, i) => (
          <PlantSprite key={p.id} plant={p} spot={world.spots[i]} index={i}
            stale={isHardwarePlant(p) ? undefined : undefined} />
        ))}
        {Object.values(peers).map(p => (
          <Peer key={p.id} peer={p}
            bindRef={el => { if (el) peerRefs.current[p.id] = el; else delete peerRefs.current[p.id]; }} />
        ))}
        <Gardener bindRef={charRef} />
      </div>
      <div id="hint" ref={hintRef}>WASD / arrows to walk — get close to a plant to hear it</div>
      <TouchJoystick />
    </div>
  );
}
