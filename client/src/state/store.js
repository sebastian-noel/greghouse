import { create } from 'zustand';
import { LS_STATE } from '../config.js';

// strips runtime-only fields (decoded audio buffers etc.) before any snapshot
// leaves the client — localStorage, PUT, or WS sync (v1 cleanPlant)
export function cleanPlant(p) {
  const o = {};
  for (const k in p) if (k[0] !== '_') o[k] = p[k];
  return o;
}

export const isHardwarePlant = p => !!(p.isHardware || p.isReal);

let nextId = 1;
export const uid = () => 'p' + (nextId++);
export function bumpIds(plants) {
  (plants || []).forEach(p => { const n = parseInt(String(p.id).slice(1), 10); if (n >= nextId) nextId = n + 1; });
}

// default garden: Greg mirrors the real probe, the others are simulated
export function seedPlants() {
  return [
    { id: uid(), name: 'Greg', speciesId: 'ficus', potColor: '#C2C3C7', isReal: true, moisture: 62, soilMoisture: 62, mood: 'happy', createdAt: Date.now() },
    { id: uid(), name: 'Carl', speciesId: 'cactus', potColor: '#FFCCAA', isReal: false, moisture: 40, mood: 'happy', createdAt: Date.now() },
    { id: uid(), name: 'Bas', speciesId: 'basil', potColor: '#FF77A8', isReal: false, moisture: 70, mood: 'happy', createdAt: Date.now() }
  ];
}

let toastSeq = 0;

export const useStore = create((set, get) => ({
  // ---- boot / identity
  boot: 'loading',        // loading | offline | enter | ready
  config: null,
  session: { token: localStorage.getItem('gh_token') || null, user: null },
  isVisitor: false,
  visitorName: '',
  skin: null,             // avatar palette {H,B,T,F}
  garden: { id: null, seed: null, dims: null, ownerName: null },
  weather: { loaded: false, tempF: null, humidity: null, error: null },

  // ---- garden state (v1 `state`)
  plants: [],
  messages: [],           // plant messages (persisted, synced) — kept ≤200
  peopleChat: [],         // ephemeral people messages (never persisted)
  muted: false,
  speed: 1,
  syncRev: 0, syncKind: 'lite',

  // ---- live
  peers: {},              // id -> {id,name,skin,isOwner} (positions live in runtime)
  netId: null,
  bubbles: {},            // plantId -> {text, ts}
  peerBubbles: {},        // peerId ('self' for me) -> {text, ts}
  telemetry: {},          // plantId -> {soil, ts, ageMs, stale}

  // ---- ui
  chatOpen: false, unread: 0,
  modal: null,            // {type:'card',id} | {type:'wizard'} | {type:'share',url}
  debugOpen: false,
  toasts: [],

  isOwner() { const s = get(); return !s.isVisitor && !!s.session.user; },

  set, // escape hatch for hooks (v1 mutated freely; we funnel through set)

  toast(text, ms) {
    const id = ++toastSeq;
    set(s => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), ms || 2600);
  },

  setPlants(plants, kind) {
    set(s => ({ plants, syncRev: s.syncRev + 1, syncKind: kind === 'full' ? 'full' : s.syncKind }));
    get().saveState();
  },

  updatePlant(id, patch, kind) {
    const plants = get().plants.map(p => (p.id === id ? { ...p, ...patch } : p));
    get().setPlants(plants, kind);
  },

  // plant message (persisted + synced). Also raises the plant's bubble (8s).
  addPlantMessage(m) {
    if (!m) return;
    set(s => {
      if (s.messages.some(x => x.id === m.id)) return {};
      return {
        messages: [...s.messages, m].slice(-200),
        bubbles: { ...s.bubbles, [m.plantId]: { text: m.text, ts: m.ts } },
        unread: s.chatOpen ? s.unread : s.unread + 1,
      };
    });
  },

  // ephemeral people chat (v1 renderPeerChat) + speech bubble (6s)
  addPeopleChat(entry) {
    set(s => ({
      peopleChat: [...s.peopleChat, entry].slice(-200),
      peerBubbles: { ...s.peerBubbles, [entry.peerKey]: { text: entry.text, ts: entry.ts } },
      unread: s.chatOpen ? s.unread : s.unread + 1,
    }));
  },

  showBubble(plantId, text) {
    set(s => ({ bubbles: { ...s.bubbles, [plantId]: { text, ts: Date.now() } } }));
  },

  setChat(open) { set(s => ({ chatOpen: open, unread: open ? 0 : s.unread })); },
  openModal(modal) { set({ modal }); },
  closeModal() { set({ modal: null }); },

  setTelemetry(plantId, entry) {
    set(s => ({ telemetry: { ...s.telemetry, [plantId]: entry } }));
  },

  // ---- localStorage persistence (owner only; v1 schema) ----
  saveState() {
    const s = get();
    if (s.isVisitor) return;
    s.set(x => ({ syncRev: x.syncRev + 1 })); // mirror owner changes to server + viewers
    try {
      localStorage.setItem(LS_STATE, JSON.stringify({
        plants: s.plants.map(cleanPlant),
        messages: s.messages.slice(-50),
        muted: s.muted, speed: s.speed,
      }));
    } catch (e) {
      // quota exceeded (large voice data URLs) — fail silently, server copy authoritative
      console.warn('greenhouse: could not save state', e);
    }
  },

  loadLocalState() {
    try {
      const raw = localStorage.getItem(LS_STATE);
      if (!raw) return null;
      const st = JSON.parse(raw);
      bumpIds(st.plants);
      return st;
    } catch (e) { return null; }
  },
}))
