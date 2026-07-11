// v1 add-a-plant wizard, verbatim flow: type → (wifi if hardware) → photo →
// analyze (scanline theater + analyzer cycle) → name+pot → voices. Back
// button, "step N of M", 6-plant cap, sparkle + pan on finish.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/http.js';
import { useStore, uid, cleanPlant } from '../../state/store.js';
import { SPECIES } from '../../engine/species.js';
import { POT_CHOICES } from '../../engine/palette.js';
import { getWorld } from '../../engine/worldgen.js';
import { cam } from '../../state/runtime.js';
import { post } from '../../state/actions.js';
import { scheduleSync } from '../../hooks/useGardenSync.js';
import Recorder from '../Recorder.jsx';

const ANALYZER_CYCLE = ['monstera', 'pothos', 'snake_plant', 'ficus', 'cactus', 'basil'];
let analyzerIdx = 0; // persists across wizard opens (v1 state.analyzerIdx)

export default function AddPlantWizard() {
  const closeModal = useStore(s => s.closeModal);
  const toast = useStore(s => s.toast);
  const [kind, setKind] = useState(null); // 'hardware' | 'sim'
  const [si, setSi] = useState(0);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [speciesId, setSpeciesId] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [name, setName] = useState('');
  const [potColor, setPotColor] = useState(POT_CHOICES[0]);
  const voices = useRef({ g: null, t: null });
  const [wifi, setWifi] = useState({ loaded: false, hasWifi: false, ssid: '', editing: false });
  const [ssidInput, setSsidInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [savingWifi, setSavingWifi] = useState(false);
  const fileRef = useRef(null);

  const steps = useMemo(() =>
    kind === 'hardware' ? ['type', 'wifi', 'photo', 'analyze', 'name', 'voice']
      : kind === 'sim' ? ['type', 'photo', 'analyze', 'name', 'voice'] : ['type'],
    [kind]);
  const step = steps[si];
  const n = `step ${si + 1} of ${steps.length}`;

  function pickKind(k) {
    setKind(k);
    setSi(1);
    if (k === 'hardware') {
      // pre-check saved wi-fi so the step can collapse to a one-tap confirmation
      api('GET', '/api/garden/mine/hardware')
        .then(hw => { setWifi({ loaded: true, hasWifi: hw.hasWifi, ssid: hw.wifiSsid, editing: false }); setSsidInput(hw.wifiSsid || ''); })
        .catch(() => setWifi(w => ({ ...w, loaded: true })));
    }
  }

  async function saveWifi() {
    const ssid = ssidInput.trim();
    if (!ssid) return;
    setSavingWifi(true);
    try {
      await api('PUT', '/api/garden/mine/hardware', { wifiSsid: ssid, wifiPass: passInput });
      toast('wi-fi saved — the module picks it up next time it syncs');
      setWifi({ loaded: true, hasWifi: true, ssid, editing: false });
      setSi(s => s + 1);
    } catch (e) { toast('could not save wi-fi: ' + e.message); }
    setSavingWifi(false);
  }

  // analyzer theater: after 1.8s pick a species not already in the garden
  const [analyzed, setAnalyzed] = useState(false);
  useEffect(() => {
    if (step !== 'analyze') { setAnalyzed(false); return; }
    const t = setTimeout(() => {
      const present = new Set(useStore.getState().plants.map(p => p.speciesId));
      let pick = null;
      for (let i = 0; i < ANALYZER_CYCLE.length; i++) {
        const cand = ANALYZER_CYCLE[(analyzerIdx + i) % ANALYZER_CYCLE.length];
        if (!present.has(cand)) { pick = cand; analyzerIdx = (analyzerIdx + i + 1) % ANALYZER_CYCLE.length; break; }
      }
      if (!pick) pick = ANALYZER_CYCLE[Math.floor(Math.random() * ANALYZER_CYCLE.length)];
      setSpeciesId(pick);
      setConfidence(88 + Math.floor(Math.random() * 10));
      setAnalyzed(true);
    }, 1800);
    return () => clearTimeout(t);
  }, [step]);

  function finish() {
    const store = useStore.getState();
    if (store.plants.length >= 6) { toast('the garden is full (6 plants max)'); return closeModal(); }
    const isHW = kind === 'hardware';
    const p = {
      id: uid(), name: name.trim() || SPECIES[speciesId].suggest, speciesId,
      potColor, isReal: false, isHardware: isHW,
      moisture: 65, soilMoisture: 65, mood: 'happy',
      voiceGeneralUrl: voices.current.g || undefined, voiceThirstyUrl: voices.current.t || undefined,
      createdAt: Date.now(),
    };
    store.setPlants([...store.plants, p].map(cleanPlant), 'full');
    scheduleSync('full');
    closeModal();
    // sparkle + pan to the new spot
    setTimeout(() => {
      const sp = document.getElementById('sp-' + p.id);
      if (sp) sp.classList.add('sparkle');
      const world = getWorld(store.garden.seed, store.garden.dims, window.innerWidth, window.innerHeight);
      const spot = world.spots[useStore.getState().plants.length - 1];
      if (spot && cam.panToFn) cam.panToFn(spot.px, spot.py - 40);
    }, 50);
    post(p, 'intro', 'status');
    if (isHW) toast('hardware plant added — stats sync live with the module');
  }

  return (
    <>
      <h2>add a plant</h2>

      {step === 'type' && (
        <>
          <p>step 1 — how does this plant live?</p>
          <button className="wizcard primary" onClick={() => pickKind('hardware')}>
            <b>hardware plant</b>
            lives on the greenhouse module — ESP32 display + a real soil moisture probe posting every 2 seconds
          </button>
          <div className="simbox">
            <span className="mini">no hardware for this one?</span>
            <button className="small" onClick={() => pickKind('sim')}>simulated plant</button>
          </div>
        </>
      )}

      {step === 'wifi' && (
        <>
          <p>{n} — module wi-fi</p>
          {!wifi.loaded ? (
            <p className="mini">checking for a saved network...</p>
          ) : wifi.hasWifi && !wifi.editing ? (
            <>
              <p>the greenhouse module will join <b>{wifi.ssid}</b> (already saved).</p>
              <div className="row end">
                <button className="linkish" onClick={() => setWifi(w => ({ ...w, editing: true }))}>different network</button>
                <button className="small primary" onClick={() => setSi(s => s + 1)}>use this network</button>
              </div>
            </>
          ) : (
            <>
              <p className="mini">the ESP32 module joins this network to reach the greenhouse. 2.4GHz networks only.</p>
              <div className="row"><input type="text" maxLength={32} placeholder="wi-fi name (SSID)" aria-label="wi-fi name"
                value={ssidInput} onChange={e => setSsidInput(e.target.value)} /></div>
              <div className="row"><input type="text" maxLength={64} placeholder="wi-fi password" aria-label="wi-fi password"
                value={passInput} onChange={e => setPassInput(e.target.value)} /></div>
              <div className="row end">
                <button className="small primary" disabled={savingWifi || !ssidInput.trim()} onClick={saveWifi}>save + continue</button>
              </div>
            </>
          )}
        </>
      )}

      {step === 'photo' && (
        <>
          <p>{n} — take a photo of the new plant</p>
          {photoUrl && <div className="photo-prev"><img src={photoUrl} alt="your plant" /></div>}
          <div className="row">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr"
              onChange={e => { const f = e.target.files && e.target.files[0]; if (f) setPhotoUrl(URL.createObjectURL(f)); }} />
            <button className="small primary" onClick={() => fileRef.current.click()}>
              {photoUrl ? 'retake photo' : 'choose photo'}
            </button>
            {photoUrl && <button className="small" onClick={() => setSi(s => s + 1)}>analyze</button>}
          </div>
        </>
      )}

      {step === 'analyze' && (
        <>
          <p>{n} — analyzing...</p>
          <div className="photo-prev">
            {photoUrl ? <img src={photoUrl} alt="your plant" /> : <div style={{ height: 140 }} />}
            {!analyzed && <div className="scanline" />}
          </div>
          {analyzed && (
            <div>
              <p>we think it is a <b>{SPECIES[speciesId].commonName}</b> ({confidence}%)</p>
              <p className="mini">species identification is faked in this test build</p>
              <div className="row">
                <span className="mini">not right?</span>
                <select value={speciesId} onChange={e => setSpeciesId(e.target.value)}>
                  {Object.entries(SPECIES).map(([id, s]) => <option key={id} value={id}>{s.commonName}</option>)}
                </select>
              </div>
              <div className="row end">
                <button className="small primary" onClick={() => { setName(SPECIES[speciesId].suggest); setSi(s => s + 1); }}>looks right</button>
              </div>
            </div>
          )}
        </>
      )}

      {step === 'name' && (
        <>
          <p>{n} — name + pot</p>
          <div className="row">
            <input type="text" maxLength={12} value={name} aria-label="plant name"
              onChange={e => setName(e.target.value)} />
          </div>
          <p className="mini">pick a pot color</p>
          <div className="swatches">
            {POT_CHOICES.map(c => (
              <div key={c} className={'swatch' + (c === potColor ? ' sel' : '')} style={{ background: c }}
                onClick={() => setPotColor(c)} />
            ))}
          </div>
          <div className="row end" style={{ marginTop: 12 }}>
            <button className="small primary" onClick={() => setSi(s => s + 1)}>next</button>
          </div>
        </>
      )}

      {step === 'voice' && (
        <>
          <p>{n} — give it a voice (optional)</p>
          <Recorder label="general voice — how it says hi" onSave={url => { voices.current.g = url; }} />
          <Recorder label="thirsty voice — how it begs for water" onSave={url => { voices.current.t = url; }} />
          <div className="row end">
            <button className="linkish" onClick={finish}>skip voices</button>
            <button className="small primary" onClick={finish}>add to the garden</button>
          </div>
        </>
      )}

      <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        {si > 0 ? <button className="small" onClick={() => setSi(s => Math.max(0, s - 1))}>back</button> : <span />}
        <button className="small" onClick={closeModal}>x close</button>
      </div>
    </>
  );
}
