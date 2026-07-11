import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store.js';
import { loginDev, loginGoogle, enterOwner, signOut } from '../../hooks/useAuth.js';
import { unlockAudio } from '../../engine/audio.js';

export default function OwnerEnter() {
  const config = useStore(s => s.config);
  const user = useStore(s => s.session.user);
  const toast = useStore(s => s.toast);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const gsiRef = useRef(null);

  // already signed in → one-tap "come in as <name>"
  async function comeIn() {
    if (busy) return;
    setBusy(true);
    unlockAudio();
    try { await enterOwner(); }
    catch (e) { toast('could not load your garden: ' + e.message); setBusy(false); }
  }

  async function devGo() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    unlockAudio();
    try { await loginDev(n); }
    catch (e) { toast('login failed: ' + e.message); setBusy(false); }
  }

  useEffect(() => {
    if (user || !config?.googleClientId || !gsiRef.current) return;
    const init = () => {
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: async resp => {
          unlockAudio();
          try { await loginGoogle(resp.credential); }
          catch (e) { toast('sign-in failed: ' + e.message); }
        },
      });
      window.google.accounts.id.renderButton(gsiRef.current, { theme: 'filled_black', size: 'large' });
    };
    if (window.google && window.google.accounts) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = init;
    s.onerror = () => toast('could not load google sign-in');
    document.head.appendChild(s);
  }, [user, config]);

  if (user) {
    return (
      <>
        <button className="primary" onClick={comeIn} disabled={busy}>
          {busy ? 'entering...' : `come in as ${user.name}`}
        </button>
        <button className="linkish" style={{ color: 'var(--gray)' }} onClick={signOut}>sign out</button>
      </>
    );
  }
  if (config?.googleClientId) {
    return (
      <>
        <div ref={gsiRef} />
        <p style={{ color: 'var(--gray)', fontSize: 18 }}>sign in to tend your garden</p>
      </>
    );
  }
  return (
    <>
      <input type="text" maxLength={16} placeholder="your name" value={name} autoFocus
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') devGo(); }} />
      <button className="primary" onClick={devGo} disabled={busy}>enter (dev login)</button>
      <p style={{ color: 'var(--gray)', fontSize: 16, maxWidth: 300 }}>
        google sign-in isn't configured — start the server with GOOGLE_CLIENT_ID set to enable it
      </p>
    </>
  );
}
