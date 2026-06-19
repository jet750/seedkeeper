// Slime.js
//
// Wandering forest enemy with a two-state machine (WANDER / CHASE). Stats are
// pulled from gameData.enemies[slimeType]. Damage to the player is requested via
// EventBus only — slimes never touch Player methods directly.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { GARDEN_ZONE_HEIGHT } from '../core/Constants.js';

const STATE = { WANDER: 'WANDER', CHASE: 'CHASE' };
const RETARGET_MIN_MS = 2000;
const RETARGET_MAX_MS = 3000;

export default class Slime extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, slimeType, gameData) {
    const hasSheet = scene.textures.exists('slime_sheet');
    const placeholderKey =
      slimeType === 'dark_slime' ? 'px_dark_slime' : 'px_green_slime';
    super(scene, x, y, hasSheet ? 'slime_sheet' : placeholderKey);

    this.hasSheet = hasSheet;
    if (!hasSheet) {
      // TODO(asset): drop slime_sheet.png into /assets/images for animated
      // slimes. Colored-circle placeholder in use until then.
    }

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.slimeType = slimeType;

    // --- Stats (from data) ---
    const stats = gameData.enemies[slimeType];
    this.hp = stats.hp; // tracked; no kill mechanic until Sprint 3
    this.baseDamage = stats.damage;
    this.baseChaseSpeed = stats.chaseSpeed;
    this.wanderSpeed = stats.wanderSpeed;
    this.detectRange = stats.detectRange;
    this.loseRange = stats.loseRange;

    // Mutable copies — the day timer expiry scales these up.
    this.currentDamage = this.baseDamage;
    this.currentChaseSpeed = this.baseChaseSpeed;

    // --- Physics ---
    this.setCollideWorldBounds(true);
    this.setBounce(1, 1);
    const radius = this.width * 0.42;
    this.body.setCircle(
      radius,
      this.width / 2 - radius,
      this.height / 2 - radius
    );
    this.setDepth(8);

    // --- State machine ---
    this.state = STATE.WANDER;
    this._retargetTimer = 0;
    this.pickNewWanderDirection();
  }

  pickNewWanderDirection() {
    const angle = Math.random() * Math.PI * 2;
    this._wanderDir = { x: Math.cos(angle), y: Math.sin(angle) };
    // Randomize per slime so the group never moves in sync.
    this._retargetTimer =
      RETARGET_MIN_MS + Math.random() * (RETARGET_MAX_MS - RETARGET_MIN_MS);
  }

  update(dt, player) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // --- Transitions ---
    if (this.state === STATE.WANDER && dist < this.detectRange) {
      this.state = STATE.CHASE;
    } else if (this.state === STATE.CHASE && dist > this.loseRange) {
      this.state = STATE.WANDER;
      this.pickNewWanderDirection();
    }

    // --- Behaviour ---
    if (this.state === STATE.CHASE) {
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.setVelocity(
        Math.cos(angle) * this.currentChaseSpeed,
        Math.sin(angle) * this.currentChaseSpeed
      );
    } else {
      this._retargetTimer -= dt * 1000;
      if (this._retargetTimer <= 0) {
        this.pickNewWanderDirection();
      }
      this.setVelocity(
        this._wanderDir.x * this.wanderSpeed,
        this._wanderDir.y * this.wanderSpeed
      );
    }

    this.confineToForest();
  }

  // Keep slimes in the dangerous forest — they stop at the fence rather than
  // wandering or chasing into the safe garden.
  confineToForest() {
    const minY = GARDEN_ZONE_HEIGHT + this.body.height / 2;
    if (this.y < minY) {
      this.y = minY;
      if (this.body.velocity.y < 0) this.setVelocityY(Math.abs(this.body.velocity.y));
    }
  }

  // Requested by GameScene on body overlap. Player decides whether the hit lands
  // (invincibility window), so emitting every overlap frame is safe.
  touchPlayer() {
    EventBus.emit('player:damaged', { amount: this.currentDamage });
  }

  // --- Day-timer expiry effects ---
  applyPostTimer(speedMult, damageMult) {
    this.currentChaseSpeed = this.baseChaseSpeed * speedMult;
    this.currentDamage = this.baseDamage * damageMult;
  }

  resetPostTimer() {
    this.currentChaseSpeed = this.baseChaseSpeed;
    this.currentDamage = this.baseDamage;
  }
}
