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
  // direct-hit enemy (it already took the bolt's damage). Plays a procedural blast ring.
  damageInRadius(x, y, radius, damage, exclude) {
    if (radius <= 0 || damage <= 0) {
      if (radius > 0) this.aoeRingVFX(x, y, radius);
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
    this.aoeRingVFX(x, y, radius);
  }

  // Procedural impact blast — an expanding, fading ring at the hit point. Shape + motion
  // (a growing ring) reads as a blast regardless of colour.
  aoeRingVFX(x, y, radius) {
    const ring = this.scene.add
      .circle(x, y, radius, 0xff8a3c, 0)
      .setStrokeStyle(3, 0xffd24a, 0.95)
      .setDepth(11)
      .setScale(0.2);
    this.scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy()
    });
  }
}
