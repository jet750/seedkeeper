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
// Per-tier visuals (Ember tier-diagnosis sprint): the kite silhouette is kept across all
// four tiers (so it always reads as "Ember, upgraded"), but EVERY tier now pairs a
// distinct CORE COLOUR with a clearly distinct SIZE step (not just L4) — so any two
// tiers read apart even on a small screen / in fast sub-second motion, and for
// colourblind players (the big size ramp carries the tier independently of hue):
//   L1 base bolt        — ORANGE  kite, base size,  orange spark trail.
//   L2 +damage          — CRIMSON kite, larger,     crimson trail + streaks.
//   L3 impact AoE        — VIOLET  kite, larger,     violet  trail + streaks (+ impact ring).
//   L4 wide "nuke" AoE   — BLUE    kite, largest,    blue    trail + streaks (+ wide ring).
// The 12px hit body is FIXED across tiers (verified: setSize locks it regardless of the
// sprite scale), so the bigger art never enlarges the hitbox — visuals only.
//
// Procedural only — every kite/spark/streak texture is generated once with graphics
// primitives; trails are Phaser particle emitters (one core spark + one streak) tinted
// per tier from the table below, so the trail colour also carries the tier.

import Phaser from 'phaser';
import { EMBER_HOMING_RAD_PER_S } from '../core/Constants.js';

// Per-tier (index = level-1) identity — the single source of truth for Ember tier colour.
//   scale = kite display scale (the big colourblind-safe SIZE step, ~2.3x across L1→L4);
//   kite  = which procedural two-tone kite texture (distinct body+core COLOUR per tier);
//   trail = tint applied to the core spark + streak emitters AND the AoE ring (see
//           SpellSystem.aoeRingVFX via SpellBolt.tierColor), so trail/ring match the bolt.
// Tweak freely; pure cosmetics — gameplay/hitbox is unchanged across tiers. // TUNE
const TIER_FX = [
  { scale: 1.0,  kite: 'fx_ember_kite_1', body: 0xff7a2a, core: 0xffd24a, trail: 0xffb24a }, // L1 orange
  { scale: 1.4,  kite: 'fx_ember_kite_2', body: 0xff2d1a, core: 0xffd24a, trail: 0xff6a3a }, // L2 crimson
  { scale: 1.85, kite: 'fx_ember_kite_3', body: 0xb83cff, core: 0xeaccff, trail: 0xc06bff }, // L3 violet
  { scale: 2.3,  kite: 'fx_ember_kite_4', body: 0x2e7bff, core: 0xeaf6ff, trail: 0x6cc4ff }  // L4 blue
];

export default class SpellBolt extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    SpellBolt.ensureTextures(scene);
    super(scene, 0, 0, 'fx_ember_kite_1');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);
    this.body.setSize(12, 12); // tight round hit body, FIXED 12px (independent of kite scale)

    // Trails — two ADD-blended particle emitters that follow this bolt and give it its
    // MOTION identity. Both use a neutral WHITE texture and are TINTED per tier in
    // applyTierVisuals (so the trail colour matches the bolt), then started/stopped as
    // the tier needs. core = round soft sparks (every tier); streak = fast elongated
    // slivers layered over the core for L2+ (a different SHAPE, so the upgrade reads
    // without relying on hue). All start dormant; deactivate() stops them.
    this.core = this._makeEmitter(scene, 'fx_ember_spark', {
      speed: { min: 0, max: 30 }, scale: { start: 1.15, end: 0 }, alpha: { start: 0.9, end: 0 },
      lifespan: 260, frequency: 14
    });
    this.streak = this._makeEmitter(scene, 'fx_ember_streak', {
      speed: { min: 16, max: 72 }, scale: { start: 1.2, end: 0 }, alpha: { start: 0.95, end: 0 },
      lifespan: 320, frequency: 18, rotate: { min: 0, max: 360 }
    });

    this._emitters = [this.core, this.streak];
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

  // Swap the kite texture/scale for the tier and (re)start the tier-tinted trails. The
  // hit body is left untouched so the projectile plays the same regardless of tier visuals.
  applyTierVisuals(tier, x, y) {
    const fx = TIER_FX[tier - 1];
    this.setTexture(fx.kite);
    this.setScale(fx.scale);
    for (const e of this._emitters) {
      e.stop();
      e.setParticleTint(fx.trail);
      e.setPosition(x, y);
    }
    this.core.start();
    if (tier >= 2) this.streak.start(); // L2+ add the fast elongated streak layer
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

  // The tier's colour swatch — the single source of truth shared with SpellSystem's AoE
  // ring so the blast matches the bolt that cast it (clamped to the valid tier range).
  static tierColor(tier) {
    return TIER_FX[Math.max(1, Math.min(TIER_FX.length, tier || 1)) - 1];
  }

  // Generate every kite/spark/streak texture once per scene (guarded). The four kites
  // share the SAME pointed-kite silhouette (leading tip at +x so rotation aims it) — only
  // the two-tone palette differs per tier, so each tier reads as the same Ember bolt in a
  // distinct colour. The spark + streak are neutral WHITE (tinted per tier at cast time).
  static ensureTextures(scene) {
    for (const fx of TIER_FX) SpellBolt._makeKiteTexture(scene, fx.kite, fx.body, fx.core);
    // Round core spark — neutral white, tinted per tier.
    if (!scene.textures.exists('fx_ember_spark')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('fx_ember_spark', 8, 8);
      g.destroy();
    }
    // Elongated streak sliver — neutral white, tinted per tier. A different SHAPE than the
    // round spark, so the streaks read as a distinct trail layer without relying on hue.
    if (!scene.textures.exists('fx_ember_streak')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 0.65);
      g.fillRoundedRect(0, 0, 14, 4, 2);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(2, 1, 9, 2, 1);
      g.generateTexture('fx_ember_streak', 14, 4);
      g.destroy();
    }
  }

  // A 24×14 pointed kite: an outer `body` flame-teardrop with a brighter inner `core`.
  static _makeKiteTexture(scene, key, body, core) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(body, 1);
    g.fillPoints([{ x: 22, y: 7 }, { x: 7, y: 0 }, { x: 0, y: 7 }, { x: 7, y: 14 }], true);
    g.fillStyle(core, 1);
    g.fillPoints([{ x: 16, y: 7 }, { x: 8, y: 3 }, { x: 4, y: 7 }, { x: 8, y: 11 }], true);
    g.generateTexture(key, 24, 14);
    g.destroy();
  }
}
