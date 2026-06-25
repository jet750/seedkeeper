// lootTable.js
//
// Shared weighted seed-drop table used by every enemy on death (Slime,
// Skeleton). Common early crops are weighted high and rare magic crops are low, so
// killing enemies is a viable but unreliable way to stock seeds — guaranteed drops
// (the skeleton's red_berry) are layered on top by the caller, not here.
// v4 (Sprint 10): keys repointed to the reconciled 10-growable catalog (retired
// corn/cauliflower dropped; blue_flower_2 → blue_flower).

const SEED_DROP_WEIGHTS = {
  carrots: 30,
  sunflower: 22,
  wheat: 20,
  tomato: 15,
  pumpkin: 12,
  cucumber: 10,
  beanstalk: 8,
  pineapple: 5,
  red_berry: 3,
  blue_flower: 2
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
