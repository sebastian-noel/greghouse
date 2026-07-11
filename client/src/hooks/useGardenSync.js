// Networking + owner→server sync, v1 protocol verbatim:
//   → join {name, skin, x, y, dir} · pos · chat {text}
//   → garden-lite {g:{plants:[{id,moisture,mood}], messages}} (owner)
//   → garden-full {g:{seed,dims,plants,messages}} (owner) · need-full
//   ← welcome {id, peers} · peer-join/leave · pos · chat (echoes sender)
//   ← garden-lite/full {g} — visitors apply; owners take hardware LIGHT only
import { useEffect } from 'react';
import { api } from '../api/http.js';
import { useStore, cleanPlant, isHardwarePlant } from '../state/store.js';
import { char, net, peerPos } from '../state/runtime.js';

export function sendNet(o) { try { net.socket.send(JSON.stringify(o)); } catch (e) { /* not connected */ } }

/* ----- owner → server sync (lite = moisture/mood/chat, full = structural) ----- */
let syncTimer = null;
function gardenPayload() {
  const s = useStore.getState();
  return { seed: s.garden.seed, dims: s.garden.dims,
    plants: s.plants.map(cleanPlant), messages: s.messages.slice(-50) };
}
async function doSync() {
  const s = useStore.getState();
  const kind = s.syncKind;
  useStore.setState({ syncKind: 'lite' });
  if (kind === 'full') {
    const g = gardenPayload();
    if (net.connected) sendNet({ t: 'garden-full', g });
    try { await api('PUT', '/api/garden/mine', g); } catch (e) { console.warn('garden save failed', e); }
  } else {
    if (net.connected) {
      sendNet({ t: 'garden-lite', g: {
        plants: s.plants.map(p => ({ id: p.id, moisture: p.moisture, mood: p.mood })),
        messages: s.messages.slice(-50)
      } });
    } else {
      try { await api('PUT', '/api/garden/mine', gardenPayload()); } catch (e) { /* retried on next sync */ }
    }
  }
}
export function scheduleSync(kind) {
  const s = useStore.getState();
  if (s.isVisitor || !s.garden.id) return;
  if (kind === 'full') useStore.setState({ syncKind: 'full' });
  clearTimeout(syncTimer);
  syncTimer = setTimeout(doSync, 600);
}

/* ----- incoming garden updates ----- */
const seenMsgs = new Set();
export function seedSeen() { useStore.getState().messages.forEach(m => seenMsgs.add(m.id)); }

function applyMessages(msgs) {
  const store = useStore.getState();
  for (const m of msgs || []) {
    if (seenMsgs.has(m.id)) continue;
    seenMsgs.add(m.id);
    store.addPlantMessage(m);
  }
}

function applyGardenLite(g) {
  const store = useStore.getState();
  let missing = false;
  const plants = store.plants.map(p => ({ ...p }));
  for (const np of g.plants || []) {
    const p = plants.find(x => x.id === np.id);
    if (!p) { missing = true; continue; }
    // hardware plants: soil/mood come exclusively from the telemetry poller
    if (isHardwarePlant(p)) { if (np.light != null) p.light = np.light; continue; }
    if (np.moisture != null) p.moisture = np.moisture;
    if (np.mood) p.mood = np.mood;
  }
  useStore.setState({ plants });
  applyMessages(g.messages);
  if (missing || (g.plants && g.plants.length && g.plants.length !== plants.length)) sendNet({ t: 'need-full' });
}

// owner-side: the server's garden-lite only carries LIGHT for hardware plants now
function applyHardwareLite(g) {
  const store = useStore.getState();
  let changed = false;
  const plants = store.plants.map(p => {
    const np = (g && g.plants || []).find(x => x.id === p.id);
    if (!np || !isHardwarePlant(p) || np.light == null) return p;
    changed = true;
    return { ...p, light: np.light };
  });
  if (changed) useStore.setState({ plants });
}

function applyGardenFull(g) {
  const store = useStore.getState();
  const ids = new Set((g.plants || []).map(p => p.id));
  let plants = store.plants.filter(p => ids.has(p.id));
  for (const np of g.plants || []) {
    const p = plants.find(x => x.id === np.id);
    if (p) {
      if (p.voiceGeneralUrl !== np.voiceGeneralUrl) delete p._buf_general;
      if (p.voiceThirstyUrl !== np.voiceThirstyUrl) delete p._buf_thirsty;
      Object.assign(p, np);
    } else plants.push({ ...np });
  }
  useStore.setState({ plants: [...plants] });
  applyMessages(g.messages);
}

function handleNet(m) {
  const store = useStore.getState();
  switch (m.t) {
    case 'welcome': {
      useStore.setState({ netId: m.id, peers: {} });
      for (const k of Object.keys(peerPos)) delete peerPos[k];
      const peers = {};
      for (const p of m.peers) {
        peers[p.id] = p;
        peerPos[p.id] = { x: p.x, y: p.y, tx: p.x, ty: p.y, dir: p.dir || 1 };
      }
      useStore.setState({ peers });
      break;
    }
    case 'peer-join': {
      const p = m.peer;
      if (!p || p.id === store.netId) break;
      peerPos[p.id] = { x: p.x, y: p.y, tx: p.x, ty: p.y, dir: p.dir || 1 };
      useStore.setState(s => ({ peers: { ...s.peers, [p.id]: p } }));
      break;
    }
    case 'pos': { const p = peerPos[m.id]; if (p) { p.tx = m.x; p.ty = m.y; p.dir = m.dir; } break; }
    case 'chat': {
      const isSelf = m.id === store.netId;
      store.addPeopleChat({
        peerKey: isSelf ? 'self' : m.id,
        name: m.name, text: m.text, isOwner: m.isOwner, ts: Date.now(),
      });
      break;
    }
    case 'peer-leave': {
      delete peerPos[m.id];
      useStore.setState(s => { const peers = { ...s.peers }; delete peers[m.id]; return { peers }; });
      break;
    }
    case 'garden-full': if (store.isVisitor) applyGardenFull(m.g); break;
    case 'garden-lite': if (store.isVisitor) applyGardenLite(m.g); else applyHardwareLite(m.g); break;
  }
}

function netConnect() {
  const s = useStore.getState();
  if (!s.garden.id) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let url = `${proto}://${location.host}/ws?g=${encodeURIComponent(s.garden.id)}`;
  if (!s.isVisitor && s.session.token) url += '&token=' + encodeURIComponent(s.session.token);
  const ws = new WebSocket(url);
  net.socket = ws;
  ws.onopen = () => {
    net.connected = true;
    const st = useStore.getState();
    sendNet({ t: 'join', name: st.isVisitor ? st.visitorName : (st.session.user?.name || 'gardener'),
      skin: st.skin, x: Math.round(char.x), y: Math.round(char.y), dir: char.dir });
    if (st.isVisitor) sendNet({ t: 'need-full' }); // catch up after reconnects
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } handleNet(m); };
  ws.onclose = () => {
    net.connected = false;
    useStore.setState({ peers: {} });
    for (const k of Object.keys(peerPos)) delete peerPos[k];
    if (useStore.getState().boot === 'ready') setTimeout(netConnect, 2500); // auto-reconnect
  };
}

export function useGardenSync() {
  const boot = useStore(s => s.boot);
  const gid = useStore(s => s.garden.id);
  const syncRev = useStore(s => s.syncRev);
  const isVisitor = useStore(s => s.isVisitor);

  useEffect(() => {
    if (boot !== 'ready' || !gid) return;
    netConnect();
    return () => {
      const sock = net.socket;
      net.socket = null; net.connected = false;
      try { sock?.close(); } catch (e) { /* noop */ }
    };
  }, [boot, gid]);

  // every store change that called saveState() bumps syncRev → debounce a sync
  useEffect(() => {
    if (boot !== 'ready' || isVisitor || syncRev === 0) return;
    scheduleSync();
  }, [syncRev, boot, isVisitor]);
}
