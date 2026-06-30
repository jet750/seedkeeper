// FrostSpell.js — slow / freeze / ice field, "stop them so I can move" (Sprint magic-3).
//
// Cloned from the Ember template (Spell.js seam): a thin cast recipe reading FROST_TIERS
// and leaning on SpellSystem helpers — slowEnemy / slowEnemiesInRadius (the velocity
// damp), damageEnemiesInRadius (the nova), spawnField (the lingering ice zone + its
// floor decal), and frostVFX. No projectile.
//
// Upgrade ladder (level = 1 on unlock, +1 per Mage Mart upgrade):
//   L1 slow+root ONE enemy (+minor dmg) → L2 freeze NOVA (small AoE) → L3 lingering
//   ground-ice FIELD (persistent slow zone, floor decal) → L4 +field radius. blue_flower
//   spellPower scales damage + radii. Tier reads by SIZE: single → nova → field → bigger
//   field (the growing footprint carries it); the cyan hue is a secondary cue.
//
// Targeting: self-centred OR the locked target (auto — never a tap-to-place). The single-
// target tier auto-locks the nearest enemy; the nova/field centre is the locked target if
// there is one, else the player (so a ground spell never needs a second placement tap).

import Spell from './Spell.js';
import { FROST_TIERS, ARC_STRIKE_RANGE } from '../../core/Constants.js';

export default class FrostSpell extends Spell {
  get targetingPolicy() {
    return 'zone'; // AoE freeze → centre on the densest visible cluster (Phase 1 seam)
  }

  cast(system, ctx) {
    const { level, spellPower, x, y, target, placement } = ctx;
    const lvl = Math.max(1, Math.min(FROST_TIERS.length, level)); // 1..4
    const tier = FROST_TIERS[lvl - 1];
    const power = 1 + (spellPower || 0); // blue_flower magic node
    const damage = Math.max(1, Math.round(tier.damage * power));

    const locked = target && target.active && !target.isDead ? target : null;

    if (tier.novaRadius <= 0) {
      // L1 — single-target slow+root (+minor damage). Slow the nearest threat (the auto
      // target), else auto-lock the nearest enemy. (The zone centroid is for L2+ AoE.)
      const enemy = locked || system.nearestEnemy(x, y, ARC_STRIKE_RANGE);
      if (enemy) {
        enemy.takeDamage(damage, { x, y });
        system.slowEnemy(enemy, tier.slowMult, tier.slowMs);
        system.frostVFX(enemy.x, enemy.y, 40, lvl);
      } else {
        system.frostVFX(x, y, 40, lvl); // whiffed — a small puff (mana already spent)
      }
      return;
    }

    // L2+ — centre the nova/field on the Zone placement (densest visible cluster, or a
    // hard lock); else the locked target; else the player (self-centred fallback).
    const cx = placement ? placement.x : locked ? locked.x : x;
    const cy = placement ? placement.y : locked ? locked.y : y;
    const novaR = Math.round(tier.novaRadius * power);

    // Freeze nova: damage + slow everything caught in it.
    system.damageEnemiesInRadius(cx, cy, novaR, damage);
    system.slowEnemiesInRadius(cx, cy, novaR, tier.slowMult, tier.slowMs);
    system.frostVFX(cx, cy, novaR, lvl);

    // L3+ — drop a lingering ice FIELD (persistent slow zone, with a floor indicator).
    if (tier.fieldRadius > 0 && tier.fieldMs > 0) {
      system.spawnField({
        x: cx, y: cy, radius: Math.round(tier.fieldRadius * power), durationMs: tier.fieldMs,
        kind: 'frost', tier: lvl, slowMult: tier.slowMult, dmgPerTick: 0
      });
    }
  }
}
