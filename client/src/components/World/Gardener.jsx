// v1 #char — your avatar. Position is mutated by the game loop via bindRef;
// React only renders skin/name/bubble.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../state/store.js';
import { charSVG } from '../../engine/sprites.js';

function Bubble({ bubble }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, [bubble]);
  if (!bubble || !visible) return null;
  return <div className="bubble">{bubble.text}</div>;
}

// the pail held out from the gardener's hand, tipped to pour, with a droplet
// stream. Drawn spout-forward; the whole rig mirrors when facing left.
function WateringPail({ dir }) {
  return (
    <div className={'pail-fx' + (dir < 0 ? ' flip' : '')} aria-hidden="true">
      <svg className="pail-can" viewBox="0 0 22 16" width="34" height="25" shape-rendering="crispEdges">
        {/* handle */}
        <rect x="5" y="0" width="6" height="2" fill="#1D2B53" />
        <rect x="5" y="2" width="2" height="2" fill="#1D2B53" />
        <rect x="9" y="2" width="2" height="2" fill="#1D2B53" />
        {/* body */}
        <rect x="2" y="4" width="11" height="11" fill="#1D2B53" />
        <rect x="3" y="5" width="9" height="9" fill="#C2C3C7" />
        <rect x="4" y="6" width="2" height="6" fill="#FFF1E8" />
        {/* spout tapering down-right, with a rose tip */}
        <polygon points="12,6 21,12 21,15 12,9" fill="#1D2B53" />
        <polygon points="12,8 18,12 18,13 12,9" fill="#C2C3C7" />
        <rect x="18" y="12" width="4" height="3" fill="#1D2B53" />
      </svg>
      <span className="pail-drop d0" />
      <span className="pail-drop d1" />
      <span className="pail-drop d2" />
    </div>
  );
}

export default function Gardener({ bindRef }) {
  const skin = useStore(s => s.skin);
  const isVisitor = useStore(s => s.isVisitor);
  const name = useStore(s => (s.isVisitor ? s.visitorName : s.session.user?.name || 'gardener'));
  const bubble = useStore(s => s.peerBubbles['self']);
  const selfWater = useStore(s => s.selfWater);
  const svg = useMemo(() => charSVG(3, skin), [skin]);

  return (
    <div id="char" ref={bindRef}>
      <Bubble bubble={bubble} />
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {selfWater && <WateringPail dir={selfWater.dir} />}
      <div className="ptag">{name}{!isVisitor ? ' ⌂' : ''}</div>
    </div>
  );
}
