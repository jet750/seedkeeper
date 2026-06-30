// ArcSpell.js — chain lightning, "thin this pack" (Sprint magic-3).
//
// Cloned from the Ember template (see Spell.js seam): a thin cast recipe that reads
// its tier from Constants (ARC_TIERS) and leans on SpellSystem helpers — here
// nearestEnemy() for the auto-lock strike/chain and lightningVFX() for the bolt.
// Unlike Ember it is INSTANT (no projectile): it strikes the nearest enemy, then
// chains to the nearest un-hit enemy within chainRange, with per-jump damage falloff.
//
// Upgrade ladder (level = 1 on unlock, +1 per Mage Mart upgrade):
//   L1 strike + chain to 2 → L2 +1 jump → L3 +chain range → L4 +per-jump damage
//   (higher falloff = less damage lost per jump). blue_flower spellPower scales damage.
// Tier reads by SHAPE/SIZE first: more jagged segments + a thicker, brighter, longer-
// reaching bolt (lightningVFX derives this from the tier), hue is a secondary cue.

import Spell from './Spell.js';
import { ARC_TIERS, ARC_STRIKE_RANGE } from '../../core/Constants.js';

export default class ArcSpell extends Spell {
  get targetingPolicy() {
    return 'bolt'; // first strike rides the nearest on-screen threat, then chains itself
  }

  cast(system, ctx) {
    const { level, spellPower, x, y, target } = ctx;
    const lvl = Math.max(1, Math.min(ARC_TIERS.length, level)); // 1..4 (drives chain + VFX tier)
    const tier = ARC_TIERS[lvl - 1];
    const power = 1 + (spellPower || 0); // blue_flower magic node

    // First strike: the locked target if there is one, else the nearest enemy in range.
    let current =
      target && target.active && !target.isDead
        ? target
        : system.nearestEnemy(x, y, ARC_STRIKE_RANGE);

    const nodes = [{ x, y }]; // VFX polyline starts at the player
    if (!current) {
      // Nothing in range — a short forward spark so the cast still reads (mana already spent).
      nodes.push({ x: x + Math.cos(ctx.angle) * 60, y: y + Math.sin(ctx.angle) * 60 });
      system.lightningVFX(nodes, lvl);
      return;
    }

    const hits = new Set();
    let fromX = x;
    let fromY = y;
    let jumpDamage = tier.damage * power;
    // The first strike + `chainCount` jumps = up to 1 + chainCount enemies.
    for (let jump = 0; jump <= tier.chainCount; jump++) {
      if (!current) break;
      current.takeDamage(Math.max(1, Math.round(jumpDamage)), { x: fromX, y: fromY });
      hits.add(current);
      nodes.push({ x: current.x, y: current.y });
      fromX = current.x;
      fromY = current.y;
      jumpDamage *= tier.falloff; // per-jump falloff (L4 keeps more of it)
      current = system.nearestEnemy(fromX, fromY, tier.chainRange, hits); // next un-hit target
    }

    system.lightningVFX(nodes, lvl);
  }
}
