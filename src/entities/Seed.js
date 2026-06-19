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
const MAGNET_ARC_MS = 150; // Sprint 9 — seed arcs to the player before collecting

// World seeds (14px) are drawn 1.5x so they don't read as tiny at the current
// camera zoom alongside the 2x player/enemies. Exported so callers that want a
// seed to stand out (e.g. the daily-special gift) can scale relative to it.
export const SEED_SCALE = 1.5;

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
    this.setScale(SEED_SCALE); // zoom visibility (no physics body — Seed is a plain Image)

    this.plantType = plantType;
    this.plantData = gameData.plants[plantType];
    this.respawnDelay = this.plantData.seedRespawn;
    this.collected = false;
    this.collectible = false;
    // Magnet-arc state (Sprint 9). While arcing, the seed is skipped by the
    // collection scan so it can't double-trigger. homeX/homeY are the fixed
    // world spot to snap back to on respawn (the arc moves it onto the player).
    this.collecting = false;
    this.homeX = x;
    this.homeY = y;
    this.baseY = y;

    // Daily special seed (Sprint 11): once-a-day gift that never respawns and
    // shows a custom name tag. Set by GameScene.spawnDailySpecialSeed().
    this.isDailySpecial = false;
    this.nameTagOverride = null;

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
    const near = d < NAME_TAG_RANGE;
    if (near && this.nameTagOverride && this.nameTag.text !== this.nameTagOverride) {
      this.nameTag.setText(this.nameTagOverride);
    }
    this.nameTag.setVisible(near);
  }

  // Magnet collect (Sprint 9): tween the seed onto the player, then run the
  // supplied collect callback (inventory add + events live in GameScene). The
  // seed is marked `collecting` so the per-frame scan ignores it mid-flight.
  collectWithArc(player, onArrived) {
    if (this.collected || this.collecting || !this.collectible) return;
    this.collecting = true;
    this.collectible = false;
    if (this.nameTag) this.nameTag.setVisible(false);
    if (this.bobTween) this.bobTween.pause();
    this.scene.tweens.add({
      targets: this,
      x: player.x,
      y: player.y,
      duration: MAGNET_ARC_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.collecting = false;
        if (onArrived) onArrived();
      }
    });
  }

  // Arrival add failed (e.g. another seed claimed the last slot this frame) —
  // re-arm so the seed can be re-collected or offered to the swap picker.
  cancelArc() {
    this.collecting = false;
    if (!this.collected) {
      this.collectible = true;
      if (this.bobTween) this.bobTween.resume();
    }
  }

  collect() {
    this.collected = true;
    this.collecting = false;
    this.collectible = false;
    this.setActive(false);
    this.setVisible(false);
    this.nameTag.setVisible(false);
    if (this.bobTween) this.bobTween.pause();

    // A recovered death-drop, or the daily special gift, is consumed
    // permanently — destroy rather than scheduling a respawn.
    if (this.isDespawning) {
      if (this._despawnTween) this._despawnTween.remove();
      this.destroy();
      return;
    }
    if (this.isDailySpecial) {
      this.destroy();
      return;
    }

    // Strong Wind weather shortens respawn timers for the day (Sprint 11).
    const mult = (this.scene && this.scene.weatherRespawnMult) || 1;
    this.scene.time.delayedCall(this.respawnDelay * mult, () => this.respawn());
  }

  respawn() {
    this.collected = false;
    this.collecting = false;
    // Snap back to the home spot — the magnet arc may have left the sprite (and
    // its name tag) sitting on the player's last position.
    this.setPosition(this.homeX, this.homeY);
    if (this.nameTag) this.nameTag.setPosition(this.homeX, this.baseY - 18);
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
    // Stop GameScene from scanning a dead seed forever (death-drops despawn and
    // are destroyed, but otherwise linger in scene.seeds across a run).
    if (this.scene && typeof this.scene.unregisterSeed === 'function') {
      this.scene.unregisterSeed(this);
    }
    super.destroy(fromScene);
  }
}
