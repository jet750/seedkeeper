// ParticleSystem.js
//
// Combat "juice" for Sprint 3: float-up damage numbers and death particle
// bursts. Both live in WORLD space (this system is owned by GameScene, not the
// HUD) so numbers rise from the enemy that was hit and bursts pop where it died.
//
// Note on architecture: the sprint spec sketched UIScene as the 'ui:floatText'
// listener, but the float text carries world coordinates (above the enemy
// sprite) and UIScene is a separate camera that deliberately never imports the
// game world. Subscribing here keeps UIScene a pure HUD and puts the text in the
// correct coordinate space. The event contract is unchanged — anything can still
// emit 'ui:floatText'.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';

const POOL_SIZE = 20;
const FLOAT_RISE = 40; // px the text drifts upward
const FLOAT_DURATION = 1200;
const FLOAT_DEPTH = 30; // above every world entity
const BURST_COUNT = 6;
const BURST_SIZE = 6;
const BURST_DISTANCE = 40;
const BURST_DURATION = 600;
const BURST_DEPTH = 12;

export default class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const t = scene.add
        .text(0, 0, '', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3
        })
        .setOrigin(0.5)
        .setDepth(FLOAT_DEPTH)
        .setActive(false)
        .setVisible(false);
      this.pool.push(t);
    }

    this._onFloatText = (d) => this.showFloatText(d.x, d.y, d.text, d.color);
    EventBus.on('ui:floatText', this._onFloatText);

    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);
  }

  // --- Float-up text pool ---------------------------------------------------

  getFromPool() {
    const free = this.pool.find((t) => !t.active);
    if (free) return free;
    // Pool exhausted (heavy combat) — recycle the oldest, cancelling its tween.
    const reuse = this.pool[0];
    this.scene.tweens.killTweensOf(reuse);
    return reuse;
  }

  returnToPool(textObj) {
    textObj.setActive(false).setVisible(false);
  }

  showFloatText(x, y, text, color = '#ffffff', duration = FLOAT_DURATION) {
    const textObj = this.getFromPool();
    textObj
      .setText(text)
      .setColor(color)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(1)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: textObj,
      y: y - FLOAT_RISE,
      alpha: 0,
      duration,
      ease: 'Power2',
      onComplete: () => this.returnToPool(textObj)
    });
  }

  // --- Death particle burst -------------------------------------------------

  showDeathBurst(x, y, color) {
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = (i / BURST_COUNT) * Math.PI * 2;
      const particle = this.scene.add
        .rectangle(x, y, BURST_SIZE, BURST_SIZE, tint)
        .setDepth(BURST_DEPTH);
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * BURST_DISTANCE,
        y: y + Math.sin(angle) * BURST_DISTANCE,
        alpha: 0,
        duration: BURST_DURATION,
        onComplete: () => particle.destroy()
      });
    }
  }

  // --- Event-driven feedback bursts (Sprint 5) ------------------------------
  // All bursts fire on discrete gameplay events (never per-frame), so the
  // create/destroy-per-particle pattern is cheap here. Geometry only — no
  // external particle textures.

  toTint(color) {
    if (typeof color === 'number') return color;
    if (typeof color === 'string') return Phaser.Display.Color.HexStringToColor(color).color;
    return 0xffffff;
  }

  // Generic radial pop. `diamond` rotates square particles 45° for a sparkle
  // look; `yBias` nudges the spread upward (negative = up).
  burst(x, y, { count, color, radius, duration, size, diamond = false, yBias = 0 }) {
    const tint = this.toTint(color);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = radius * (0.6 + Math.random() * 0.4);
      const p = this.scene.add
        .rectangle(x, y, size, size, tint)
        .setDepth(BURST_DEPTH);
      if (diamond) p.setRotation(Math.PI / 4);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist + yBias,
        alpha: 0,
        scale: 0.2,
        duration,
        ease: 'Power2',
        onComplete: () => p.destroy()
      });
    }
  }

  // 6 particles in the plant's colour, tight radial pop.
  seedCollect(position, color) {
    if (!position) return;
    this.burst(position.x, position.y, {
      count: 6, color, radius: 30, duration: 500, size: 5
    });
  }

  // 8 green sparkles rising from a harvested bed.
  harvestBurst(position) {
    if (!position) return;
    this.burst(position.x, position.y, {
      count: 8, color: 0x8ab87e, radius: 40, duration: 700, size: 6, yBias: -24
    });
  }

  // 10 plant-coloured diamonds from the workshop chest.
  upgradeBurst(position, color) {
    if (!position) return;
    this.burst(position.x, position.y, {
      count: 10, color, radius: 60, duration: 900, size: 7, diamond: true
    });
  }

  // 8 grey particles where the player fell.
  deathBurst(x, y) {
    this.burst(x, y, {
      count: 8, color: 0x9b9389, radius: 36, duration: 800, size: 6
    });
  }

  cleanup() {
    EventBus.off('ui:floatText', this._onFloatText);
  }
}
