// SproutSentinelSpell.js — summon a persistent guardian turret (Sprint magic-4).
//
// The sixth spell, cloned from the Ember template seam (Spell.js) but the FIRST
// persistent-entity spell: instead of an instant effect it PLANTS a SproutSentinel
// (src/entities/SproutSentinel.js) via SpellSystem.spawnSentinel. The turret then
// lives, auto-fires and despawns on its own. Reads SENTINEL_TIERS for the linear L1→L4
// ladder; blue_flower spellPower scales damage + range (mirrors Ember). Capped at one
// active (spawnSentinel REPLACES the standing turret). Auto-plants just AHEAD of the
// player along the aim angle — NEVER a tap-to-place — so it works identically on
// desktop and mobile.
//
// Upgrade ladder (level = 1 on unlock, +1 per Mage Mart upgrade):
//   L1 base turret → L2 +damage/fire-rate → L3 +lifetime → L4 +all. Tier reads by how
//   hard/fast/long the turret fights; the body sprite is identical across tiers.

import Spell from './Spell.js';
import { SENTINEL_TIERS, SENTINEL_AHEAD_DIST } from '../../core/Constants.js';

export default class SproutSentinelSpell extends Spell {
  get targetingPolicy() {
    return 'self'; // planted just ahead of the player along the aim — not an enemy placement
  }

  cast(system, ctx) {
    const { level, spellPower, x, y, angle } = ctx;
    const lvl = Math.max(1, Math.min(SENTINEL_TIERS.length, level)); // 1..4
    const tier = SENTINEL_TIERS[lvl - 1];
    const power = 1 + (spellPower || 0); // blue_flower magic node (≤ +50%)

    // Auto-plant just ahead of the player along the aim angle (no second placement tap).
    const px = x + Math.cos(angle) * SENTINEL_AHEAD_DIST;
    const py = y + Math.sin(angle) * SENTINEL_AHEAD_DIST;

    system.spawnSentinel({
      x: px,
      y: py,
      tier: lvl,
      mode: 'ranged', // base turret; melee/mage branches plug in at the entity's mode seam
      damage: Math.max(1, Math.round(tier.damage * power)),
      fireMs: tier.fireMs,
      lifetimeMs: tier.lifetimeMs,
      range: Math.round(tier.range * power)
    });
  }
}
