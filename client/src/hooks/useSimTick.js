// v1 tick(): every 5s the OWNER decays simulated plants' moisture; hardware
// plants are skipped (their soil is the probe's business — useTelemetry).
import { useEffect } from 'react';
import { SPECIES, moodFor } from '../engine/species.js';
import { useStore, isHardwarePlant } from '../state/store.js';
import { onMoodChanged } from '../state/actions.js';

export function useSimTick() {
  const boot = useStore(s => s.boot);
  const isVisitor = useStore(s => s.isVisitor);

  useEffect(() => {
    if (boot !== 'ready' || isVisitor) return;
    const iv = setInterval(() => {
      const store = useStore.getState();
      const transitions = [];
      const plants = store.plants.map(p => {
        if (isHardwarePlant(p)) return p;
        const sp = SPECIES[p.speciesId] || SPECIES.pothos;
        const jitter = 0.9 + Math.random() * 0.2;
        const moisture = Math.max(0, Math.min(100, p.moisture - sp.decayPerMin * (5 / 60) * store.speed * jitter));
        const mood = moodFor(p.speciesId, moisture);
        const np = { ...p, moisture, mood };
        if (mood !== p.mood) transitions.push(np);
        return np;
      });
      store.setPlants(plants); // saveState → debounced lite sync
      for (const p of transitions) onMoodChanged(p, p.mood);
    }, 5000);
    return () => clearInterval(iv);
  }, [boot, isVisitor]);
}
