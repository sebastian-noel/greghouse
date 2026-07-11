// Owner-side plant chatter (v1 post/onMoodChanged/ambientLoop). Plant
// messages land in the store and ride the lite sync to the server + viewers.
import { useStore, isHardwarePlant } from './store.js';
import { buildPost, shouldThirstChirp, chatIdleFor } from '../engine/chatEngine.js';
import { chirp, waterSound } from '../engine/audio.js';
import { moodFor } from '../engine/species.js';
import { getWorld } from '../engine/worldgen.js';
import { char } from './runtime.js';
import { WATER_AMOUNT, WATER_FX_MS } from '../config.js';

export function post(plant, pool, kind, other) {
  const store = useStore.getState();
  const m = buildPost(plant, pool, kind, other);
  if (!m) return;
  store.addPlantMessage(m);
  store.saveState(); // schedules the lite sync
}

// Walk-up watering of a SIMULATED plant: the gardener stops, holds the pail
// out toward the plant and pours for WATER_FX_MS, adding +WATER_AMOUNT and a
// "+N" splash over the plant. Owner-only + synced via updatePlant → saveState
// (hardware plants are the probe's business and are rejected).
let waterLockTimer = null;
export function waterPlant(plantId) {
  const store = useStore.getState();
  if (store.isVisitor || char.watering) return; // one pour at a time
  const p = store.plants.find(x => x.id === plantId);
  if (!p || isHardwarePlant(p)) return;

  // turn to face the plant so the pail pours toward it
  const idx = store.plants.findIndex(x => x.id === plantId);
  const world = getWorld(store.garden.seed, store.garden.dims, window.innerWidth, window.innerHeight);
  const spot = world.spots[idx];
  if (spot) char.dir = spot.px >= char.x ? 1 : -1;

  // lock movement + raise the pail from the gardener's hand for the pour
  char.watering = true;
  useStore.setState({ selfWater: { dir: char.dir } });
  clearTimeout(waterLockTimer);
  waterLockTimer = setTimeout(() => {
    char.watering = false;
    useStore.setState({ selfWater: null });
  }, WATER_FX_MS);

  const moisture = Math.max(0, Math.min(100, p.moisture + WATER_AMOUNT));
  const mood = moodFor(p.speciesId, moisture);
  store.updatePlant(plantId, { moisture, mood }); // saveState → debounced lite sync
  store.showWaterFx(plantId);
  waterSound();
  if (mood !== p.mood) onMoodChanged({ ...p, moisture, mood }, mood);
}

export function onMoodChanged(p, mood) {
  const store = useStore.getState();
  const pool = mood === 'thirsty' ? 'becameThirsty' : mood === 'drowning' ? 'becameDrowning' : 'becameHappy';
  post(p, pool, 'status');
  if (mood === 'thirsty' && shouldThirstChirp(p.id)) chirp(p, true);
  if (Math.random() < 0.55 && store.plants.length > 1) {
    const others = store.plants.filter(x => x.id !== p.id);
    const reactor = others[Math.floor(Math.random() * others.length)];
    setTimeout(() => post(reactor, 'reaction', 'reaction', p.name), 2000 + Math.random() * 4000);
  }
}

let ambientStarted = false;
export function startAmbientLoop() {
  if (ambientStarted) return;
  ambientStarted = true;
  (function loop() {
    const delay = 25000 + Math.random() * 20000;
    setTimeout(() => {
      const s = useStore.getState();
      if (s.boot === 'ready' && !s.isVisitor && chatIdleFor() > 10000 && s.plants.length) {
        const p = s.plants[Math.floor(Math.random() * s.plants.length)];
        post(p, 'ambient', 'ambient');
      }
      loop();
    }, delay);
  })();
}
