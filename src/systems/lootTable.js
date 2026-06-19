// lootTable.js
//
// Shared weighted seed-drop table used by every enemy on death (Slime,
// Skeleton). Common plants are weighted high and Glowshroom is rare, so killing
// enemies is a viable but unreliable way to stock seeds — guaranteed drops (the
// skeleton's glowshroom) are layered on top by the caller, not here.

const SEED_DROP_WEIGHTS = {
  red_mushroom: 30,
  blue_flower: 25,
  golden_wheat: 25,
  green_herb: 10,
  sunflower: 9,
  glowshroom: 1
};

// Plant-bundle drop table (Sprint 7). Bundles are pre-grown plants that go
// straight to the bank, so the weighting leans toward slow-grow / high-value
// plants (green herb, the expensive late-game staple) and away from sunflower.
const BUNDLE_DROP_WEIGHTS = {
  red_mushroom: 20,
  blue_flower: 20,
  golden_wheat: 15,
  green_herb: 25,
  glowshroom: 15,
  sunflower: 5
};

// Generic weighted pick over a { key: weight } map.
export function weightedRandom(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    r -= weight;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0];
}

// Returns a plant-type key chosen by weighted random selection.
export function getRandomSeedDrop() {
  return weightedRandom(SEED_DROP_WEIGHTS);
}

// Returns the plant type for an enemy bundle drop.
export function getRandomBundleDrop() {
  return weightedRandom(BUNDLE_DROP_WEIGHTS);
}
