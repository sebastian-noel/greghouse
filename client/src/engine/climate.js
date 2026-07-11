// Descriptive-only read on ambient weather vs. soil drying — informational,
// does not feed the sim's decay math (useSimTick).
export function climateImpact(tempF, humidity) {
  if (tempF == null || humidity == null) return '';
  const hot = tempF >= 85, cold = tempF <= 50;
  const dry = humidity <= 35, humid = humidity >= 70;
  if (hot && dry) return 'hot & dry — soil dries out faster than usual';
  if (hot) return 'warm out — soil dries a bit faster than usual';
  if (dry) return 'dry air — soil dries a bit faster than usual';
  if (cold && humid) return 'cool & humid — soil stays moist longer';
  if (humid) return 'humid — soil stays moist longer';
  if (cold) return 'cool out — soil dries a bit slower than usual';
  return 'mild conditions — normal drying rate';
}
