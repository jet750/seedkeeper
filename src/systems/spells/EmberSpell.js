// EmberSpell.js — the first (and template) spell implementation (Sprint magic-2).
//
// Ember is a semi-homing single-target bolt that gains an impact AoE at higher levels.
// It is built end-to-end as the reference every other spell clones (see Spell.js seam).
// All tuning lives in Constants.js (EMBER_*); this file is just the cast recipe.
//
// Upgrade ladder (level = 1 on unlock, +1 per Mage Mart upgrade):
//   L1 base bolt → L2 +damage → L3 small impact AoE on hit → L4 wide "diameter nuke" AoE.
// blue_flower spellPower scales damage + AoE radius. No colour-only identity: the bolt's
// kite silhouette + spark trail (SpellBolt) carry it.

import Spell from './Spell.js';
import { EMBER_TIERS, EMBER_BOLT_SPEED, EMBER_BOLT_RANGE } from '../../core/Constants.js';

export default class EmberSpell extends Spell {
  cast(system, ctx) {
    const { level, spellPower, x, y, angle, target } = ctx;
    const tier = EMBER_TIERS[Math.max(0, Math.min(EMBER_TIERS.length - 1, level - 1))];
    const power = 1 + (spellPower || 0); // blue_flower magic node (≤ +50%)
    system.spawnBolt({
      x,
      y,
      angle,
      target,
      speed: EMBER_BOLT_SPEED,
      range: EMBER_BOLT_RANGE,
      damage: Math.round(tier.damage * power),
      aoeRadius: tier.aoeRadius > 0 ? Math.round(tier.aoeRadius * power) : 0,
      aoeDamage: Math.round(tier.damage * power * tier.aoeDamageMult)
    });
  }
}
