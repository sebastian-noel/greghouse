import { useStore } from './state/store.js';
import { useAuthBoot } from './hooks/useAuth.js';
import { useGardenSync } from './hooks/useGardenSync.js';
import { useTelemetry } from './hooks/useTelemetry.js';
import { useSimTick } from './hooks/useSimTick.js';
import { useWeather } from './hooks/useWeather.js';
import EnterScreen from './components/EnterScreen/EnterScreen.jsx';
import Header from './components/Header.jsx';
import WorldViewport from './components/World/WorldViewport.jsx';
import ChatSidebar from './components/Chat/ChatSidebar.jsx';
import ModalHost from './components/Modals/ModalHost.jsx';
import DebugPanel from './components/DebugPanel.jsx';
import Toasts from './components/Toasts.jsx';
import Announcement from './components/Announcement.jsx';

export default function App() {
  useAuthBoot();
  const boot = useStore(s => s.boot);

  if (boot !== 'ready') return <><EnterScreen /><Toasts /></>;
  return <GardenShell />;
}

function GardenShell() {
  useGardenSync();
  useTelemetry();
  useSimTick();
  useWeather();
  const debugOpen = useStore(s => s.debugOpen);

  return (
    <div id="app">
      <Header />
      <Announcement />
      <div id="main">
        <WorldViewport />
        <ChatSidebar />
      </div>
      <ModalHost />
      {debugOpen && <DebugPanel />}
      <Toasts />
    </div>
  );
}
