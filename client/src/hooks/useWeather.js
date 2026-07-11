// Ambient weather badge: one-time browser geolocation → Open-Meteo current
// conditions, refreshed every 10 min. Informational only (see engine/climate.js).
import { useEffect } from 'react';
import { fetchWeather, getLocation } from '../api/weather.js';
import { useStore } from '../state/store.js';

const REFRESH_MS = 10 * 60 * 1000; // weather doesn't move fast enough to poll harder

export function useWeather() {
  const boot = useStore(s => s.boot);

  useEffect(() => {
    if (boot !== 'ready') return;
    let stopped = false;

    async function run() {
      try {
        const { lat, lon } = await getLocation();
        if (stopped) return;
        const w = await fetchWeather(lat, lon);
        if (!stopped) useStore.setState({ weather: { ...w, loaded: true, error: null } });
      } catch (e) {
        if (!stopped) useStore.setState({ weather: { loaded: true, tempF: null, humidity: null, error: e.message } });
      }
    }

    run();
    const iv = setInterval(run, REFRESH_MS);
    return () => { stopped = true; clearInterval(iv); };
  }, [boot]);
}
