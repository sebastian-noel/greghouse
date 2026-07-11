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

export default function Gardener({ bindRef }) {
  const skin = useStore(s => s.skin);
  const isVisitor = useStore(s => s.isVisitor);
  const name = useStore(s => (s.isVisitor ? s.visitorName : s.session.user?.name || 'gardener'));
  const bubble = useStore(s => s.peerBubbles['self']);
  const svg = useMemo(() => charSVG(3, skin), [skin]);

  return (
    <div id="char" ref={bindRef}>
      <Bubble bubble={bubble} />
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="ptag">{name}{!isVisitor ? ' ⌂' : ''}</div>
    </div>
  );
}
