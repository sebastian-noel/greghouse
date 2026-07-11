// v1 enter screen: ink-dark full page, green pixel title, tagline, then the
// mode-specific UI (owner login / "come in as" / visitor join).
import { useStore } from '../../state/store.js';
import { IS_VISITOR } from '../../hooks/useAuth.js';
import OwnerEnter from './OwnerEnter.jsx';
import VisitorJoin from './VisitorJoin.jsx';

export default function EnterScreen() {
  const boot = useStore(s => s.boot);
  const garden = useStore(s => s.garden);

  let sub = 'a garden group chat. come grow something.';
  if (boot === 'loading') sub = IS_VISITOR ? 'loading garden...' : sub;
  if (boot === 'notfound') sub = 'garden not found — double-check the link';
  if (boot === 'enter' && IS_VISITOR) sub = `you're visiting ${garden.ownerName}'s garden. pick a name and come in.`;

  return (
    <div id="enter-screen">
      <h1>the greenhouse</h1>
      <p id="enter-sub">{sub}</p>
      <div id="enter-ui">
        {boot === 'loading' && <p style={{ color: 'var(--gray)' }}>connecting...</p>}
        {boot === 'offline' && (
          <p style={{ color: 'var(--alert)', fontSize: 20 }}>
            can't reach the greenhouse server.<br /><br />
            start it with:<br /><b>npm run server</b>
          </p>
        )}
        {boot === 'enter' && (IS_VISITOR ? <VisitorJoin /> : <OwnerEnter />)}
      </div>
    </div>
  );
}
