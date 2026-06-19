// Projectile.js
//
// Pooled ranged projectile (Sprint 4). GameScene creates a fixed pool at scene
// start and reuses instances; nothing is destroyed at runtime. A projectile
// flies in its facing direction at projSpeed, damages the first enemy it
// overlaps (GameScene wires the overlap), and deactivates once it has travelled
// projRange or hit something.

import Phaser from 'phaser';

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

  fire(x, y, facing, damage, range, speed) {
    const dir = DIRECTION_VECTORS[facing] || DIRECTION_VECTORS.down;
    this.damage = damage;
    this.range = range;
    this.startX = x;
    this.startY = y;

    this.setPosition(x, y).setActive(true).setVisible(true);
    this.body.enable = true;
    this.setVelocity(dir.x * speed, dir.y * speed);
    this.setRotation(Math.atan2(dir.y, dir.x));
  }

  // Auto-called by Phaser each frame for active scene objects.
  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (!this.active) return;
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
    if (this.body) this.body.enable = false;
  }
}
