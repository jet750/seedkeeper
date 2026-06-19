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

// Returns a plant-type key chosen by weighted random selection.
export function getRandomSeedDrop() {
  const total = Object.values(SEED_DROP_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [type, weight] of Object.entries(SEED_DROP_WEIGHTS)) {
    r -= weight;
    if (r <= 0) return type;
  }
  return 'red_mushroom';
}
