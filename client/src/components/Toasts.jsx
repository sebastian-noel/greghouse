import { useStore } from '../state/store.js';

export default function Toasts() {
  const toasts = useStore(s => s.toasts);
  return (
    <>
      {toasts.map((t, i) => (
        <div key={t.id} className="toast" style={{ bottom: 18 + i * 52 }}>{t.text}</div>
      ))}
    </>
  );
}
