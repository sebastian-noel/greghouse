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
    audio.actx = new (window.AudioContext || window.webkitAudioContext)();
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
export function playClipAtFullVolume(plant, kind) {
  ensureProximityGain();
  if (audio.proximityGain) audio.proximityGain.gain.value = 1;
  const saved = audio.near;
  audio.near = plant.id; // playClip bails if we're "not near" — cards override
  playClip(plant, kind).finally(() => { audio.near = saved; });
}
