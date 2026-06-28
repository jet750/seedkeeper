// SpellSystem.js — the spell pipeline (Sprint magic-2).
//
// GameScene-owned system (like CombatSystem). Owns a pool of procedural SpellBolts and
// their enemy-overlap wiring, and dispatches a cast to the spell registry. The mana gate,
// cooldown and slot→id mapping live in GameScene.castSecondarySpell; this system handles
// the EFFECT side: resolve aim, run the spell's cast recipe, and provide the shared
// helpers (spawnBolt, damageInRadius, aoeRingVFX) every bolt/AoE spell reuses.

import SpellBolt from '../entities/SpellBolt.js';
import { getSpellBehavior } from './spells/registry.js';

const BOLT_POOL_SIZE = 10;

export default class SpellSystem {
  constructor(scene) {
    this.scene = scene;
    this.boltGroup = scene.physics.add.group();
    this.bolts = [];
    for (let i = 0; i < BOLT_POOL_SIZE; i++) {
      const b = new SpellBolt(scene);
      this.boltGroup.add(b);
      this.bolts.push(b);
    }
    // First-overlap-wins damage, mirroring the ranged projectile wiring.
    scene.physics.add.overlap(this.boltGroup, scene.slimeGroup, (b, e) => this.onBoltHit(b, e));
    scene.physics.add.overlap(this.boltGroup, scene.skeletonGroup, (b, e) => this.onBoltHit(b, e));
  }

  // True if this spell id has a registered effect (Ember this sprint). GameScene uses
  // this to keep inert-but-owned spells truly inert — no mana spent on a fizzle.
  hasEffect(id) {
    return !!getSpellBehavior(id);
  }

  // Run a spell's effect. Returns true if a real effect fired; false → no behaviour
  // registered (an inert-but-owned spell), so the caller plays the fizzle instead.
  cast(id, level) {
    const behavior = getSpellBehavior(id);
    if (!behavior) return false;
    const p = this.scene.player;
    const aim = this.scene.resolveAim(p.x, p.y);
    if (p.faceTowardAngle) p.faceTowardAngle(aim.angle); // sprite faces the cast
    behavior.cast(this, {
      level,
      spellPower: (p.statBonuses && p.statBonuses.spellPower) || 0,
      x: p.x,
      y: p.y,
      angle: aim.angle,
      target: aim.target
    });
    return true;
  }

  // Spawn a pooled bolt (used by EmberSpell + any future bolt spell). Drops the shot if
  // the pool is exhausted (rare — bolts are short-lived).
  spawnBolt(opts) {
    const b = this.bolts.find((x) => !x.active);
    if (!b) return;
    b.fire(opts);
  }

  onBoltHit(bolt, enemy) {
    if (!bolt.active || enemy.isDead) return;
    bolt.applyHit(enemy, this);
  }

  // AoE damage helper: damage every active enemy within `radius` of (x,y), skipping the
  // direct-hit enemy (it already took the bolt's damage). Plays a procedural blast ring
  // sized to `radius` and styled to the casting `tier`.
  damageInRadius(x, y, radius, damage, exclude, tier) {
    if (radius <= 0 || damage <= 0) {
      if (radius > 0) this.aoeRingVFX(x, y, radius, tier);
      return;
    }
    const r2 = radius * radius;
    const list = this.scene.enemies || [];
    for (const e of list) {
      if (!e.active || e.isDead || e === exclude) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) e.takeDamage(damage, { x, y });
    }
    this.aoeRingVFX(x, y, radius, tier);
  }

  // Procedural impact blast — a double ring + a quick core flash that expand to the blast's
  // TRUE radius and fade, so the visual lands exactly on the hitbox. The growing-ring SHAPE
  // and the radius itself (52px L3 vs 112px L4) carry the read for colourblind players; the
  // tier colour (warm L3 → blue L4, matching the bolt) is a secondary, redundant cue.
  aoeRingVFX(x, y, radius, tier) {
    const blue = (tier || 0) >= 4;
    const stroke = blue ? 0x6cc4ff : 0xffd24a;
    const fill = blue ? 0x2e7bff : 0xff8a3c;
    // Outer ring — grows from a tight core to the full blast radius.
    const outer = this.scene.add
      .circle(x, y, radius, fill, 0.18)
      .setStrokeStyle(4, stroke, 0.95)
      .setDepth(11)
      .setScale(0.22);
    this.scene.tweens.add({
      targets: outer,
      scale: 1,
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => outer.destroy()
    });
    // Inner ring — a second, lighter ring trailing the outer one for a layered blast read.
    const inner = this.scene.add
      .circle(x, y, radius, fill, 0)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setDepth(11)
      .setScale(0.1);
    this.scene.tweens.add({
      targets: inner,
      scale: 0.7,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => inner.destroy()
    });
  }
}
