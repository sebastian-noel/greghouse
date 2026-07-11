// Funny warn-banner lines shown on the owner's screen when a guest nags them
// to water a plant. {from} = guest name, {plant} = plant name. Kept clearly
// actionable (they all still say the plant needs water) but a little silly.
const WARN_LINES = [
  '{from} says {plant} is thirsty and making it everyone’s problem.',
  '{from} reports {plant} is drier than the group chat.',
  'URGENT: {from} says {plant} is one dry day from becoming a tumbleweed.',
  '{from} insists {plant} texted “u up?” — it needs water.',
  '{plant} is wilting dramatically and {from} demands justice (water).',
  '{from} would water {plant} themselves, but that’s literally your job.',
  '{from} is snitching: {plant} hasn’t had a drink in ages.',
  '{from} says {plant} is parched and holding you personally responsible.',
  '{plant} filed a complaint through {from}. The complaint is: water.',
  '{from} says {plant} would water itself but it has no hands.',
];

let lastIdx = -1;
export function pickWarnMessage(from, plant) {
  let i = Math.floor(Math.random() * WARN_LINES.length);
  if (WARN_LINES.length > 1 && i === lastIdx) i = (i + 1) % WARN_LINES.length; // no immediate repeat
  lastIdx = i;
  return WARN_LINES[i].replaceAll('{from}', from).replaceAll('{plant}', plant);
}
