// registry.js — the spell-behaviour registry (Sprint magic-2; +Arc/Frost/Thornfield/
// Bulwark in magic-3).
//
// Maps a spell id (economy.json spells.list id) → its Spell implementation. This is THE
// list a new spell is added to (see Spell.js for the full 3-step seam). All SIX spells
// are now implemented (Sprout Sentinel landed in magic-4) — no id resolves to a fizzle.

import EmberSpell from './EmberSpell.js';
import ArcSpell from './ArcSpell.js';
import FrostSpell from './FrostSpell.js';
import ThornfieldSpell from './ThornfieldSpell.js';
import BulwarkSpell from './BulwarkSpell.js';
import SproutSentinelSpell from './SproutSentinelSpell.js';

const SPELL_BEHAVIORS = {
  ember: new EmberSpell(),
  arc: new ArcSpell(),
  frost: new FrostSpell(),
  thornfield: new ThornfieldSpell(),
  bulwark: new BulwarkSpell(),
  sprout_sentinel: new SproutSentinelSpell()
};

export function getSpellBehavior(id) {
  return SPELL_BEHAVIORS[id] || null;
}
