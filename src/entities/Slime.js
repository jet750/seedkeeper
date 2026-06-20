// Slime.js
//
// Wandering forest enemy with a two-state machine (WANDER / CHASE). Stats are
// pulled from gameData.enemies[slimeType]. Damage to the player is requested via
// EventBus only — slimes never touch Player methods directly.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { GARDEN_LEFT, GARDEN_RIGHT, GARDEN_TOP, GARDEN_BOTTOM } from '../core/Constants.js';
import { spawnEnemyAlert } from './enemyIndicator.js';
import Seed from './Seed.js';
import PlantBundle from './PlantBundle.js';
import { getRandomSeedDrop, getRandomBundleDrop } from '../systems/lootTable.js';

const STATE = { WANDER: 'WANDER', ANTICIPATE: 'ANTICIPATE', CHASE: 'CHASE' };
const RETARGET_MIN_MS = 2000;
const RETARGET_MAX_MS = 3000;

// Chase anticipation tell (Sprint 9): a brief freeze + scale pulse before the
// slime commits to the chase, so the player can read the wind-up.
const ANTICIPATE_PULSE_MS = 75;
const ANTICIPATE_PULSE_SCALE = 1.3;

// Drawn at 2x for zoom visibility. Visual only — the physics body is set up
// separately below. The anticipation pulse multiplies this so the tell still
// reads as a grow, not a shrink, against the larger baseline.
const SPRITE_SCALE = 2;
// Fixed collider radius (source px), pinned so the 2x sprite scale doesn't double
// the hitbox. Effective in-world radius is halfWidth (= BODY_RADIUS * scaleX).
const BODY_RADIUS = 6;

// Wander personality per type (Sprint 9). Greens hold a heading for a long lazy
// stretch and occasionally stop; darks move in short twitchy bursts with a pause
// between each. Falls back to the generic window for any other type.
const WANDER_PROFILE = {
  green_slime: { holdMin: 3000, holdMax: 4000, pauseChance: 0.35, pauseMs: 500 },
  dark_slime: { holdMin: 800, holdMax: 1200, pauseChance: 1.0, pauseMs: 400 }
};

// --- Combat (Sprint 3) ---
const HIT_FLASH_MS = 100;
const KNOCKBACK_VELOCITY = 200;
const KNOCKBACK_MS = 300;
const DAMAGE_TEXT_OFFSET = 20;
const DEATH_FADE_MS = 400;
const DROP_SCATTER = 30;
const GREEN_SLIME_DROPS = 1;
const DARK_SLIME_DROPS = 2;

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

    // Visual draw scale for zoom visibility (set before the body below; the
    // collider radius derives from this.width, the unscaled source size).
    this.setScale(SPRITE_SCALE);

    this.slimeType = slimeType;

    // --- Stats (from data) ---
    const stats = gameData.enemies[slimeType];
    this.hp = stats.hp;
    this.maxHP = stats.hp;
    this.baseDamage = stats.damage;
    this.baseChaseSpeed = stats.chaseSpeed;
    this.wanderSpeed = stats.wanderSpeed;
    this.detectRange = stats.detectRange;
    this.loseRange = stats.loseRange;

    // Mutable copies — the day timer expiry scales these up.
    this.currentDamage = this.baseDamage;
    this.currentChaseSpeed = this.baseChaseSpeed;

    // --- Physics ---
    // Fixed-radius collider (BODY_RADIUS, not width*ratio) so the 2x sprite scale
    // doesn't inflate the hitbox. Offset stays centred on the 16px frame.
    this.setCollideWorldBounds(true);
    this.setBounce(1, 1);
    const radius = BODY_RADIUS;
    this.body.setCircle(
      radius,
      this.width / 2 - radius,
      this.height / 2 - radius
    );
    this.setDepth(8);

    // --- State machine ---
    this.state = STATE.WANDER;
    this._retargetTimer = 0;
    this._wanderProfile = WANDER_PROFILE[slimeType] || null;
    this._isWanderPaused = false;
    this._pauseTimer = 0;
    this.pickNewWanderDirection();

    // --- Combat state ---
    this.isDead = false;
    this._knockbackUntil = 0;
    // Tint to restore after a white hit-flash. Dark slimes get a purple tint set
    // by GameScene; green slimes have no base tint (null → clearTint).
    this._baseTint = null;
  }

  pickNewWanderDirection() {
    const angle = Math.random() * Math.PI * 2;
    this._wanderDir = { x: Math.cos(angle), y: Math.sin(angle) };
    // Hold window varies by personality; randomized per slime so a group never
    // moves in lockstep.
    const prof = this._wanderProfile || { holdMin: RETARGET_MIN_MS, holdMax: RETARGET_MAX_MS };
    this._retargetTimer = prof.holdMin + Math.random() * (prof.holdMax - prof.holdMin);
  }

  update(dt, player) {
    if (this.isDead) return;

    // While being knocked back, let the impulse play out — skip steering so the
    // velocity set in takeDamage() is not immediately overwritten.
    if (this.scene.time.now < this._knockbackUntil) {
      this.confineToForest();
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // --- Transitions ---
    // Forest Fog weather reduces detect range for the day (Sprint 11).
    const detect = this.detectRange * (this.scene.weatherDetectMult || 1);
    if (this.state === STATE.WANDER && dist < detect) {
      this.startChase(); // alert tell + wind-up pulse, then CHASE
    } else if (this.state === STATE.CHASE && dist > this.loseRange) {
      this.state = STATE.WANDER;
      this._isWanderPaused = false;
      this.pickNewWanderDirection();
      this.showLostIndicator(); // "?" — lost the player
    }

    // --- Behaviour ---
    if (this.state === STATE.ANTICIPATE) {
      // Frozen mid-tell — the pulse tween is doing the talking.
      this.setVelocity(0, 0);
    } else if (this.state === STATE.CHASE) {
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.setVelocity(
        Math.cos(angle) * this.currentChaseSpeed,
        Math.sin(angle) * this.currentChaseSpeed
      );
    } else {
      this.updateWander(dt);
    }

    this.confineToForest();
  }

  // WANDER movement with personality pauses. Greens stop occasionally; darks
  // pause between every short burst, reading as alert and twitchy.
  updateWander(dt) {
    const dtMs = dt * 1000;
    if (this._isWanderPaused) {
      this.setVelocity(0, 0);
      this._pauseTimer -= dtMs;
      if (this._pauseTimer <= 0) {
        this._isWanderPaused = false;
        this.pickNewWanderDirection();
      }
      return;
    }

    this._retargetTimer -= dtMs;
    if (this._retargetTimer <= 0) {
      const prof = this._wanderProfile;
      if (prof && Math.random() < prof.pauseChance) {
        this._isWanderPaused = true;
        this._pauseTimer = prof.pauseMs;
        this.setVelocity(0, 0);
        return;
      }
      this.pickNewWanderDirection();
    }
    this.setVelocity(this._wanderDir.x * this.wanderSpeed, this._wanderDir.y * this.wanderSpeed);
  }

  // Chase anticipation: freeze and pulse for a beat, then commit to the chase.
  startChase() {
    if (this.state === STATE.ANTICIPATE || this.state === STATE.CHASE) return;
    this.showAlertIndicator(); // "!" — spotted the player
    this.state = STATE.ANTICIPATE;
    this._isWanderPaused = false;
    this.setVelocity(0, 0);
    this.scene.tweens.add({
      targets: this,
      scaleX: SPRITE_SCALE * ANTICIPATE_PULSE_SCALE,
      scaleY: SPRITE_SCALE * ANTICIPATE_PULSE_SCALE,
      duration: ANTICIPATE_PULSE_MS,
      yoyo: true,
      onComplete: () => {
        if (this.isDead) return;
        this.state = STATE.CHASE;
      }
    });
  }

  // Keep slimes out of the safe garden square — bounce them back off whichever
  // garden edge is nearest. This backs up the fence colliders by also sealing the
  // gate gaps the player walks through, so enemies can never follow inside.
  confineToForest() {
    if (
      this.x <= GARDEN_LEFT ||
      this.x >= GARDEN_RIGHT ||
      this.y <= GARDEN_TOP ||
      this.y >= GARDEN_BOTTOM
    ) {
      return; // already outside the garden rectangle
    }
    const dl = this.x - GARDEN_LEFT;
    const dr = GARDEN_RIGHT - this.x;
    const dt = this.y - GARDEN_TOP;
    const db = GARDEN_BOTTOM - this.y;
    const min = Math.min(dl, dr, dt, db);
    if (min === dl) {
      this.x = GARDEN_LEFT;
      if (this.body.velocity.x > 0) this.setVelocityX(-Math.abs(this.body.velocity.x));
    } else if (min === dr) {
      this.x = GARDEN_RIGHT;
      if (this.body.velocity.x < 0) this.setVelocityX(Math.abs(this.body.velocity.x));
    } else if (min === dt) {
      this.y = GARDEN_TOP;
      if (this.body.velocity.y > 0) this.setVelocityY(-Math.abs(this.body.velocity.y));
    } else {
      this.y = GARDEN_BOTTOM;
      if (this.body.velocity.y < 0) this.setVelocityY(Math.abs(this.body.velocity.y));
    }
  }

  // Red "!" tell shown when the slime first spots the player (WANDER → CHASE):
  // pops up above the slime, bounces upward, holds, then fades. A brief red tint
  // on the body reinforces the alert.
  showAlertIndicator() {
    spawnEnemyAlert(this, '!', '#ff3333', false);
    this.setTint(0xff6666);
    this.scene.time.delayedCall(200, () => {
      if (this.isDead) return;
      if (this._baseTint !== null) this.setTint(this._baseTint);
      else this.clearTint();
    });
  }

  // Blue "?" tell shown when the slime loses the player (CHASE → WANDER). Same
  // motion as the alert but fades faster and does not tint the body.
  showLostIndicator() {
    spawnEnemyAlert(this, '?', '#66aaff', true);
  }

  // Requested by GameScene on body overlap. Player decides whether the hit lands
  // (invincibility window), so emitting every overlap frame is safe.
  touchPlayer() {
    EventBus.emit('player:damaged', { amount: this.currentDamage });
  }

  // --- Combat (Sprint 3) ----------------------------------------------------

  takeDamage(amount, sourcePosition) {
    if (this.isDead) return;
    this.hp -= amount;

    // Hit flash — white for a beat, then back to the slime's base look.
    this.setTint(0xffffff);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (this.isDead) return;
      if (this._baseTint !== null) this.setTint(this._baseTint);
      else this.clearTint();
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

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: DEATH_FADE_MS,
      onComplete: () => {
        this.dropBundle();
        this.dropSeeds();
        EventBus.emit('enemy:died', {
          type: this.slimeType,
          position: { x: this.x, y: this.y }
        });
        const idx = this.scene.enemies.indexOf(this);
        if (idx > -1) this.scene.enemies.splice(idx, 1);
        this.destroy();
      }
    });
  }

  // Dark slimes have a chance to drop a pre-grown plant bundle (Sprint 7).
  // Green slimes never do.
  dropBundle() {
    if (this.slimeType !== 'dark_slime') return;
    const threshold = this.scene.gameData.enemies.dark_slime.bundleDropChance || 0;
    if (Math.random() > threshold) return;
    const plantType = getRandomBundleDrop();
    new PlantBundle(this.scene, this.x, this.y, plantType, this.scene.gameData);
  }

  dropSeeds() {
    const drops = this.slimeType === 'dark_slime' ? DARK_SLIME_DROPS : GREEN_SLIME_DROPS;
    for (let i = 0; i < drops; i++) {
      const plantType = getRandomSeedDrop();
      new Seed(
        this.scene,
        this.x + (Math.random() - 0.5) * DROP_SCATTER,
        this.y + (Math.random() - 0.5) * DROP_SCATTER,
        plantType,
        this.scene.gameData
      );
    }
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
