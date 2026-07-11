// Boot flows, v1 semantics: ?g= → visitor; else owner (dev or google login,
// "come in as <name>" when a token is already valid).
import { useEffect } from 'react';
import { api } from '../api/http.js';
import { useStore, bumpIds } from '../state/store.js';
import { getWorld } from '../engine/worldgen.js';
import { skinFromString } from '../engine/sprites.js';
import { seedSeen, scheduleSync } from './useGardenSync.js';
import { LS_TOKEN } from '../config.js';

export const GARDEN_PARAM = new URLSearchParams(location.search).get('g');
export const IS_VISITOR = !!GARDEN_PARAM;
export const DEBUG_PARAM = new URLSearchParams(location.search).get('debug') === '1';

export function useAuthBoot() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = useStore.getState();
      useStore.setState({ isVisitor: IS_VISITOR });
      if (IS_VISITOR) {
        // visitor: fetch the shared garden before showing the join UI
        try {
          const g = await api('GET', '/api/garden/' + encodeURIComponent(GARDEN_PARAM));
          if (cancelled) return;
          bumpIds(g.plants);
          useStore.setState({
            garden: { id: g.id, seed: g.seed, dims: g.dims, ownerName: g.ownerName },
            plants: g.plants || [], messages: g.messages || [],
            boot: 'enter',
          });
          seedSeen();
        } catch (e) {
          if (!cancelled) useStore.setState({ boot: 'notfound' });
        }
        return;
      }
      // owner
      let cfg;
      try { cfg = await api('GET', '/api/config'); }
      catch (e) { if (!cancelled) useStore.setState({ boot: 'offline' }); return; }
      if (cancelled) return;
      let user = null;
      if (store.session.token) {
        try { const me = await api('GET', '/api/me'); user = me.user; }
        catch (e) { localStorage.removeItem(LS_TOKEN); useStore.setState(s => ({ session: { ...s.session, token: null } })); }
      }
      if (cancelled) return;
      useStore.setState(s => ({ config: cfg, session: { ...s.session, user }, boot: 'enter' }));
    })();
    return () => { cancelled = true; };
  }, []);
}

export async function loginDev(name) {
  const r = await api('POST', '/api/auth/dev', { name });
  localStorage.setItem(LS_TOKEN, r.token);
  useStore.setState({ session: { token: r.token, user: r.user } });
  await enterOwner();
}

export async function loginGoogle(credential) {
  const r = await api('POST', '/api/auth/google', { credential });
  localStorage.setItem(LS_TOKEN, r.token);
  useStore.setState({ session: { token: r.token, user: r.user } });
  await enterOwner();
}

export function signOut() {
  localStorage.removeItem(LS_TOKEN);
  location.reload();
}

/* ----- owner: load garden (server → localStorage → fresh) then enter ----- */
export async function enterOwner() {
  const store = useStore.getState();
  const user = useStore.getState().session.user;
  let g = null;
  try { g = await api('GET', '/api/garden/mine'); } catch (e) { /* offline-tolerant */ }
  if (g && g.seed != null) {
    bumpIds(g.plants);
    useStore.setState({
      garden: { id: g.id, seed: g.seed, dims: g.dims, ownerName: user.name },
      plants: g.plants || [], messages: g.messages || [],
    });
  } else {
    // first login: adopt whatever garden this device already grew (localStorage or seeds)
    const local = store.loadLocalState();
    const { seedPlants } = await import('../state/store.js');
    const seed = (Math.random() * 0x7fffffff) | 0;
    const world = getWorld(seed, null, window.innerWidth, window.innerHeight);
    const dims = { W: world.W, H: world.H };
    useStore.setState({
      garden: { id: null, seed, dims, ownerName: user.name },
      plants: local?.plants?.length ? local.plants : seedPlants(),
      messages: local?.messages || [],
      muted: local?.muted || false, speed: local?.speed || 1,
    });
    try {
      const saved = await api('PUT', '/api/garden/mine', {
        seed, dims,
        plants: useStore.getState().plants, messages: useStore.getState().messages.slice(-50),
      });
      useStore.setState(s => ({ garden: { ...s.garden, id: saved.id } }));
    } catch (e) { /* server down — local-only session */ }
  }
  seedSeen();
  useStore.setState({ skin: skinFromString(user.id), boot: 'ready', debugOpen: DEBUG_PARAM });
}

/* ----- visitor: name + skin picked on the enter screen ----- */
export function enterVisitor(name, skin) {
  useStore.setState({ visitorName: name, skin, boot: 'ready' });
}
