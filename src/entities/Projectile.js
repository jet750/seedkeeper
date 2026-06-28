// Projectile.js
//
// Pooled ranged projectile (Sprint 4). GameScene creates a fixed pool at scene
// start and reuses instances; nothing is destroyed at runtime. A projectile
// flies in its facing direction at projSpeed, damages the first enemy it
// overlaps (GameScene wires the overlap), and deactivates once it has travelled
// projRange or hit something.

import Phaser from 'phaser';
import { PROJECTILE_HOMING_RAD_PER_S } from '../core/Constants.js';

const DIRECTION_VECTORS = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
};

export default class Projectile extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    // Defensive placeholder texture (GameScene also generates this).
    if (!scene.textures.exists('px_projectile')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xeac34f, 1);
      g.fillRect(0, 0, 8, 4);
      g.generateTexture('px_projectile', 8, 4);
      g.destroy();
    }

    super(scene, 0, 0, 'px_projectile');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(9);
    this.deactivate();
  }

  // opts (Sprint control-scheme-combat-input): { angle } fires along an arbitrary
  // angle (auto-target aim) instead of the cardinal `facing`; { target } makes the
  // shot home SLIGHTLY toward that enemy for near-misses. Omit both for the legacy
  // 4-direction cardinal shot.
  fire(x, y, facing, damage, range, speed, opts = {}) {
    this.damage = damage;
    this.range = range;
    this.startX = x;
    this.startY = y;
    this._speed = speed;
    this.homingTarget = opts.target || null;

    let angle;
    if (typeof opts.angle === 'number') {
      angle = opts.angle;
    } else {
      const dir = DIRECTION_VECTORS[facing] || DIRECTION_VECTORS.down;
      angle = Math.atan2(dir.y, dir.x);
    }

    this.setPosition(x, y).setActive(true).setVisible(true);
    this.body.enable = true;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.setRotation(angle);
  }

  // Auto-called by Phaser each frame for active scene objects.
  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (!this.active) return;
    // Slight homing toward a per-shot locked target — nudges near-misses on, NOT a
    // guided missile. Stops the instant the target dies / despawns.
    const t = this.homingTarget;
    if (t && t.active && !t.isDead && PROJECTILE_HOMING_RAD_PER_S > 0) {
      const cur = Math.atan2(this.body.velocity.y, this.body.velocity.x);
      const want = Phaser.Math.Angle.Between(this.x, this.y, t.x, t.y);
      const next = Phaser.Math.Angle.RotateTo(cur, want, PROJECTILE_HOMING_RAD_PER_S * (delta / 1000));
      this.setVelocity(Math.cos(next) * this._speed, Math.sin(next) * this._speed);
      this.setRotation(next);
    }
    const travelled = Phaser.Math.Distance.Between(this.startX, this.startY, this.x, this.y);
    if (travelled >= this.range) this.deactivate();
  }

  // Called by GameScene on overlap with an enemy.
  hit(enemy) {
    if (!this.active || enemy.isDead) return;
    enemy.takeDamage(this.damage, { x: this.x, y: this.y });
    this.deactivate();
  }

  deactivate() {
    this.setActive(false).setVisible(false);
    this.setVelocity(0, 0);
    this.homingTarget = null;
    if (this.body) this.body.enable = false;
  }
}
