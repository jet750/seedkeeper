// WorldDetail.js
//
// A fixed, non-interactive piece of environmental storytelling in the forest
// (Sprint 11). Holds a small sprite and a title/text blurb; GameScene drives the
// proximity prompt ("[F] Examine") and opens the popup via EventBus. No physics,
// no gameplay effect — purely flavour that rewards exploration.

import Phaser from 'phaser';

export default class WorldDetail {
  constructor(scene, x, y, config) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.config = config;
    this.interactRange = config.range || 56;

    if (config.sprite && scene.textures.exists(config.sprite)) {
      this.sprite = scene.add
        .image(x, y, config.sprite, config.frame)
        .setScale(config.scale || 2)
        .setDepth(2);
    } else {
      // Generated marker fallback so a detail always reads as "a thing here".
      this.sprite = scene.add
        .rectangle(x, y, 18, 22, 0x6b5a3a)
        .setStrokeStyle(2, 0x3a2c1f)
        .setDepth(2);
    }

    // Solid world objects (posts, stones, fallen trunks) get a small static
    // collider so the player walks around them rather than through (Sprint 10c).
    // Flowers / mushrooms / flush stones stay walk-through (no hasCollision flag).
    if (config.hasCollision) {
      scene.physics.add.existing(this.sprite, true); // static body
      this.sprite.body.setSize(12, 16);
      if (scene.player) scene.physics.add.collider(scene.player, this.sprite);
    }
  }

  distanceTo(player) {
    return Phaser.Math.Distance.Between(player.x, player.y, this.x, this.y);
  }
}
