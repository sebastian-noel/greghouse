import { useState } from 'react';
import { enterVisitor } from '../../hooks/useAuth.js';
import { randomSkin, charSVG } from '../../engine/sprites.js';
import { unlockAudio } from '../../engine/audio.js';

export default function VisitorJoin() {
  const [skin, setSkin] = useState(randomSkin);
  const [name, setName] = useState('');

  function join() {
    const n = name.trim();
    if (!n) return;
    unlockAudio();
    enterVisitor(n, skin);
  }

  return (
    <>
      <div className="skinrow">
        <div id="skin-prev" dangerouslySetInnerHTML={{ __html: charSVG(4, skin) }} />
        <button className="small" onClick={() => setSkin(randomSkin())}>new look</button>
      </div>
      <input type="text" maxLength={16} placeholder="your name" value={name} autoFocus
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') join(); }} />
      <button className="primary" onClick={join}>join the garden</button>
    </>
  );
}
