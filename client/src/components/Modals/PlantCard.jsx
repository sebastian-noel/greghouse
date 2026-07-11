// v1 plant card: sprite + species + personality, moisture bar (mood-colored),
// light bar for hardware plants, play general/thirsty (full volume),
// re-record voices. v2: hardware soil reads the telemetry slice and shows a
// "probe offline" line when stale (value frozen — no fake soil).
import { useEffect, useMemo, useState } from 'react';
import { useStore, isHardwarePlant } from '../../state/store.js';
import { SPECIES } from '../../engine/species.js';
import { spriteSVG } from '../../engine/sprites.js';
import { playClipAtFullVolume } from '../../engine/audio.js';
import { scheduleSync } from '../../hooks/useGardenSync.js';
import Recorder from '../Recorder.jsx';

function OfflineLine({ ts }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force(n => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const secs = ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : null;
  return (
    <p className="mini" style={{ color: 'var(--alert)', marginTop: 4 }}>
      ⚠ probe offline{secs != null ? ` — last reading ${secs}s ago` : ' — no readings yet'}
    </p>
  );
}

export default function PlantCard({ plantId }) {
  const plant = useStore(s => s.plants.find(p => p.id === plantId));
  const telem = useStore(s => s.telemetry[plantId]);
  const isVisitor = useStore(s => s.isVisitor);
  const closeModal = useStore(s => s.closeModal);
  const updatePlant = useStore(s => s.updatePlant);
  const toast = useStore(s => s.toast);
  const [rerec, setRerec] = useState(false);
  const svg = useMemo(() => (plant ? spriteSVG(plant, 5) : ''), [plant?.speciesId, plant?.mood, plant?.potColor]);

  if (!plant) { closeModal(); return null; }
  const sp = SPECIES[plant.speciesId];
  const hw = isHardwarePlant(plant);
  const moist = Math.round(hw ? (plant.soilMoisture ?? plant.moisture ?? 0) : plant.moisture);
  const offline = hw && (!telem || telem.stale);
  const fillColor = plant.mood === 'drowning' ? 'var(--sky)' : plant.mood === 'thirsty' ? 'var(--alert)' : 'var(--leaf)';

  function saveVoice(key, bufKey, url, label) {
    updatePlant(plant.id, { [key]: url, [bufKey]: undefined }, 'full');
    scheduleSync('full');
    toast(label + ' saved');
  }

  return (
    <>
      <h2>{plant.name} {hw && <span className="livebadge">LIVE SENSOR</span>}</h2>
      <div className="row">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        <div style={{ flex: 1, minWidth: 150 }}>
          <p style={{ marginBottom: 4 }}>{sp.commonName}</p>
          <p className="mini">{sp.personality}</p>
        </div>
      </div>
      <p className="mini">{hw ? 'soil moisture' : 'moisture'}: <span>{moist}</span> / 100 — mood: <span>{plant.mood}</span></p>
      <div className="bar"><div className="fill" style={{ width: moist + '%', background: fillColor }} /></div>
      {offline && <OfflineLine ts={telem?.ts} />}
      {hw && (
        <>
          <p className="mini" style={{ marginTop: 8 }}>light: <span>{Math.round(plant.light ?? 50)}</span> / 100</p>
          <div className="bar"><div className="fill" style={{ width: (plant.light ?? 50) + '%', background: 'var(--sun)' }} /></div>
          <p className="mini" style={{ marginTop: 6 }}>soil: live probe · light: simulated</p>
        </>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="small" onClick={() => playClipAtFullVolume(plant, 'general')}>play general</button>
        <button className="small" onClick={() => playClipAtFullVolume(plant, 'thirsty')}>play thirsty</button>
      </div>
      {rerec && (
        <div>
          <Recorder label="general voice" onSave={url => saveVoice('voiceGeneralUrl', '_buf_general', url, 'general voice')} />
          <Recorder label="thirsty voice" onSave={url => saveVoice('voiceThirstyUrl', '_buf_thirsty', url, 'thirsty voice')} />
        </div>
      )}
      <div className="row end">
        {!isVisitor && !rerec && <button className="small" onClick={() => setRerec(true)}>re-record voices</button>}
        <button className="small" onClick={closeModal}>close</button>
      </div>
    </>
  );
}
