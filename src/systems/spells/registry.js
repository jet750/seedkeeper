// registry.js — the spell-behaviour registry (Sprint magic-2).
//
// Maps a spell id (economy.json spells.list id) → its Spell implementation. This is THE
// list a new spell is added to (see Spell.js for the full 3-step seam). Only Ember is
// implemented this sprint; the other five resolve to `undefined` here and cast a harmless
// fizzle (inert-but-owned) until their class lands.

import EmberSpell from './EmberSpell.js';

const SPELL_BEHAVIORS = {
  ember: new EmberSpell()
  // thornlash:      new ThornlashSpell(),
  // bramble_ward:   new BrambleWardSpell(),
  // pollen_bloom:   new PollenBloomSpell(),
  // wild_growth:    new WildGrowthSpell(),
  // sprout_sentinel:new SproutSentinelSpell(),
};

export function getSpellBehavior(id) {
  return SPELL_BEHAVIORS[id] || null;
}
