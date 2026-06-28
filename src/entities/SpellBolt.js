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
// Procedural only — the bolt + spark textures are generated once with graphics
// primitives; the trail is a Phaser particle emitter that follows the bolt.

import Phaser from 'phaser';
import { EMBER_HOMING_RAD_PER_S } from '../core/Constants.js';

export default class SpellBolt extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    SpellBolt.ensureTextures(scene);
    super(scene, 0, 0, 'fx_ember_bolt');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);
    this.body.setSize(12, 12); // tight round hit body, independent of the kite art

    // Spark trail — a particle emitter that follows this bolt. Streaming sparks behind
    // the kite give the bolt its MOTION identity. Stopped while the bolt is dormant.
    this.trail = scene.add.particles(0, 0, 'fx_ember_spark', {
      speed: { min: 0, max: 26 },
      scale: { start: 1.0, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: 240,
      frequency: 16,
      blendMode: 'ADD',
      emitting: false
    });
    this.trail.setDepth(9);
    this.trail.startFollow(this);

    this.deactivate();
  }

  // opts: { x, y, angle, target, speed, range, damage, aoeRadius, aoeDamage }
  fire(opts) {
    this.damage = opts.damage || 0;
    this.aoeRadius = opts.aoeRadius || 0;
    this.aoeDamage = opts.aoeDamage || 0;
    this.range = opts.range;
    this._speed = opts.speed;
    this.startX = opts.x;
    this.startY = opts.y;
    this.homingTarget = opts.target || null;

    this.setPosition(opts.x, opts.y).setActive(true).setVisible(true).setRotation(opts.angle);
    this.body.enable = true;
    this.setVelocity(Math.cos(opts.angle) * opts.speed, Math.sin(opts.angle) * opts.speed);
    this.trail.setPosition(opts.x, opts.y);
    this.trail.start();
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
  // has an AoE) a blast at the impact point, then retire.
  applyHit(enemy, system) {
    if (!this.active || enemy.isDead) return;
    const ix = this.x;
    const iy = this.y;
    enemy.takeDamage(this.damage, { x: ix, y: iy });
    if (this.aoeRadius > 0) system.damageInRadius(ix, iy, this.aoeRadius, this.aoeDamage, enemy);
    this.deactivate();
  }

  deactivate() {
    this.setActive(false).setVisible(false);
    this.setVelocity(0, 0);
    this.homingTarget = null;
    if (this.body) this.body.enable = false;
    if (this.trail) this.trail.stop();
  }

  // Generate the bolt + spark textures once per scene (guarded). The bolt is a pointed
  // kite (leading tip at +x so rotation aims it), an orange flame body with a brighter
  // yellow core — a distinct arrowhead silhouette, NOT the ranged bow's flat bar.
  static ensureTextures(scene) {
    if (!scene.textures.exists('fx_ember_bolt')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xff7a2a, 1);
      g.fillPoints([{ x: 22, y: 7 }, { x: 7, y: 0 }, { x: 0, y: 7 }, { x: 7, y: 14 }], true);
      g.fillStyle(0xffd24a, 1);
      g.fillPoints([{ x: 16, y: 7 }, { x: 8, y: 3 }, { x: 4, y: 7 }, { x: 8, y: 11 }], true);
      g.generateTexture('fx_ember_bolt', 24, 14);
      g.destroy();
    }
    if (!scene.textures.exists('fx_ember_spark')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffb347, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('fx_ember_spark', 8, 8);
      g.destroy();
    }
  }
}
