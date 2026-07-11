// The 2s poller for the real plant. One fetch per tick — there is exactly
// one probe — applied to every hardware plant. Every client independently
// fetches the same integer and derives mood through the same moodFor(), so
// the site and the device never disagree. Stale >10s → "probe offline",
// value frozen, NO simulation fallback.
import { useEffect } from 'react';
import { fetchLatest } from '../api/telemetry.js';
import { moodFor } from '../engine/species.js';
import { useStore, isHardwarePlant } from '../state/store.js';
import { onMoodChanged } from '../state/actions.js';
import { POLL_TELEMETRY_MS, POLL_TELEMETRY_HIDDEN_MS, STALE_MS } from '../config.js';

export function useTelemetry() {
  const boot = useStore(s => s.boot);
  const hasHardware = useStore(s => s.plants.some(isHardwarePlant));

  useEffect(() => {
    if (boot !== 'ready' || !hasHardware) return;
    let stopped = false;
    let timer = null;
    let inflight = false;
    const interval = () => (document.hidden ? POLL_TELEMETRY_HIDDEN_MS : POLL_TELEMETRY_MS);

    function apply(res) {
      const store = useStore.getState();
      const transitions = [];
      const plants = store.plants.map(p => {
        if (!isHardwarePlant(p)) return p;
        if (!res) { // 404 — probe has never reported
          store.setTelemetry(p.id, { soil: null, ts: null, ageMs: null, stale: true });
          return p;
        }
        const stale = res.ageMs > STALE_MS;
        store.setTelemetry(p.id, { soil: res.soilMoisture, ts: res.ts, ageMs: res.ageMs, stale });
        const mood = moodFor(p.speciesId, res.soilMoisture);
        const np = { ...p, soilMoisture: res.soilMoisture, moisture: res.soilMoisture, mood };
        if (mood !== p.mood) transitions.push(np);
        return np;
      });
      // local display update — the server strips hardware plants from lite
      // syncs, so this never echoes anywhere
      useStore.setState({ plants });
      // only the owner's client writes mood-transition chat lines — otherwise
      // N viewers would post N duplicates
      if (store.isOwner()) for (const p of transitions) onMoodChanged(p, p.mood);
    }

    function tick() {
      if (stopped) return;
      const iv = interval();
      if (!inflight) { // slow fetch → drop this tick, never queue
        inflight = true;
        const ctrl = new AbortController();
        const abortTimer = setTimeout(() => ctrl.abort(), Math.max(500, iv - 100));
        fetchLatest(ctrl.signal)
          .then(res => { if (!stopped) apply(res); })
          .catch(() => { /* network blip — freeze last value; staleness shows itself */ })
          .finally(() => { clearTimeout(abortTimer); inflight = false; });
      }
      timer = setTimeout(tick, iv);
    }

    const onVis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener('visibilitychange', onVis);
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [boot, hasHardware]);
}
