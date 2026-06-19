// Seed.js
//
// A collectible seed that lives in the game world (not in inventory). Bobs
// gently, shows a name tag when the player is near, is collected on proximity,
// and respawns at its fixed position after a delay. Collection/inventory logic
// is driven by GameScene + Player via EventBus — the Seed only manages its own
// world presence.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';

const NAME_TAG_RANGE = 60; // px — tag visible within this distance
const ARM_DELAY_MS = 500; // brief delay before a (re)spawned seed is collectible
const RESPAWN_FADE_MS = 1000;

function hexToNumber(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export default class Seed extends Phaser.GameObjects.Image {
  constructor(scene, x, y, plantType, gameData) {
    // Shared white-circle texture, tinted per plant. GameScene guarantees it
    // exists, but generate defensively in case a Seed is created earlier.
    if (!scene.textures.exists('px_seed')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(7, 7, 7);
      g.generateTexture('px_seed', 14, 14);
      g.destroy();
    }

    super(scene, x, y, 'px_seed');
    scene.add.existing(this);

    this.plantType = plantType;
    this.plantData = gameData.plants[plantType];
    this.respawnDelay = this.plantData.seedRespawn;
    this.collected = false;
    this.collectible = false;
    this.baseY = y;

    // Despawning seeds (dropped on player death) shrink away over a recovery
    // window and are gone for good — they do not respawn like world seeds.
    this.isDespawning = false;
    this._despawnTween = null;

    this.setTint(hexToNumber(this.plantData.color));
    this.setDepth(6);

    // Bob animation: y ±4px, 1.2s loop, Sine.easeInOut.
    this.bobTween = scene.tweens.add({
      targets: this,
      y: { from: y - 4, to: y + 4 },
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // Name tag — hidden until the player is close.
    this.nameTag = scene.add
      .text(x, this.baseY - 18, this.plantData.name, {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#F5EFE6',
        backgroundColor: 'rgba(20,18,16,0.7)',
        padding: { x: 4, y: 2 }
      })
      .setOrigin(0.5, 1)
      .setDepth(20)
      .setVisible(false);

    // Self-register so GameScene tracks/updates this seed (covers dropped seeds
    // created by Player.dropSeed as well as the initial world placement).
    if (typeof scene.registerSeed === 'function') {
      scene.registerSeed(this);
    }

    this.armCollectible(ARM_DELAY_MS);
  }

  armCollectible(delay) {
    this.collectible = false;
    this.scene.time.delayedCall(delay, () => {
      if (!this.collected) this.collectible = true;
    });
  }

  // Mark this seed as a temporary death-drop: it visibly shrinks to nothing over
  // `duration` ms (the recovery window) and then destroys itself. It stays
  // collectible the whole time so the player can race back to reclaim it.
  setDespawnTimer(duration) {
    this.isDespawning = true;
    this._despawnTween = this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      scaleY: 0,
      duration,
      onComplete: () => this.destroy()
    });
  }

  // Called each frame by GameScene to toggle the proximity name tag.
  updateProximity(player) {
    if (this.collected || !this.active) {
      if (this.nameTag.visible) this.nameTag.setVisible(false);
      return;
    }
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    this.nameTag.setVisible(d < NAME_TAG_RANGE);
  }

  collect() {
    this.collected = true;
    this.collectible = false;
    this.setActive(false);
    this.setVisible(false);
    this.nameTag.setVisible(false);
    if (this.bobTween) this.bobTween.pause();

    // A recovered death-drop is consumed permanently — cancel its shrink tween
    // and destroy rather than scheduling a respawn.
    if (this.isDespawning) {
      if (this._despawnTween) this._despawnTween.remove();
      this.destroy();
      return;
    }

    this.scene.time.delayedCall(this.respawnDelay, () => this.respawn());
  }

  respawn() {
    this.collected = false;
    this.setActive(true);
    this.setVisible(true);
    this.setAlpha(0);
    if (this.bobTween) this.bobTween.resume();
    // Subtle "growing back" fade-in over 1s, then becomes collectible.
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: RESPAWN_FADE_MS,
      onComplete: () => {
        this.collectible = true;
      }
    });
  }

  destroy(fromScene) {
    if (this.bobTween) this.bobTween.remove();
    if (this.nameTag) this.nameTag.destroy();
    super.destroy(fromScene);
  }
}
