// PlantBundle.js
//
// A pre-grown plant dropped by dark slimes and skeletons (Sprint 7). Unlike a
// Seed, it bypasses the grow cycle entirely: on pickup it goes straight to the
// plant bank. Visually distinct from seeds — a glowing, pulsing square with a
// "×1" tag. Auto-despawns after 45s (with a 10s shrink warning) if not collected.
// GameScene owns the player-overlap collection and the bank increment; this
// entity manages its own world presence and despawn timing.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';

const DESPAWN_MS = 45000;
const SHRINK_WARNING_MS = 10000; // final stretch shrinks as a warning

function hexToNumber(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export default class PlantBundle extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y, plantType, gameData) {
    if (!scene.textures.exists('px_bundle')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 16, 16);
      g.generateTexture('px_bundle', 16, 16);
      g.destroy();
    }

    super(scene, x, y, 'px_bundle');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.plantType = plantType;
    this.plantData = gameData.plants[plantType];
    this.collected = false;

    this.setTint(hexToNumber(this.plantData.color));
    this.setDepth(7);
    this.body.setSize(22, 22);
    this.body.setAllowGravity(false);
    this.setImmovable(true);

    // "×1" quantity tag above the bundle.
    this.label = scene.add
      .text(x, y - 16, '×1', {
        fontFamily: '"Courier New", monospace',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#F5EFE6',
        backgroundColor: 'rgba(20,18,16,0.7)',
        padding: { x: 3, y: 1 }
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    // Glowing pulse so it reads as special, not a seed.
    this.pulse = scene.tweens.add({
      targets: this,
      scaleX: { from: 1, to: 1.35 },
      scaleY: { from: 1, to: 1.35 },
      duration: 600,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    if (scene.bundleGroup) scene.bundleGroup.add(this);

    // Despawn: warn (shrink) for the final 10s, then vanish.
    this._warnEvent = scene.time.delayedCall(DESPAWN_MS - SHRINK_WARNING_MS, () =>
      this.startShrinkWarning()
    );
    this._despawnEvent = scene.time.delayedCall(DESPAWN_MS, () => {
      if (!this.collected) this.destroy();
    });
  }

  startShrinkWarning() {
    if (this.collected || !this.active) return;
    if (this.pulse) {
      this.pulse.remove();
      this.pulse = null;
    }
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0.5,
      duration: SHRINK_WARNING_MS,
      ease: 'Linear'
    });
  }

  // Called by GameScene on player overlap (after the bank has been credited).
  collect() {
    if (this.collected) return;
    this.collected = true;
    EventBus.emit('bundle:collected', {
      plantType: this.plantType,
      position: { x: this.x, y: this.y }
    });
    this.destroy();
  }

  destroy(fromScene) {
    if (this.label) {
      this.label.destroy();
      this.label = null;
    }
    if (this.pulse) {
      this.pulse.remove();
      this.pulse = null;
    }
    if (this._warnEvent) this._warnEvent.remove(false);
    if (this._despawnEvent) this._despawnEvent.remove(false);
    super.destroy(fromScene);
  }
}
