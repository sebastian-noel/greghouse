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

export default function Peer({ peer, bindRef }) {
  const bubble = useStore(s => s.peerBubbles[peer.id]);
  const svg = useMemo(() => charSVG(3, peer.skin), [peer.skin]);
  return (
    <div className="peer" ref={bindRef} style={{ left: peer.x, top: peer.y }}>
      <Bubble bubble={bubble} />
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="ptag">{peer.name}{peer.isOwner ? ' ⌂' : ''}</div>
    </div>
  );
}
