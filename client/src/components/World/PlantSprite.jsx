// v1 plantwrap: bubble above, bobbing sprite, name label below. Click chirps
// + opens the card (suppressed after a drag). v2: when the OWNER walks up to a
// SIMULATED plant a "water" button appears (pail + "+N" FX); when a VISITOR
// walks up to a THIRSTY plant a "tell {owner} to water" button appears instead.
import { useEffect, useMemo, useState } from 'react';
import { useStore, isHardwarePlant } from '../../state/store.js';
import { spriteSVG } from '../../engine/sprites.js';
import { chirp } from '../../engine/audio.js';
import { dragMovedRef } from '../../state/runtime.js';
import { waterPlant } from '../../state/actions.js';
import { sendNet } from '../../hooks/useGardenSync.js';
import { WATER_AMOUNT } from '../../config.js';

function Bubble({ bubble, ms }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), ms);
    return () => clearTimeout(t);
  }, [bubble, ms]);
  if (!bubble || !visible) return null;
  return <div className="bubble">{bubble.text}</div>;
}

// "+N" splash that floats up over the plant as it drinks (the pail itself
// pours from the gardener's hand — see Gardener.jsx). Mounts only while
// waterFx[plant.id] is set (store clears it after WATER_FX_MS).
function WaterPlus() {
  return (
    <div className="water-fx" aria-hidden="true">
      <span className="water-plus">+{WATER_AMOUNT}</span>
    </div>
  );
}

export default function PlantSprite({ plant, spot, index }) {
  const openModal = useStore(s => s.openModal);
  const bubble = useStore(s => s.bubbles[plant.id]);
  const telem = useStore(s => s.telemetry[plant.id]);
  const canWater = useStore(s => s.nearWaterId === plant.id);
  const canWarn = useStore(s => s.nearWarnId === plant.id);
  const ownerName = useStore(s => s.garden.ownerName);
  const watering = useStore(s => !!s.waterFx[plant.id]);
  const svg = useMemo(() => spriteSVG(plant, 5), [plant.speciesId, plant.mood, plant.potColor, plant.name]);
  if (!spot) return null;
  const hw = isHardwarePlant(plant);
  const offline = hw && (!telem || telem.stale);

  return (
    <div className="plantwrap" style={{ left: spot.px, top: spot.py }}>
      <Bubble bubble={bubble} ms={8000} />
      {watering && <WaterPlus />}
      <div className={`sprite bob d${index % 3}`} id={'sp-' + plant.id} tabIndex={0} role="button"
        aria-label={`open ${plant.name}`}
        onClick={() => {
          if (dragMovedRef.current) { dragMovedRef.current = false; return; }
          chirp(plant, false);
          openModal({ type: 'card', id: plant.id });
        }}
        dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="plabel">
        {plant.name}{hw && offline ? ' ⚠' : ''}
      </div>
      {canWater && (
        <button className="water-btn" aria-label={`water ${plant.name}`}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); waterPlant(plant.id); }}>
          💧 water
        </button>
      )}
      {canWarn && (
        <button className="warn-btn" aria-label={`tell ${ownerName || 'the gardener'} to water ${plant.name}`}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); sendNet({ t: 'warn', plantId: plant.id }); }}>
          tell {ownerName || 'the gardener'} to water {plant.name}
        </button>
      )}
    </div>
  );
}
