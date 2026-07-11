// v1 plantwrap: bubble above, bobbing sprite, name label below. Click chirps
// + opens the card (suppressed after a drag).
import { useEffect, useMemo, useState } from 'react';
import { useStore, isHardwarePlant } from '../../state/store.js';
import { spriteSVG } from '../../engine/sprites.js';
import { chirp } from '../../engine/audio.js';
import { dragMovedRef } from '../../state/runtime.js';

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

export default function PlantSprite({ plant, spot, index }) {
  const openModal = useStore(s => s.openModal);
  const bubble = useStore(s => s.bubbles[plant.id]);
  const telem = useStore(s => s.telemetry[plant.id]);
  const svg = useMemo(() => spriteSVG(plant, 5), [plant.speciesId, plant.mood, plant.potColor, plant.name]);
  if (!spot) return null;
  const hw = isHardwarePlant(plant);
  const offline = hw && (!telem || telem.stale);

  return (
    <div className="plantwrap" style={{ left: spot.px, top: spot.py }}>
      <Bubble bubble={bubble} ms={8000} />
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
    </div>
  );
}
