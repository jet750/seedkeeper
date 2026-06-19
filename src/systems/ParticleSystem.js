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
          fontFamily: '"Courier New", monospace',
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

  cleanup() {
    EventBus.off('ui:floatText', this._onFloatText);
  }
}
