// v1 debug: right-side cream panel — per-plant moisture slider + water +40,
// sim speed 1/4/10×, reset demo. Hardware plants: read-only, the probe decides.
import { useStore, isHardwarePlant, seedPlants } from '../state/store.js';
import { SPECIES, moodFor } from '../engine/species.js';
import { onMoodChanged } from '../state/actions.js';
import { scheduleSync } from '../hooks/useGardenSync.js';
import { LS_STATE } from '../config.js';

export default function DebugPanel() {
  const plants = useStore(s => s.plants);
  const speed = useStore(s => s.speed);
  const toast = useStore(s => s.toast);

  function setMoisture(p, val) {
    const store = useStore.getState();
    const moisture = Math.max(0, Math.min(100, val));
    const mood = moodFor(p.speciesId, moisture);
    store.updatePlant(p.id, { moisture, mood });
    if (mood !== p.mood) onMoodChanged({ ...p, moisture, mood }, mood);
  }

  function resetDemo() {
    localStorage.removeItem(LS_STATE);
    const store = useStore.getState();
    store.set({ messages: [], peopleChat: [] });
    store.setPlants(seedPlants(), 'full');
    scheduleSync('full');
    toast('demo reset');
  }

  return (
    <div id="debug">
      <h2>debug</h2>
      <p className="mini">soil for hardware plants comes from the telemetry endpoint</p>
      {plants.map(p => (
        <div className="dplant" key={p.id}>
          <div className="nm">{p.name} <span className="mini">({SPECIES[p.speciesId]?.commonName})</span></div>
          {isHardwarePlant(p) ? (
            <div className="row"><span className="mini">
              soil: <b>{Math.round(p.soilMoisture ?? p.moisture ?? 0)}</b> — {p.mood} — this one's real, the probe decides
            </span></div>
          ) : (
            <>
              <input type="range" min="0" max="100" value={Math.round(p.moisture)}
                aria-label={`${p.name} moisture`}
                onChange={e => setMoisture(p, +e.target.value)} />
              <div className="row">
                <span className="mini">moisture: <b>{Math.round(p.moisture)}</b> — {p.mood}</span>
                <button className="small" onClick={() => setMoisture(p, p.moisture + 40)}>water +40</button>
              </div>
            </>
          )}
        </div>
      ))}
      <div className="row">
        <span className="mini">sim speed:</span>
        {[1, 4, 10].map(s => (
          <button key={s} className="small" style={speed === s ? { background: 'var(--sun)' } : undefined}
            onClick={() => useStore.setState({ speed: s })}>{s}x</button>
        ))}
      </div>
      <div className="row">
        <button className="small" onClick={resetDemo}>reset demo</button>
        <button className="small" onClick={() => useStore.setState({ debugOpen: false })}>close</button>
      </div>
    </div>
  );
}
