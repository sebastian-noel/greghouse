// v1 header: cream bar, pixel title (long-press/dblclick → debug, kept as a
// shortcut), spacer, sound + debug toggles, share (owner), + add a plant
// (hidden for visitors).
import { useRef } from 'react';
import { useStore } from '../state/store.js';
import { audio } from '../engine/audio.js';
import { climateImpact } from '../engine/climate.js';
import { usePushNotifications } from '../hooks/usePushNotifications.js';

function WeatherBadge() {
  const weather = useStore(s => s.weather);
  if (!weather.loaded || weather.error || weather.tempF == null) return null;
  return (
    <div id="weather-badge">
      <span>Current Temperature: {weather.tempF.toFixed(1)}&deg;F &middot; Humidity: {Math.round(weather.humidity)}%</span>
      <span className="mini">{climateImpact(weather.tempF, weather.humidity)}</span>
    </div>
  );
}

export default function Header() {
  const isVisitor = useStore(s => s.isVisitor);
  const muted = useStore(s => s.muted);
  const debugOpen = useStore(s => s.debugOpen);
  const garden = useStore(s => s.garden);
  const config = useStore(s => s.config);
  const toast = useStore(s => s.toast);
  const openModal = useStore(s => s.openModal);
  const pressTimer = useRef(null);
  const push = usePushNotifications(!isVisitor && !!garden.id && !!config?.push?.enabled, config?.push?.publicKey);

  const toggleDebug = () => useStore.setState(s => ({ debugOpen: !s.debugOpen }));
  const startPress = () => {
    if (isVisitor) return;
    pressTimer.current = setTimeout(() => useStore.setState({ debugOpen: true }), 800);
  };
  const endPress = () => clearTimeout(pressTimer.current);

  function toggleMute() {
    useStore.setState(s => ({ muted: !s.muted }));
    audio.muted = useStore.getState().muted;
    useStore.getState().saveState();
  }

  function share() {
    if (!garden.id) return;
    const url = location.origin + location.pathname + '?g=' + garden.id;
    const done = () => toast('visit link copied — anyone with it can walk around (read-only)');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => openModal({ type: 'share', url }));
    } else {
      openModal({ type: 'share', url });
    }
  }

  async function togglePush() {
    const result = push.status === 'enabled' ? await push.disable() : await push.enable();
    toast(result.message);
  }

  return (
    <header>
      <h1 id="title" title="long-press for debug"
        onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress}
        onDoubleClick={() => { if (!isVisitor) toggleDebug(); }}>
        welcome to greg house, your virtual garden
      </h1>
      <WeatherBadge />
      <span className="spacer" />
      <button className="small" onClick={toggleMute}>sound: {muted ? 'off' : 'on'}</button>
      {!isVisitor && config?.push?.enabled && push.supported && (
        <button className="small" onClick={togglePush}>
          notifications: {push.status === 'enabled' ? 'on' : 'off'}
        </button>
      )}
      {!isVisitor && <button className="small" onClick={toggleDebug}>debug: {debugOpen ? 'on' : 'off'}</button>}
      {!isVisitor && <button className="small" onClick={share}>share</button>}
      {!isVisitor && <button className="small primary" onClick={() => openModal({ type: 'wizard' })}>+ add a plant</button>}
    </header>
  );
}
