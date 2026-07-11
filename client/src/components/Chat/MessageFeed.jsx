// v1 feed: plant messages (persisted) and people chat (ephemeral) in one
// stream, ordered by time. Plant avatar squares pan the camera to the plant.
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../state/store.js';
import { getWorld, TILE } from '../../engine/worldgen.js';
import { cam } from '../../state/runtime.js';

const fmt = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

export default function MessageFeed() {
  const messages = useStore(s => s.messages);
  const peopleChat = useStore(s => s.peopleChat);
  const plants = useStore(s => s.plants);
  const seed = useStore(s => s.garden.seed);
  const dims = useStore(s => s.garden.dims);
  const feedRef = useRef(null);

  const feed = useMemo(() => {
    const all = [
      ...messages.map(m => ({ ...m, _people: false })),
      ...peopleChat.map((m, i) => ({ ...m, id: 'pc' + i + m.ts, _people: true })),
    ];
    all.sort((a, b) => a.ts - b.ts);
    return all.slice(-120);
  }, [messages, peopleChat]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  function jumpTo(plantId) {
    const i = plants.findIndex(p => p.id === plantId);
    const world = getWorld(seed, dims, window.innerWidth, window.innerHeight);
    const spot = world.spots[i];
    if (spot && cam.panToFn) cam.panToFn(spot.px, spot.py - 40);
  }

  return (
    <div id="feed" ref={feedRef}>
      {feed.map(m => {
        if (m._people) {
          return (
            <div key={m.id} className="msg visitor">
              <div className="avatar" style={{ background: 'var(--gray)' }}>{(m.name || '?')[0]}</div>
              <div className="body">
                <div className="who">{m.name}{m.isOwner && <span className="otag"> ⌂ owner</span>}</div>
                <span className="txt">{m.text}</span><span className="ts">{fmt(m.ts)}</span>
              </div>
            </div>
          );
        }
        const p = plants.find(x => x.id === m.plantId);
        if (!p) return null;
        return (
          <div key={m.id} className={'msg' + (m.kind === 'reaction' ? ' reaction' : '')}>
            <div className="avatar" style={{ background: p.potColor }} title={`go to ${p.name}`}
              onClick={() => jumpTo(p.id)}>{p.name[0]}</div>
            <div className="body">
              <div className="who">{p.name}</div>
              <span className="txt">{m.text}</span><span className="ts">{fmt(m.ts)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
