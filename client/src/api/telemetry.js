import { TELEMETRY_BASE } from '../config.js';

// GET {TELEMETRY_BASE}/telemetry/latest?g&p → {soilMoisture, ts, ageMs}
// null on 404 (probe has never reported); throws on anything else.
export async function fetchLatest(gardenId, plantId, signal) {
  const url = `${TELEMETRY_BASE}/telemetry/latest?g=${encodeURIComponent(gardenId)}&p=${encodeURIComponent(plantId)}`;
  const res = await fetch(url, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('telemetry ' + res.status);
  return res.json();
}
