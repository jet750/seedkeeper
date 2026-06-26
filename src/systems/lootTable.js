// lootTable.js
//
// Shared weighted seed-drop table used by every enemy on death (Slime,
// Skeleton). Weights are config-driven — entities.json `loot.seedDropWeights` /
// `loot.bundleDropWeights` are the source of truth; the maps below are only a
// fallback for the (defensive) case where a caller hasn't threaded gameData in.
// Guaranteed drops (the skeleton's red_berry) are layered on top by the caller,
// not here.
//
// Sprint 14b: the old seed-drop table over-weighted carrots (30) and tapered the
// rest, so kills felt carrot-dominated rather than random. The selection RNG
// (weightedRandom) was correct — the FEEL came from the weighting. The defaults
// here now mirror the flattened two-tier config: every everyday crop shares one
// weight, high-value crops (pineapple + magic crops) stay rarer.

const SEED_DROP_WEIGHTS = {
  carrots: 10,
  sunflower: 10,
  wheat: 10,
  tomato: 10,
  pumpkin: 10,
  cucumber: 10,
  beanstalk: 10,
  pineapple: 4,
  red_berry: 4,
  blue_flower: 4
};

// Plant-bundle drop table (Sprint 7). Bundles are pre-grown plants that go
// straight to the bank, so the weighting leans toward slow-grow / high-value
// crops (the magic tree) and away from the cheap early crops.
const BUNDLE_DROP_WEIGHTS = {
  tomato: 20,
  pumpkin: 18,
  wheat: 15,
  beanstalk: 12,
  pineapple: 12,
  blue_flower: 12,
  red_berry: 6
};

// Generic weighted pick over a { key: weight } map. Re-rolls Math.random() every
// call, so consecutive picks are independent — there is no sticky index.
export function weightedRandom(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    r -= weight;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0];
}

// Returns a plant-type key chosen by weighted random selection. Prefers the
// config table (gameData.loot.seedDropWeights) so the drop spread is tunable in
// entities.json; falls back to the module default if gameData isn't supplied.
export function getRandomSeedDrop(gameData) {
  const weights =
    (gameData && gameData.loot && gameData.loot.seedDropWeights) || SEED_DROP_WEIGHTS;
  return weightedRandom(weights);
}

// Returns the plant type for an enemy bundle drop (config-driven, same pattern).
export function getRandomBundleDrop(gameData) {
  const weights =
    (gameData && gameData.loot && gameData.loot.bundleDropWeights) || BUNDLE_DROP_WEIGHTS;
  return weightedRandom(weights);
}
