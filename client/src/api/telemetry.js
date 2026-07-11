import { TELEMETRY_BASE } from '../config.js';

// GET {TELEMETRY_BASE}/telemetry/latest → {soilMoisture, ts, ageMs}
// (the Node server proxies the cloud's /readings same-origin — API Gateway
// has no CORS headers). There is exactly one probe, so no ids are needed.
// null on 404 (probe has never reported); throws on anything else.
export async function fetchLatest(signal) {
  const res = await fetch(TELEMETRY_BASE + '/telemetry/latest', { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('telemetry ' + res.status);
  return res.json();
}
