// v1 chat director, verbatim semantics. Owner-only: the owner's client is
// the single author of plant chatter; it lands in state.messages and rides
// the lite sync to the server + every viewer.
import { POOLS } from './pools.js';

const rate = { lastLineIdx: {}, lastPostTs: {}, lastVoiceTs: {}, lastMsgTs: 0 };
export const chatRate = rate;

export function pickLine(speciesId, pool) {
  const lines = (POOLS[speciesId] || {})[pool] || [];
  if (!lines.length) return '...';
  const key = speciesId + ':' + pool;
  let idx = Math.floor(Math.random() * lines.length);
  if (lines.length > 1 && idx === rate.lastLineIdx[key]) idx = (idx + 1) % lines.length;
  rate.lastLineIdx[key] = idx;
  return lines[idx];
}

// returns a message object or null (rate-limited). Transitions always post;
// ambient/reaction are limited to one per plant per 20s.
export function buildPost(plant, pool, kind, other) {
  const now = Date.now();
  const isTransition = pool.startsWith('became') || pool === 'intro';
  if (!isTransition && now - (rate.lastPostTs[plant.id] || 0) < 20000) return null;
  const text = pickLine(plant.speciesId, pool)
    .replaceAll('{name}', plant.name).replaceAll('{other}', other || '');
  rate.lastMsgTs = now; rate.lastPostTs[plant.id] = now;
  return { id: 'm' + now + Math.random().toString(16).slice(2, 6), plantId: plant.id, text, kind, ts: now };
}

// thirst chirps ≤ 1/min per plant
export function shouldThirstChirp(plantId) {
  const now = Date.now();
  if (now - (rate.lastVoiceTs[plantId] || 0) > 60000) { rate.lastVoiceTs[plantId] = now; return true; }
  return false;
}

export function noteMessage() { rate.lastMsgTs = Date.now(); }
export function chatIdleFor() { return Date.now() - rate.lastMsgTs; }
