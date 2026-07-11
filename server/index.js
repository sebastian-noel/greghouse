// the greenhouse v2 — Node server (social layer)
//
// Protocol and behavior ported from v1 (Projects/Testt/greenhouse/server).
// v2 deltas: the sensor POST is gone (410) — soil telemetry lives in the
// cloud stack; the sim loop only invents LIGHT for hardware plants, never
// soil ("no fake soil, ever"); the client is a built React app (client/dist).
//
// DEV ONLY: this server also mounts a mock of the cloud telemetry contract
// (POST /telemetry, GET /telemetry/latest) generating fake wandering soil
// readings so hardware plants are testable before the real stack exists.
// Point TELEMETRY_BASE (client config + firmware) at the real URL to switch.

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'client', 'dist');
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const TELEMETRY_KEY = process.env.TELEMETRY_KEY || '';

/* ---------- persistence: one JSON file, debounced writes ---------- */
let db = { users: {}, sessions: {}, gardens: {} };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { /* first run */ }

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(db), err => {
      if (err) console.error('could not write data.json:', err.message);
    });
  }, 500);
}

const rid = n => crypto.randomBytes(n).toString('base64url');

function getUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const uid = db.sessions[token];
  return uid ? db.users[uid] : null;
}
function newSession(uid) {
  const token = rid(24);
  db.sessions[token] = uid;
  persist();
  return token;
}
function gardenOf(uid) {
  return Object.values(db.gardens).find(g => g.ownerId === uid) || null;
}
const publicGarden = g => ({
  id: g.id, ownerName: g.ownerName, seed: g.seed, dims: g.dims,
  plants: g.plants, messages: g.messages
});
const isHardwarePlant = p => !!(p.isHardware || p.isReal);

/* ---------- http api ---------- */
const app = express();
app.use(express.json({ limit: '20mb' })); // voice clips ride along as data URLs

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID, devLogin: !GOOGLE_CLIENT_ID });
});

app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'google sign-in not configured' });
  const cred = req.body && req.body.credential;
  if (!cred) return res.status(400).json({ error: 'missing credential' });
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred));
    if (!r.ok) throw new Error('token rejected');
    const info = await r.json();
    if (info.aud !== GOOGLE_CLIENT_ID) throw new Error('token audience mismatch');
    const uid = 'g:' + info.sub;
    db.users[uid] = { id: uid, name: info.given_name || info.name || 'gardener', email: info.email || '' };
    const token = newSession(uid);
    res.json({ token, user: db.users[uid] });
  } catch (e) {
    res.status(401).json({ error: 'google sign-in failed: ' + e.message });
  }
});

// only available when GOOGLE_CLIENT_ID is unset, so the app is testable out of the box
app.post('/api/auth/dev', (req, res) => {
  if (GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'dev login disabled when google auth is configured' });
  const name = String((req.body && req.body.name) || '').trim().slice(0, 16);
  if (!name) return res.status(400).json({ error: 'name required' });
  const uid = 'dev:' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  db.users[uid] = { id: uid, name, email: '' };
  const token = newSession(uid);
  res.json({ token, user: db.users[uid] });
});

app.get('/api/me', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in' });
  const g = gardenOf(user.id);
  res.json({ user, gardenId: g ? g.id : null });
});

app.get('/api/garden/mine', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in' });
  const g = gardenOf(user.id);
  res.json(g ? publicGarden(g) : null);
});

app.put('/api/garden/mine', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in' });
  const { seed, dims, plants, messages } = req.body || {};
  if (typeof seed !== 'number' || !dims || !Array.isArray(plants))
    return res.status(400).json({ error: 'bad garden payload' });
  let g = gardenOf(user.id);
  if (!g) {
    g = { id: rid(8), ownerId: user.id };
    db.gardens[g.id] = g;
  }
  Object.assign(g, {
    ownerName: user.name, seed,
    dims: { W: dims.W | 0, H: dims.H | 0 },
    plants, messages: (messages || []).slice(-50), updatedAt: Date.now()
  });
  persist();
  res.json(publicGarden(g));
});

/* ---------- hardware setup (wifi the greenhouse module should join) ---------- */
app.get('/api/garden/mine/hardware', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in' });
  const g = gardenOf(user.id);
  if (!g) return res.status(404).json({ error: 'no garden yet' });
  const hw = g.hardware || {};
  res.json({ wifiSsid: hw.wifiSsid || '', hasWifi: !!hw.wifiSsid });
});

app.put('/api/garden/mine/hardware', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'not signed in' });
  const g = gardenOf(user.id);
  if (!g) return res.status(404).json({ error: 'no garden yet' });
  const wifiSsid = String((req.body && req.body.wifiSsid) || '').slice(0, 32);
  const wifiPass = String((req.body && req.body.wifiPass) || '').slice(0, 64);
  if (!wifiSsid) return res.status(400).json({ error: 'ssid required' });
  g.hardware = { wifiSsid, wifiPass };
  persist();
  res.json({ wifiSsid, hasWifi: true });
});

// module-facing: the ESP32 pulls the wifi it should join and saves it to flash.
// no auth — the module only knows its garden id (fine for a LAN/tunnel hobby server).
app.get('/api/garden/:id/hardware', (req, res) => {
  const g = db.gardens[req.params.id];
  if (!g) return res.status(404).json({ error: 'garden not found' });
  const hw = g.hardware || {};
  res.json({ wifiSsid: hw.wifiSsid || '', wifiPass: hw.wifiPass || '' });
});

app.get('/api/garden/:id', (req, res) => {
  const g = db.gardens[req.params.id];
  if (!g) return res.status(404).json({ error: 'garden not found' });
  res.json(publicGarden(g));
});

// lightweight, no voice/audio payload — meant for small/embedded clients (e.g. a CYD display).
// v2: NO soil/mood for hardware plants — the probe + shared thresholds own those.
app.get('/api/garden/:id/plant/:pid', (req, res) => {
  const g = db.gardens[req.params.id];
  if (!g) return res.status(404).json({ error: 'garden not found' });
  const p = (g.plants || []).find(p => p.id === req.params.pid);
  if (!p) return res.status(404).json({ error: 'plant not found' });
  // voiceRev fingerprints the current recording so embedded clients can
  // auto-redownload when a new voice is saved (md5 of ~200KB is sub-ms)
  const voiceRev = p.voiceGeneralUrl
    ? crypto.createHash('md5').update(p.voiceGeneralUrl).digest('hex').slice(0, 8) : '';
  const out = { id: p.id, name: p.name, speciesId: p.speciesId, potColor: p.potColor,
                light: Math.round(p.light ?? 50),
                isHardware: isHardwarePlant(p),
                hasVoice: !!p.voiceGeneralUrl, voiceRev };
  if (!isHardwarePlant(p)) {
    out.soilMoisture = Math.round(p.soilMoisture ?? p.moisture ?? 65);
    out.mood = p.mood || 'happy';
  }
  res.json(out);
});

// v1 firmware hitting the old ingest path fails loudly in its serial logs
app.post('/api/garden/:id/plant/:pid/sensor', (req, res) => {
  res.status(410).json({ error: 'gone — sensor ingestion moved to the cloud telemetry endpoint (POST {TELEMETRY_BASE}/telemetry)' });
});

// the plant's recorded voice, transcoded via ffmpeg to raw 8kHz 8-bit unsigned
// mono PCM — directly playable by an ESP32's DAC. speechnorm evens out mic levels.
app.get('/api/garden/:id/plant/:pid/voice.pcm', (req, res) => {
  const g = db.gardens[req.params.id];
  if (!g) return res.status(404).json({ error: 'garden not found' });
  const p = (g.plants || []).find(p => p.id === req.params.pid);
  if (!p) return res.status(404).json({ error: 'plant not found' });
  const m = (p.voiceGeneralUrl || '').match(/^data:audio\/[^;]+;.*?base64,(.+)$/s);
  if (!m) return res.status(404).json({ error: 'no voice recorded' });

  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
    '-af', 'speechnorm', '-f', 'u8', '-ar', '8000', '-ac', '1', 'pipe:1']);
  const chunks = [];
  ff.stdout.on('data', c => chunks.push(c));
  ff.on('error', () => res.status(500).json({ error: 'ffmpeg not available' }));
  ff.on('close', code => {
    if (res.headersSent) return;
    if (code !== 0 || chunks.length === 0) return res.status(500).json({ error: 'transcode failed' });
    res.set('Content-Type', 'application/octet-stream');
    res.send(Buffer.concat(chunks));
  });
  ff.stdin.on('error', () => {}); // ignore EPIPE if ffmpeg bails early
  ff.stdin.end(Buffer.from(m[1], 'base64'));
});

/* ---------- telemetry mock (DEV) ----------
   Same contract as the friend's cloud stack:
     POST /telemetry               {gardenId, plantId, soilMoisture}
     GET  /telemetry/latest?g&p  → {soilMoisture, ts, ageMs} | 404
   A real probe POSTing here owns the value for 10s; otherwise a fake random
   walk keeps hardware plants alive during development.               */
const telem = new Map(); // "g#p" -> { soil, ts, real, phase }

app.post('/telemetry', (req, res) => {
  if (TELEMETRY_KEY && req.headers['x-gh-key'] !== TELEMETRY_KEY)
    return res.status(403).json({ error: 'bad key' });
  const { gardenId, plantId, soilMoisture } = req.body || {};
  const okId = s => typeof s === 'string' && s.length > 0 && s.length <= 32;
  if (!okId(gardenId) || !okId(plantId) || !Number.isFinite(soilMoisture))
    return res.status(400).json({ error: 'bad payload' });
  const soil = Math.max(0, Math.min(100, Math.round(soilMoisture)));
  const ts = Date.now();
  const cur = telem.get(gardenId + '#' + plantId);
  telem.set(gardenId + '#' + plantId, { soil, ts, real: true, phase: cur?.phase || 0 });
  res.json({ ok: true, soilMoisture: soil, ts });
});

app.get('/telemetry/latest', (req, res) => {
  const key = String(req.query.g || '') + '#' + String(req.query.p || '');
  const e = telem.get(key);
  if (!e) return res.status(404).json({ error: 'no readings' });
  res.json({ soilMoisture: e.soil, ts: e.ts, ageMs: Date.now() - e.ts });
});

if (process.env.MOCK_TELEMETRY !== '0') {
  setInterval(() => {
    const now = Date.now();
    for (const g of Object.values(db.gardens)) {
      for (const p of g.plants || []) {
        if (!isHardwarePlant(p)) continue;
        const key = g.id + '#' + p.id;
        const e = telem.get(key) || { soil: 55, ts: 0, real: false, phase: Math.random() * Math.PI * 2 };
        if (e.real && now - e.ts < 10000) continue; // a real probe owns this plant
        e.phase += 0.02;
        const drift = (45 + Math.sin(e.phase) * 30 - e.soil) * 0.05;
        e.soil = Math.max(5, Math.min(95, Math.round(e.soil + drift + (Math.random() * 4 - 2))));
        e.ts = now; e.real = false;
        telem.set(key, e);
      }
    }
  }, 2000);
  console.log('telemetry mock: fake soil readings every 2s (MOCK_TELEMETRY=0 disables)');
}

/* ---------- static: the built React client ---------- */
app.use(express.static(DIST));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/telemetry')) return next();
  const index = path.join(DIST, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(503).send('client not built yet — run: npm run build');
});

/* ---------- realtime: one room per garden ---------- */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map(); // gardenId -> Set<ws>

const HEX = /^#[0-9A-Fa-f]{6}$/;
function cleanSkin(s) {
  const d = { H: '#AB5236', F: '#FFCCAA', B: '#29ADFF', T: '#FFEC27' };
  if (s && typeof s === 'object')
    for (const k of Object.keys(d)) if (HEX.test(s[k] || '')) d[k] = s[k];
  return d;
}
function roomSend(gid, msg, except) {
  const set = rooms.get(gid);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const c of set)
    if (c !== except && c.readyState === 1 && c.meta.joined) c.send(data);
}
const peerInfo = ws => ({
  id: ws.meta.id, name: ws.meta.name, skin: ws.meta.skin, isOwner: ws.meta.isOwner,
  x: ws.meta.x, y: ws.meta.y, dir: ws.meta.dir
});

wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const gid = q.get('g');
  const garden = gid && db.gardens[gid];
  if (!garden) { ws.close(4004, 'garden not found'); return; }
  const uid = db.sessions[q.get('token') || ''] || null;
  const isOwner = !!uid && garden.ownerId === uid;

  let set = rooms.get(gid);
  if (!set) { set = new Set(); rooms.set(gid, set); }
  if (set.size >= 32) { ws.close(4005, 'garden is full'); return; }
  set.add(ws);
  ws.meta = { id: rid(6), gid, isOwner, joined: false, name: '', skin: null, x: 0, y: 0, dir: 1, lastChat: 0 };

  ws.on('message', raw => {
    if (raw.length > 5_000_000) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const meta = ws.meta;

    if (m.t === 'join' && !meta.joined) {
      meta.name = String(m.name || '').trim().slice(0, 16) || 'visitor';
      meta.skin = cleanSkin(m.skin);
      meta.x = +m.x || 0; meta.y = +m.y || 0; meta.dir = m.dir === -1 ? -1 : 1;
      meta.joined = true;
      const peers = [...set].filter(c => c !== ws && c.meta.joined).map(peerInfo);
      ws.send(JSON.stringify({ t: 'welcome', id: meta.id, peers }));
      roomSend(gid, { t: 'peer-join', peer: peerInfo(ws) }, ws);
      return;
    }
    if (!meta.joined) return;

    if (m.t === 'pos') {
      meta.x = +m.x || 0; meta.y = +m.y || 0; meta.dir = m.dir === -1 ? -1 : 1;
      roomSend(gid, { t: 'pos', id: meta.id, x: meta.x, y: meta.y, dir: meta.dir }, ws);

    } else if (m.t === 'chat') {
      const now = Date.now();
      if (now - meta.lastChat < 600) return;
      meta.lastChat = now;
      const text = String(m.text || '').trim().slice(0, 140);
      if (!text) return;
      roomSend(gid, { t: 'chat', id: meta.id, name: meta.name, isOwner: meta.isOwner, text });

    } else if (m.t === 'garden-lite' && meta.isOwner) {
      // frequent updates: moisture/mood + recent messages.
      // hardware plants are skipped — their soil comes from the telemetry
      // store; a stale owner tab must never clobber the live probe.
      const g = m.g || {};
      const isHw = np => {
        const p = (garden.plants || []).find(x => x.id === np.id);
        return p && isHardwarePlant(p);
      };
      for (const np of g.plants || []) {
        if (!isHw(np)) {
          const p = (garden.plants || []).find(x => x.id === np.id);
          if (p) { p.moisture = np.moisture; p.mood = np.mood; }
        }
      }
      if (Array.isArray(g.messages)) garden.messages = g.messages.slice(-50);
      garden.updatedAt = Date.now();
      persist();
      roomSend(gid, { t: 'garden-lite',
        g: { ...g, plants: (g.plants || []).filter(np => !isHw(np)) } }, ws);

    } else if (m.t === 'garden-full' && meta.isOwner) {
      // structural changes: plant added/removed, voices, names
      const g = m.g || {};
      if (Array.isArray(g.plants)) garden.plants = g.plants;
      if (Array.isArray(g.messages)) garden.messages = g.messages.slice(-50);
      if (typeof g.seed === 'number') garden.seed = g.seed;
      if (g.dims) garden.dims = { W: g.dims.W | 0, H: g.dims.H | 0 };
      garden.updatedAt = Date.now();
      persist();
      roomSend(gid, { t: 'garden-full', g: publicGarden(garden) }, ws);

    } else if (m.t === 'need-full') {
      ws.send(JSON.stringify({ t: 'garden-full', g: publicGarden(garden) }));
    }
  });

  ws.on('close', () => {
    set.delete(ws);
    if (!set.size) rooms.delete(gid);
    if (ws.meta.joined) roomSend(gid, { t: 'peer-leave', id: ws.meta.id });
  });
});

/* ---------- light sim for hardware plants ----------
   v2: soil simulation (the v1 "phantom gardener") is DELETED — no fake soil
   in the product path, ever. Soil comes from the telemetry endpoint. Light
   has no sensor, so the server still simulates it and pushes garden-lite. */
let simTicks = 0;
setInterval(() => {
  simTicks++;
  for (const g of Object.values(db.gardens)) {
    const hw = (g.plants || []).filter(isHardwarePlant);
    if (!hw.length) continue;
    for (const p of hw) {
      // light tracks the real time of day (sunrise 6am, peak noon) plus passing clouds
      const now = new Date();
      const hour = now.getHours() + now.getMinutes() / 60;
      const sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
      const target = 8 + sun * 82;
      if (typeof p.light !== 'number') p.light = target;
      p.light += (target - p.light) * 0.2 + (Math.random() - 0.5) * 6;
      p.light = Math.max(0, Math.min(100, p.light));
    }
    roomSend(g.id, { t: 'garden-lite', g: { plants: hw.map(p => ({
      id: p.id, light: Math.round(p.light) })) } });
  }
  if (simTicks % 12 === 0) persist(); // sim readings aren't precious — write once a minute
}, 5000);

server.listen(PORT, () => {
  console.log(`greenhouse server → http://localhost:${PORT}`);
  console.log(GOOGLE_CLIENT_ID
    ? 'google sign-in: enabled'
    : 'google sign-in: NOT configured (dev login active) — set GOOGLE_CLIENT_ID to enable');
});
