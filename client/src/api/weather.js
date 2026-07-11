// Open-Meteo — free, keyless, CORS-enabled (no proxy needed, unlike the soil
// telemetry). https://open-meteo.com/en/docs
export async function fetchWeather(lat, lon, signal) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,relative_humidity_2m&temperature_unit=fahrenheit';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('weather ' + res.status);
  const j = await res.json();
  const c = j.current || {};
  return { tempF: c.temperature_2m, humidity: c.relative_humidity_2m };
}

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });
}
