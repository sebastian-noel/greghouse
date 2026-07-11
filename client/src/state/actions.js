// Owner-side plant chatter (v1 post/onMoodChanged/ambientLoop). Plant
// messages land in the store and ride the lite sync to the server + viewers.
import { useStore } from './store.js';
import { buildPost, shouldThirstChirp, chatIdleFor } from '../engine/chatEngine.js';
import { chirp } from '../engine/audio.js';

export function post(plant, pool, kind, other) {
  const store = useStore.getState();
  const m = buildPost(plant, pool, kind, other);
  if (!m) return;
  store.addPlantMessage(m);
  store.saveState(); // schedules the lite sync
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
