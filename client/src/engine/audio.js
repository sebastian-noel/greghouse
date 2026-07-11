// v1 audio, verbatim semantics: one AudioContext unlocked by a user gesture,
// a persistent proximityGain node whose gain is driven EVERY FRAME by the
// game loop (volume = 1 - d/PROX_RANGE), voice clips decoded once and cached
// on the plant object (_buf_*), signature chirps for voiceless plants.
import { hash } from './sprites.js';

export const audio = {
  actx: null, unlocked: false, muted: false,
  proximityGain: null,
  activePlayback: null, // { source, plantId }
  loopTimer: null,
  near: null,           // plantId currently in range (set by the game loop)
};

export function unlockAudio() {
  try {
    if (!audio.actx) audio.actx = new (window.AudioContext || window.webkitAudioContext)();
    audio.actx.resume();
    const b = audio.actx.createBuffer(1, 220, 22050);
    const src = audio.actx.createBufferSource(); src.buffer = b; src.connect(audio.actx.destination); src.start(0);
    audio.unlocked = true;
  } catch (e) { audio.unlocked = false; }
}

export function ensureProximityGain() {
  if (!audio.proximityGain && audio.actx) {
    audio.proximityGain = audio.actx.createGain();
    audio.proximityGain.gain.value = 0;
    audio.proximityGain.connect(audio.actx.destination);
  }
}

// chirp routes through proximityGain so its volume tracks distance too
export function chirp(plant, sad) {
  if (!audio.unlocked || audio.muted || !audio.actx) return;
  ensureProximityGain();
  const actx = audio.actx;
  const dest = audio.proximityGain || actx.destination;
  const base = 260 + (hash(plant.id) % 240);
  const seq = sad ? [[base, 0], [base * 0.72, 0.16]] : [[base, 0], [base * 1.34, 0.14]];
  for (const [f, t] of seq) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, actx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.12, actx.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.14);
    o.connect(g); g.connect(dest);
    o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.16);
  }
}

// a soft "pour + splash" for watering: decaying filtered noise with a few
// droplet blips on top. Direct to destination (a deliberate action, not
// distance-attenuated like the ambient plant voices).
export function waterSound() {
  if (!audio.unlocked || audio.muted || !audio.actx) return;
  const actx = audio.actx, now = actx.currentTime;
  const dur = 0.5, n = Math.floor(actx.sampleRate * dur);
  const nb = actx.createBuffer(1, n, actx.sampleRate);
  const data = nb.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = actx.createBufferSource(); src.buffer = nb;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const ng = actx.createGain(); ng.gain.value = 0.07;
  src.connect(lp); lp.connect(ng); ng.connect(actx.destination);
  src.start(now); src.stop(now + dur);
  for (const [t, f] of [[0.04, 900], [0.2, 1240], [0.34, 1020]]) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + t);
    g.gain.exponentialRampToValueAtTime(0.08, now + t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.12);
    o.connect(g); g.connect(actx.destination);
    o.start(now + t); o.stop(now + t + 0.14);
  }
}

// a short rising two-tone "attention" chime for the owner's warn banner
export function notifySound() {
  if (!audio.unlocked || audio.muted || !audio.actx) return;
  const actx = audio.actx, now = actx.currentTime;
  for (const [f, t] of [[880, 0], [1174.66, 0.12]]) { // A5 → D6
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + t);
    g.gain.exponentialRampToValueAtTime(0.16, now + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
    o.connect(g); g.connect(actx.destination);
    o.start(now + t); o.stop(now + t + 0.24);
  }
}

export function stopActivePlayback() {
  clearTimeout(audio.loopTimer); audio.loopTimer = null;
  if (!audio.activePlayback) return;
  try { audio.activePlayback.source.stop(); } catch (e) { /* already stopped */ }
  audio.activePlayback = null;
}

// decode data URL → AudioBuffer once per plant/kind, cache on the plant object
async function decodeClip(plant, kind) {
  const cacheKey = '_buf_' + kind;
  if (plant[cacheKey]) return plant[cacheKey];
  const url = kind === 'thirsty' ? plant.voiceThirstyUrl : plant.voiceGeneralUrl;
  if (!url) return null;
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await audio.actx.decodeAudioData(arr);
    plant[cacheKey] = buf;
    return buf;
  } catch (e) { return null; }
}

export async function playClip(plant, kind) {
  if (audio.muted || !audio.unlocked || !audio.actx) return;
  ensureProximityGain();
  const buf = await decodeClip(plant, kind);
  if (!buf) { chirp(plant, kind === 'thirsty'); return; }

  // if player left range while we were decoding, bail
  if (audio.near !== plant.id) return;

  stopActivePlayback();
  const source = audio.actx.createBufferSource();
  source.buffer = buf;
  source.connect(audio.proximityGain);  // routed through live gain node
  source.start();
  audio.activePlayback = { source, plantId: plant.id };
  source.onended = () => {
    if (audio.activePlayback?.plantId === plant.id) audio.activePlayback = null;
    if (audio.near === plant.id) {
      audio.loopTimer = setTimeout(() => {
        if (audio.near === plant.id)
          playClip(plant, plant.mood === 'thirsty' ? 'thirsty' : 'general');
      }, 1000 + Math.random() * 4000);
    }
  };
}

// card play buttons force full volume regardless of where the gardener stands
export async function playClipAtFullVolume(plant, kind) {
  if (audio.muted || !audio.unlocked || !audio.actx) return;
  ensureProximityGain();
  if (audio.proximityGain) audio.proximityGain.gain.value = 1;
  const saved = audio.near;
  audio.near = plant.id; // playClip bails if we're "not near" — cards override
  // Keep the override through async decoding; restoring it immediately caused
  // playClip's range guard to cancel every uncached recording.
  try { await playClip(plant, kind); }
  finally { audio.near = saved; }
}
