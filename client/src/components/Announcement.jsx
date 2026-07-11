// Owner-only warn banner, just below the top bar. A visitor pressing "warn"
// on a thirsty plant lands here (server → useGardenSync → showAnnouncement).
// Keyed by announcement.id so each new (spammed) warn re-mounts fresh: it
// slides in, holds 3s, then fades out.
import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';

function Banner({ ann }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), 3000); // hold, then fade
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={'announce' + (leaving ? ' leaving' : '')} role="status" aria-live="polite">
      {ann.text}
    </div>
  );
}

export default function Announcement() {
  const ann = useStore(s => s.announcement);
  if (!ann) return null;
  return <Banner key={ann.id} ann={ann} />;
}
