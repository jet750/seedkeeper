// SpellBolt.js
//
// A pooled, procedurally-drawn spell projectile (Sprint magic-2). Built for the spell
// template: any single-target/AoE bolt spell reuses it via SpellSystem.spawnBolt(). It
// is deliberately NOT the ranged Projectile — a spell must read as magic, not a bow
// shot, so the silhouette + trail differ by SHAPE and MOTION (colourblind-safe), not
// just colour: a pointed flame-kite that leads with its tip, trailing a stream of
// fading sparks. A future "dark Ember" mirror reuses this exact shape + spark motion in
// a dark palette, so it reads as the dark version of this spell by more than hue.
//
// Per-tier visuals (Ember Balance + VFX sprint): the kite silhouette is kept across all
// four tiers (so it always reads as "Ember, upgraded"), but each tier pairs a COLOUR step
// with a SIZE step + a distinct trail streak, so the upgrade reads even for colourblind
// players (size/shape/motion carry it, not hue):
//   L1 base bolt           — orange kite, orange spark trail.
//   L2 +damage             — orange kite, slightly larger, + bright-red streaks.
//   L3 impact AoE          — orange kite, larger, + blue streaks  (+ visible impact ring).
//   L4 wide "nuke" AoE     — full-BLUE kite, largest, blue sparks + blue streaks (+ wide ring).
//
// Procedural only — every bolt/spark/streak texture is generated once with graphics
// primitives; trails are Phaser particle emitters that follow the bolt.

import Phaser from 'phaser';
import { EMBER_HOMING_RAD_PER_S } from '../core/Constants.js';

// Per-tier (index = level-1) appearance. scale = bolt display scale (the colourblind-safe
// SIZE step); bolt = which kite texture; spark = which core-spark trail; streak = which
// streak emitter (or null). The hit body stays a fixed 12px regardless — visuals only,
// so gameplay/hitbox is unchanged across tiers. Tweak freely; pure cosmetics. // TUNE
const TIER_FX = [
  { scale: 1.0,  bolt: 'fx_ember_bolt',      spark: 'warm', streak: null },  // L1
  { scale: 1.18, bolt: 'fx_ember_bolt',      spark: 'warm', streak: 'red' }, // L2
  { scale: 1.34, bolt: 'fx_ember_bolt',      spark: 'warm', streak: 'blue' },// L3
  { scale: 1.55, bolt: 'fx_ember_bolt_blue', spark: 'blue', streak: 'blue' } // L4
];

export default class SpellBolt extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    SpellBolt.ensureTextures(scene);
    super(scene, 0, 0, 'fx_ember_bolt');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);
    this.body.setSize(12, 12); // tight round hit body, independent of the kite art/scale

    // Trails — particle emitters that follow this bolt. The streaming sparks behind the
    // kite give the bolt its MOTION identity. All start dormant; fire() turns on only the
    // ones the cast tier needs, deactivate() stops them all.
    //  - warmSpark / blueSpark: the core spark trail (round, soft). One is on at a time.
    //  - redStreak / blueStreak: longer/faster slivers layered over the core for L2+.
    this.warmSpark = this._makeEmitter(scene, 'fx_ember_spark', {
      speed: { min: 0, max: 26 }, scale: { start: 1.0, end: 0 }, alpha: { start: 0.85, end: 0 },
      lifespan: 240, frequency: 16
    });
    this.blueSpark = this._makeEmitter(scene, 'fx_ember_spark_blue', {
      speed: { min: 0, max: 26 }, scale: { start: 1.0, end: 0 }, alpha: { start: 0.85, end: 0 },
      lifespan: 240, frequency: 16
    });
    // Streaks read as fast, elongated slivers (different SHAPE + faster MOTION than the
    // round core spark) so the tier change is legible without relying on colour.
    const streakCfg = {
      speed: { min: 12, max: 64 }, scale: { start: 1.15, end: 0 }, alpha: { start: 0.95, end: 0 },
      lifespan: 300, frequency: 20, rotate: { min: 0, max: 360 }
    };
    this.redStreak = this._makeEmitter(scene, 'fx_ember_streak_red', streakCfg);
    this.blueStreak = this._makeEmitter(scene, 'fx_ember_streak_blue', streakCfg);

    this._emitters = [this.warmSpark, this.blueSpark, this.redStreak, this.blueStreak];
    this.tier = 1;
    this.deactivate();
  }

  // Build one ADD-blended, dormant, bolt-following emitter from a shared config.
  _makeEmitter(scene, texture, cfg) {
    const e = scene.add.particles(0, 0, texture, { ...cfg, blendMode: 'ADD', emitting: false });
    e.setDepth(9);
    e.startFollow(this);
    return e;
  }

  // opts: { x, y, angle, target, speed, range, damage, aoeRadius, aoeDamage, tier }
  fire(opts) {
    this.damage = opts.damage || 0;
    this.aoeRadius = opts.aoeRadius || 0;
    this.aoeDamage = opts.aoeDamage || 0;
    this.range = opts.range;
    this._speed = opts.speed;
    this.startX = opts.x;
    this.startY = opts.y;
    this.homingTarget = opts.target || null;
    this.tier = Math.max(1, Math.min(TIER_FX.length, opts.tier || 1));

    this.applyTierVisuals(this.tier, opts.x, opts.y);

    this.setPosition(opts.x, opts.y).setActive(true).setVisible(true).setRotation(opts.angle);
    this.body.enable = true;
    this.setVelocity(Math.cos(opts.angle) * opts.speed, Math.sin(opts.angle) * opts.speed);
  }

  // Swap the kite texture/scale for the tier and (re)start only the trails this tier uses.
  // Hit body left untouched so the projectile plays the same regardless of tier visuals.
  applyTierVisuals(tier, x, y) {
    const fx = TIER_FX[tier - 1];
    this.setTexture(fx.bolt);
    this.setScale(fx.scale);
    for (const e of this._emitters) e.stop();
    const core = fx.spark === 'blue' ? this.blueSpark : this.warmSpark;
    const streak = fx.streak === 'red' ? this.redStreak : fx.streak === 'blue' ? this.blueStreak : null;
    core.setPosition(x, y);
    core.start();
    if (streak) {
      streak.setPosition(x, y);
      streak.start();
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (!this.active) return;
    // Semi-homing (stronger than the bow's nudge, weaker than a guided missile): turn
    // toward the locked target each frame. Stops the instant the target dies/despawns.
    const t = this.homingTarget;
    if (t && t.active && !t.isDead && EMBER_HOMING_RAD_PER_S > 0) {
      const cur = Math.atan2(this.body.velocity.y, this.body.velocity.x);
      const want = Phaser.Math.Angle.Between(this.x, this.y, t.x, t.y);
      const next = Phaser.Math.Angle.RotateTo(cur, want, EMBER_HOMING_RAD_PER_S * (delta / 1000));
      this.setVelocity(Math.cos(next) * this._speed, Math.sin(next) * this._speed);
    }
    // Always point the kite where it's actually travelling (tip leads).
    this.setRotation(Math.atan2(this.body.velocity.y, this.body.velocity.x));
    if (Phaser.Math.Distance.Between(this.startX, this.startY, this.x, this.y) >= this.range) {
      this.deactivate();
    }
  }

  // Called by SpellSystem on overlap with an enemy: direct damage, then (if this tier
  // has an AoE) a blast at the impact point — sized + coloured to the tier — then retire.
  applyHit(enemy, system) {
    if (!this.active || enemy.isDead) return;
    const ix = this.x;
    const iy = this.y;
    enemy.takeDamage(this.damage, { x: ix, y: iy });
    if (this.aoeRadius > 0) system.damageInRadius(ix, iy, this.aoeRadius, this.aoeDamage, enemy, this.tier);
    this.deactivate();
  }

  deactivate() {
    this.setActive(false).setVisible(false);
    this.setVelocity(0, 0);
    this.homingTarget = null;
    if (this.body) this.body.enable = false;
    if (this._emitters) for (const e of this._emitters) e.stop();
  }

  // Generate every bolt/spark/streak texture once per scene (guarded). Two kite textures
  // share the SAME pointed-kite silhouette (leading tip at +x so rotation aims it) — only
  // the palette differs, so L4 reads as the blue version of the same Ember bolt:
  //   fx_ember_bolt       — warm: orange body, yellow core (L1-L3).
  //   fx_ember_bolt_blue  — cool: blue body, white-cyan core (L4 "full blue flame").
  // Plus round core sparks (warm/blue) and elongated streak slivers (red/blue).
  static ensureTextures(scene) {
    // Warm kite (orange body + yellow core).
    if (!scene.textures.exists('fx_ember_bolt')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xff7a2a, 1);
      g.fillPoints([{ x: 22, y: 7 }, { x: 7, y: 0 }, { x: 0, y: 7 }, { x: 7, y: 14 }], true);
      g.fillStyle(0xffd24a, 1);
      g.fillPoints([{ x: 16, y: 7 }, { x: 8, y: 3 }, { x: 4, y: 7 }, { x: 8, y: 11 }], true);
      g.generateTexture('fx_ember_bolt', 24, 14);
      g.destroy();
    }
    // Blue kite — identical silhouette, cool palette (blue body + white-cyan core).
    if (!scene.textures.exists('fx_ember_bolt_blue')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x2e7bff, 1);
      g.fillPoints([{ x: 22, y: 7 }, { x: 7, y: 0 }, { x: 0, y: 7 }, { x: 7, y: 14 }], true);
      g.fillStyle(0xcfeaff, 1);
      g.fillPoints([{ x: 16, y: 7 }, { x: 8, y: 3 }, { x: 4, y: 7 }, { x: 8, y: 11 }], true);
      g.generateTexture('fx_ember_bolt_blue', 24, 14);
      g.destroy();
    }
    // Round core sparks.
    if (!scene.textures.exists('fx_ember_spark')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffb347, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('fx_ember_spark', 8, 8);
      g.destroy();
    }
    if (!scene.textures.exists('fx_ember_spark_blue')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x6cc4ff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('fx_ember_spark_blue', 8, 8);
      g.destroy();
    }
    // Elongated streak slivers (bright core + tinted body) — a different SHAPE than the
    // round spark, so the streaks read as a distinct trail layer without relying on hue.
    SpellBolt._makeStreakTexture(scene, 'fx_ember_streak_red', 0xff3a22, 0xffd8a0);
    SpellBolt._makeStreakTexture(scene, 'fx_ember_streak_blue', 0x2e9bff, 0xe6f4ff);
  }

  // A 14×4 horizontal sliver: a tinted capsule body with a brighter inner core.
  static _makeStreakTexture(scene, key, body, core) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(body, 1);
    g.fillRoundedRect(0, 0, 14, 4, 2);
    g.fillStyle(core, 1);
    g.fillRoundedRect(2, 1, 9, 2, 1);
    g.generateTexture(key, 14, 4);
    g.destroy();
  }
}
