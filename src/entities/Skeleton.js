// Skeleton.js
//
// Deep-forest patrolling enemy introduced in Sprint 3. Walks a fixed 3-waypoint
// loop until the player enters detectRange, chases until the player escapes
// loseRange, then navigates back to the nearest waypoint and resumes patrol.
// Tankier and harder-hitting than slimes; drops a guaranteed Glowshroom plus one
// weighted-random seed on death. Damage to the player and death notifications go
// out via EventBus only — the skeleton never calls Player methods directly.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { GARDEN_ZONE_HEIGHT } from '../core/Constants.js';
import Seed from './Seed.js';
import PlantBundle from './PlantBundle.js';
import { getRandomSeedDrop, getRandomBundleDrop } from '../systems/lootTable.js';

const STATE = { PATROL: 'PATROL', CHASE: 'CHASE' };
const WAYPOINT_REACHED = 12; // px — close enough to advance to the next waypoint
const LOOK_RANGE = 200; // px — head turns toward the player within this range (Sprint 9)
const HIT_FLASH_MS = 100;
const KNOCKBACK_VELOCITY = 160; // heavier than a slime — takes less of a shove
const KNOCKBACK_MS = 250;
const DAMAGE_TEXT_OFFSET = 24;
const DEATH_FADE_MS = 400;
const DROP_SCATTER = 30;

// Drawn at 2x for zoom visibility. Visual only — the physics body is set up
// separately below.
const SPRITE_SCALE = 2;
// Fixed collider radius (source px), pinned so the 2x sprite scale doesn't double
// the hitbox. Effective in-world radius is halfWidth (= BODY_RADIUS * scaleX).
const BODY_RADIUS = 8;

export default class Skeleton extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, waypoints, gameData) {
    // Prefer the Anokolisa animated sheets (run + death, 64x64). Fall back to the
    // legacy 16x16 skeleton_sheet, then to a generated bone placeholder.
    const useReal = scene.textures.exists('skeleton_run');
    const hasSheet = scene.textures.exists('skeleton_sheet');
    if (!useReal && !hasSheet) ensurePlaceholderTexture(scene);
    super(scene, x, y, useReal ? 'skeleton_run' : hasSheet ? 'skeleton_sheet' : 'px_skeleton');

    this.useReal = useReal;
    this.hasSheet = hasSheet;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Visual draw scale for zoom visibility (set before the body below; the
    // collider radius derives from this.width, the unscaled source size). The
    // real 64x64 frames carry transparent padding, so 2x reads as a tanky enemy.
    this.setScale(SPRITE_SCALE);
    if (useReal) this.setupRealAnimations();

    this.enemyType = 'skeleton';

    // --- Stats (from data, never hardcoded) ---
    const stats = gameData.enemies.skeleton;
    this.hp = stats.hp;
    this.maxHP = stats.hp;
    this.damage = stats.damage;
    this.patrolSpeed = stats.patrolSpeed;
    this.chaseSpeed = stats.chaseSpeed;
    this.detectRange = stats.detectRange;
    this.loseRange = stats.loseRange;

    // --- Combat state ---
    this.isDead = false;
    this._knockbackUntil = 0;

    // --- Physics: fixed-radius collider, centred in the sprite ---
    // Pinned to BODY_RADIUS (not width*ratio) so the 2x sprite scale doesn't
    // inflate the hitbox. Offset stays centred on the 16px frame.
    this.setCollideWorldBounds(true);
    const radius = BODY_RADIUS;
    this.body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.setDepth(9);

    // --- Patrol route ---
    this.waypoints = waypoints && waypoints.length ? waypoints : [{ x, y }];
    this._wpIndex = 0;
    this.state = STATE.PATROL;
  }

  // Create the shared walk/death animations from the Anokolisa sheets once, then
  // start walking. Frame counts are derived from each sheet's frameTotal so a
  // miscount can never reference a non-existent frame.
  setupRealAnimations() {
    const a = this.scene.anims;
    const lastFrame = (key) => Math.max(0, this.scene.textures.get(key).frameTotal - 2);
    if (!a.exists('skeleton_walk')) {
      a.create({
        key: 'skeleton_walk',
        frames: a.generateFrameNumbers('skeleton_run', { start: 0, end: lastFrame('skeleton_run') }),
        frameRate: 10,
        repeat: -1
      });
    }
    if (!a.exists('skeleton_die') && this.scene.textures.exists('skeleton_death')) {
      a.create({
        key: 'skeleton_die',
        frames: a.generateFrameNumbers('skeleton_death', { start: 0, end: lastFrame('skeleton_death') }),
        frameRate: 14,
        repeat: 0
      });
    }
    this.play('skeleton_walk');
  }

  update(dt, player) {
    if (this.isDead) return;

    // While being knocked back, let the impulse play out — skip AI steering so
    // the velocity we set in takeDamage() is not immediately overwritten.
    if (this.scene.time.now < this._knockbackUntil) {
      this.confineToForest();
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // --- Transitions ---
    // Forest Fog weather reduces detect range for the day (Sprint 11).
    const detect = this.detectRange * (this.scene.weatherDetectMult || 1);
    if (this.state === STATE.PATROL && dist < detect) {
      this.state = STATE.CHASE;
    } else if (this.state === STATE.CHASE && dist > this.loseRange) {
      this.state = STATE.PATROL;
      this._wpIndex = this.nearestWaypointIndex();
    }

    // Head-turn tell: face the player whenever they're close, even mid-patrol.
    if (dist < LOOK_RANGE) {
      this.setFlipX(player.x < this.x);
    }

    // --- Behaviour ---
    if (this.state === STATE.CHASE) {
      this.moveToward(player.x, player.y, this.chaseSpeed);
    } else {
      this.patrol();
    }

    this.confineToForest();
  }

  patrol() {
    const wp = this.waypoints[this._wpIndex];
    const d = Phaser.Math.Distance.Between(this.x, this.y, wp.x, wp.y);
    if (d <= WAYPOINT_REACHED) {
      this._wpIndex = (this._wpIndex + 1) % this.waypoints.length;
      return;
    }
    this.moveToward(wp.x, wp.y, this.patrolSpeed);
  }

  moveToward(tx, ty, speed) {
    const angle = Math.atan2(ty - this.y, tx - this.x);
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  nearestWaypointIndex() {
    let best = 0;
    let bestDist = Infinity;
    this.waypoints.forEach((wp, i) => {
      const d = Phaser.Math.Distance.Between(this.x, this.y, wp.x, wp.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  // Keep skeletons out of the safe garden — they stop at the fence line.
  confineToForest() {
    const minY = GARDEN_ZONE_HEIGHT + this.body.height / 2;
    if (this.y < minY) {
      this.y = minY;
      if (this.body.velocity.y < 0) this.setVelocityY(Math.abs(this.body.velocity.y));
    }
  }

  // Requested by GameScene on body overlap. Player owns the invincibility
  // window, so emitting every overlap frame is safe.
  touchPlayer() {
    EventBus.emit('player:damaged', { amount: this.damage });
  }

  // --- Combat ---------------------------------------------------------------

  takeDamage(amount, sourcePosition) {
    if (this.isDead) return;
    this.hp -= amount;

    // Hit flash.
    this.setTint(0xffffff);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (!this.isDead) this.clearTint();
    });

    // Knockback away from the hit source.
    const angle = Phaser.Math.Angle.Between(sourcePosition.x, sourcePosition.y, this.x, this.y);
    this.setVelocity(Math.cos(angle) * KNOCKBACK_VELOCITY, Math.sin(angle) * KNOCKBACK_VELOCITY);
    this._knockbackUntil = this.scene.time.now + KNOCKBACK_MS;

    // Float-up damage number.
    EventBus.emit('ui:floatText', {
      x: this.x,
      y: this.y - DAMAGE_TEXT_OFFSET,
      text: `-${amount}`,
      color: '#ff6666'
    });

    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.body.enable = false;
    this.setVelocity(0, 0);

    // Play the crumble-to-bones death animation while the sprite fades out.
    if (this.useReal && this.scene.textures.exists('skeleton_death')) {
      this.setTexture('skeleton_death');
      this.play('skeleton_die');
    }

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: DEATH_FADE_MS,
      onComplete: () => {
        this.dropBundle();
        this.dropSeeds();
        EventBus.emit('enemy:died', { type: 'skeleton', position: { x: this.x, y: this.y } });
        const idx = this.scene.enemies.indexOf(this);
        if (idx > -1) this.scene.enemies.splice(idx, 1);
        this.destroy();
      }
    });
  }

  // Skeletons have a high chance to drop a pre-grown plant bundle (Sprint 7).
  dropBundle() {
    const threshold = this.scene.gameData.enemies.skeleton.bundleDropChance || 0;
    if (Math.random() > threshold) return;
    const plantType = getRandomBundleDrop();
    new PlantBundle(this.scene, this.x, this.y, plantType, this.scene.gameData);
  }

  dropSeeds() {
    // Guaranteed Glowshroom + one weighted-random seed.
    const drops = ['glowshroom', getRandomSeedDrop()];
    drops.forEach((plantType) => {
      new Seed(
        this.scene,
        this.x + (Math.random() - 0.5) * DROP_SCATTER,
        this.y + (Math.random() - 0.5) * DROP_SCATTER,
        plantType,
        this.scene.gameData
      );
    });
  }
}

// Bone-colored 16x16 placeholder, mirroring the slime placeholders. Generated
// defensively so a Skeleton can exist before BootScene art lands.
function ensurePlaceholderTexture(scene) {
  if (scene.textures.exists('px_skeleton')) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xe8e2d0, 1); // bone white
  g.fillRect(4, 1, 8, 7); // skull
  g.fillRect(6, 8, 4, 6); // spine
  g.fillRect(3, 9, 10, 2); // arms / ribs
  g.lineStyle(1, 0x6b6354, 1);
  g.strokeRect(4, 1, 8, 7);
  g.generateTexture('px_skeleton', 16, 16);
  g.destroy();
}
