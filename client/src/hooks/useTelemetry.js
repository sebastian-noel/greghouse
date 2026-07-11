// The 2s cloud poller (v2's new heart). Every client independently fetches
// the same integer and derives mood through the same moodFor() — the site
// and the device never disagree. Stale >10s → "probe offline", value frozen,
// NO simulation fallback.
import { useEffect } from 'react';
import { fetchLatest } from '../api/telemetry.js';
import { moodFor } from '../engine/species.js';
import { useStore, isHardwarePlant } from '../state/store.js';
import { onMoodChanged } from '../state/actions.js';
import { POLL_TELEMETRY_MS, POLL_TELEMETRY_HIDDEN_MS, STALE_MS } from '../config.js';

export function useTelemetry() {
  const boot = useStore(s => s.boot);
  const gardenId = useStore(s => s.garden.id);
  const hwKey = useStore(s => s.plants.filter(isHardwarePlant).map(p => p.id).join(','));

  useEffect(() => {
    if (boot !== 'ready' || !gardenId || !hwKey) return;
    let stopped = false;
    let timer = null;
    const inflight = new Set();
    const interval = () => (document.hidden ? POLL_TELEMETRY_HIDDEN_MS : POLL_TELEMETRY_MS);

    function apply(plantId, res) {
      const store = useStore.getState();
      const plant = store.plants.find(p => p.id === plantId);
      if (!plant) return;
      if (!res) { // 404 — probe has never reported
        store.setTelemetry(plantId, { soil: null, ts: null, ageMs: null, stale: true });
        return;
      }
      const stale = res.ageMs > STALE_MS;
      store.setTelemetry(plantId, { soil: res.soilMoisture, ts: res.ts, ageMs: res.ageMs, stale });
      const newMood = moodFor(plant.speciesId, res.soilMoisture);
      const patch = { soilMoisture: res.soilMoisture, moisture: res.soilMoisture };
      const moodChanged = newMood !== plant.mood;
      if (moodChanged) patch.mood = newMood;
      // local display update — never re-synced for hardware plants (the
      // server strips them from lite syncs anyway)
      useStore.setState(s => ({ plants: s.plants.map(p => p.id === plantId ? { ...p, ...patch } : p) }));
      // only the owner's client writes mood-transition chat lines — otherwise
      // N viewers would post N duplicates
      if (moodChanged && store.isOwner()) onMoodChanged({ ...plant, ...patch }, newMood);
    }

    function tick() {
      if (stopped) return;
      const store = useStore.getState();
      const iv = interval();
      for (const p of store.plants) {
        if (!isHardwarePlant(p) || inflight.has(p.id)) continue; // slow fetch → drop, never queue
        inflight.add(p.id);
        const ctrl = new AbortController();
        const abortTimer = setTimeout(() => ctrl.abort(), Math.max(500, iv - 100));
        fetchLatest(gardenId, p.id, ctrl.signal)
          .then(res => { if (!stopped) apply(p.id, res); })
          .catch(() => { /* network blip — freeze last value; staleness shows itself */ })
          .finally(() => { clearTimeout(abortTimer); inflight.delete(p.id); });
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
  }, [boot, gardenId, hwKey]);
}
