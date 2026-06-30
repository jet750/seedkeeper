// BulwarkSpell.js — self-cast block / dome, "survive this burst" (Sprint magic-3).
//
// Cloned from the Ember template (Spell.js seam): a thin cast recipe reading
// BULWARK_TIERS. Unlike the other spells it targets the PLAYER, not enemies — it
// raises a guard via player.activateBulwark() (the damage-negation + attack-lock live
// on the Player, which already owns invincibility/attack state) and draws the dome via
// SpellSystem.bulwarkDomeVFX. No projectile, no field.
//
// Upgrade ladder (level = 1 on unlock, +1 per Mage Mart upgrade):
//   L1 REACTIVE block (the first hit in a short armed window is negated, ~0.7s invuln)
//   → L2 longer reactive block → L3 STATIC invuln DOME (~3s cast-and-forget) → L4 +dome
//   duration. WHILE A GUARD IS UP THE PLAYER CANNOT ATTACK — that is its cost (gated in
//   Player.meleePressed/attack/fireSecondary via isBulwarkUp). Tier reads by a bigger,
//   brighter, longer-lived dome (the countdown ring shows the duration).

import Spell from './Spell.js';
import { BULWARK_TIERS } from '../../core/Constants.js';

export default class BulwarkSpell extends Spell {
  get targetingPolicy() {
    return 'self'; // dome/guard always sits on the player — no enemy placement
  }

  cast(system, ctx) {
    const lvl = Math.max(1, Math.min(BULWARK_TIERS.length, ctx.level)); // 1..4
    const tier = BULWARK_TIERS[lvl - 1];
    const player = system.scene.player;

    // The dome VFX lasts the guard's lifetime: the armed window for a reactive block,
    // or the full invuln duration for a dome.
    const vfxMs = tier.mode === 'dome' ? tier.durationMs : tier.armMs;
    if (tier.mode === 'dome') {
      player.activateBulwark({ mode: 'dome', durationMs: tier.durationMs });
    } else {
      player.activateBulwark({ mode: 'reactive', armMs: tier.armMs, negateMs: tier.negateMs });
    }
    system.bulwarkDomeVFX(player, tier.domeRadius, vfxMs, lvl);
  }
}
