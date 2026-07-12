// THE shared thresholds table (v1 values, verbatim). This exact table is
// also compiled into the CYD firmware (greenhouse_cyd.ino) — any change here
// MUST land there too, or the site and the device will disagree about mood.
export const SPECIES = {
  ficus: { commonName: 'Rubber plant', dryBelow: 35, soggyAbove: 80, decayPerMin: 1.2,
    personality: 'Melodramatic. Threatens to drop a leaf over every inconvenience.', suggest: 'Figaro' },
  cactus: { commonName: 'Cactus', dryBelow: 12, soggyAbove: 55, decayPerMin: 0.15,
    personality: 'Stoic. Openly judgmental about overwatering.', suggest: 'Pointy' },
  basil: { commonName: 'Basil', dryBelow: 45, soggyAbove: 85, decayPerMin: 2.5,
    personality: 'Anxious and needy. Aware it is technically a salad ingredient.', suggest: 'Basie' },
  pothos: { commonName: 'Pothos', dryBelow: 30, soggyAbove: 85, decayPerMin: 0.6,
    personality: 'Unbothered. Quietly convinced it is immortal.', suggest: 'Ivy' },
  monstera: { commonName: 'Monstera', dryBelow: 35, soggyAbove: 80, decayPerMin: 0.9,
    personality: 'Influencer energy. Vain about every new leaf.', suggest: 'Monty' },
  desert_rose: { commonName: 'Desert Rose', dryBelow: 20, soggyAbove: 65, decayPerMin: 0.3,
    personality: 'Sun-loving and patient. Dramatic flowers, absolutely no wet feet.', suggest: 'Rosie' },
  snake_plant: { commonName: 'Snake plant', dryBelow: 15, soggyAbove: 60, decayPerMin: 0.2,
    personality: 'Deadpan. Sleeps through everything.', suggest: 'Sid' }
};

// single source of mood truth — same integer + same pure function on the web
// client and the CYD → they can never disagree
export function moodFor(speciesId, moisture) {
  const sp = SPECIES[speciesId] || SPECIES.pothos;
  if (moisture < sp.dryBelow) return 'thirsty';
  if (moisture > sp.soggyAbove) return 'drowning';
  return 'happy';
}
