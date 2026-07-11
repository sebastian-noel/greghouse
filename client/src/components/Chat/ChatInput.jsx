// v1 compose: emoji quick-row + 140-char input, both straight to the socket
import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { net } from '../../state/runtime.js';
import { sendNet } from '../../hooks/useGardenSync.js';

const EMOJIS = ['👋', '❤️', '😂', '🌱', '💧', '🎉'];

export default function ChatInput() {
  const [text, setText] = useState('');
  const toast = useStore(s => s.toast);

  function sendText(t) {
    if (!t) return;
    if (!net.connected) { toast('not connected'); return; }
    sendNet({ t: 'chat', text: t });
  }

  return (
    <div id="chat-compose" style={{ display: 'flex' }}>
      <div className="emojis">
        {EMOJIS.map(e => (
          <button key={e} type="button" onClick={() => sendText(e)}>{e}</button>
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); sendText(text.trim()); setText(''); }}>
        <input type="text" maxLength={140} placeholder="say something..." autoComplete="off"
          aria-label="chat message" value={text} onChange={e => setText(e.target.value)} />
        <button type="submit" className="small">send</button>
      </form>
    </div>
  );
}
