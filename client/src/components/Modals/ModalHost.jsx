// v1 overlay/panel. Backdrop close requires the *pointerdown* to have started
// on the backdrop — a click whose target gets re-rendered mid-press (wizard
// steps) must not ghost-close the new modal.
import { useEffect, useRef } from 'react';
import { useStore } from '../../state/store.js';
import PlantCard from './PlantCard.jsx';
import ShareFallback from './ShareFallback.jsx';
import AddPlantWizard from './AddPlantWizard.jsx';

export default function ModalHost() {
  const modal = useStore(s => s.modal);
  const closeModal = useStore(s => s.closeModal);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    if (!modal) return;
    const onKey = e => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, closeModal]);

  if (!modal) return null;
  return (
    <div className="overlay"
      onPointerDown={e => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (e.target === e.currentTarget && downOnBackdrop.current) closeModal();
        downOnBackdrop.current = false;
      }}>
      <div className="panel">
        {modal.type === 'card' && <PlantCard plantId={modal.id} />}
        {modal.type === 'share' && <ShareFallback url={modal.url} />}
        {modal.type === 'wizard' && <AddPlantWizard />}
      </div>
    </div>
  );
}
