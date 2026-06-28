// Spell.js — base class / interface for a castable spell EFFECT (Sprint magic-2).
//
// ════════════════════════════════════════════════════════════════════════════
// THE SPELL TEMPLATE SEAM — to add the next spell (Thornlash, Bramble Ward, …):
//   1. economy.json → spells.list: add/confirm its catalog entry (id, name, flavor,
//      unlock + upgrades in souls, manaCost). This already exists for all six.
//   2. Create src/systems/spells/<Name>Spell.js extending this class; implement
//      cast(system, ctx). Use `system` helpers — spawnBolt(), damageInRadius(),
//      aoeRingVFX() — and read `ctx.level` (1..maxLevel) for the upgrade ladder and
//      `ctx.spellPower` (blue_flower) for stat scaling.
//   3. Register it in registry.js: `{ …, <id>: new <Name>Spell() }`.
//
// EVERYTHING ELSE IS PROVIDED by the framework and needs no per-spell work:
//   • fire routing + TYPE gating (ranged=ammo / spell=mana) — Player.fireSecondary
//   • mana cost lookup, canCast/spendMana, cast cooldown — GameScene.castSecondarySpell
//   • unlock=level-1 + souls upgrade economy — GameScene.spellLevel / Mage Mart
//   • slot mapping, HUD cost/lock labels, radial/strip — secondary:meta
//   • targeting (locked enemy / cursor / facing) — GameScene.resolveAim via system
//   • the pooled procedural bolt + enemy overlap + AoE — SpellSystem / SpellBolt
//
// A spell with no registered behaviour is "inert-but-owned": it unlocks + is selectable
// but casts a harmless fizzle (no projectile/damage) until its class is implemented.
// ════════════════════════════════════════════════════════════════════════════

export default class Spell {
  // ctx: { level, spellPower, x, y, angle, target }
  // `system` is the SpellSystem (bolt pool + AoE + VFX helpers).
  cast(/* system, ctx */) {
    throw new Error('Spell.cast() must be implemented by the subclass');
  }
}
