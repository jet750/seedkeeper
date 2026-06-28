// ThornfieldSpell.js — ground denial, "deny this ground" (Sprint magic-3).
//
// Cloned from the Ember template (Spell.js seam): a thin cast recipe reading
// THORNFIELD_TIERS that drops a persistent ground FIELD via SpellSystem.spawnField.
// The field SLOWS + DoT-damages enemies pathing through it and NEVER touches the
// player (the field only ever iterates scene.enemies). At max tier it is dense enough
// to BLOCK pathing (spawnField adds a static collider barrier). No projectile.
//
// Upgrade ladder (level = 1 on unlock, +1 per Mage Mart upgrade):
//   L1 vine patch (slow + light DoT) → L2 +size → L3 +DoT (more/faster ticks) → L4
//   dense BARRIER (blocks pathing). blue_flower spellPower scales DoT + radius. Tier
//   reads by SIZE + tick density + a visibly denser, darker, spikier barrier rim at max.
//
// Targeting: auto-placed — at the locked target if there is one, else on the ground a
// fixed distance AHEAD of the player (along the aim angle). Never a second tap-to-place.

import Spell from './Spell.js';
import { THORNFIELD_TIERS, THORNFIELD_AHEAD_DIST } from '../../core/Constants.js';

export default class ThornfieldSpell extends Spell {
  cast(system, ctx) {
    const { level, spellPower, x, y, angle, target } = ctx;
    const lvl = Math.max(1, Math.min(THORNFIELD_TIERS.length, level)); // 1..4
    const tier = THORNFIELD_TIERS[lvl - 1];
    const power = 1 + (spellPower || 0); // blue_flower magic node

    // Auto-place: on the locked target, else on the ground ahead of the player.
    const locked = target && target.active && !target.isDead ? target : null;
    const cx = locked ? locked.x : x + Math.cos(angle) * THORNFIELD_AHEAD_DIST;
    const cy = locked ? locked.y : y + Math.sin(angle) * THORNFIELD_AHEAD_DIST;

    system.spawnField({
      x: cx,
      y: cy,
      radius: Math.round(tier.fieldRadius * power),
      durationMs: tier.fieldMs,
      kind: 'thorn',
      tier: lvl,
      slowMult: tier.slowMult,
      dmgPerTick: Math.max(1, Math.round(tier.dmgPerTick * power)),
      tickMs: tier.tickMs,
      blocks: tier.blocks
    });
  }
}
