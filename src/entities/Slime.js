// Slime.js
//
// Wandering forest enemy with a two-state machine (WANDER / CHASE). Stats are
// pulled from gameData.enemies[slimeType]. Damage to the player is requested via
// EventBus only — slimes never touch Player methods directly.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { GARDEN_LEFT, GARDEN_RIGHT, GARDEN_TOP, GARDEN_BOTTOM } from '../core/Constants.js';
import { spawnEnemyAlert } from './enemyIndicator.js';
import { createLevelMarker, setMarkerLevel, positionLevelMarker } from './enemyLevelMarker.js';
import Seed from './Seed.js';
import PlantBundle from './PlantBundle.js';
import { getRandomSeedDrop, getRandomBundleDrop } from '../systems/lootTable.js';

// idle/chase → WIND_UP (squash tell, committed) → STRIKE (the leap) → RECOVER
// (vulnerable). The wind-up is dodgeable: a dash clears the leap's path (Sprint 4).
const STATE = {
  WANDER: 'WANDER',
  ANTICIPATE: 'ANTICIPATE',
  CHASE: 'CHASE',
  WIND_UP: 'WIND_UP',
  STRIKE: 'STRIKE',
  RECOVER: 'RECOVER'
};
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
  // opts (Sprint 4) configures split children: { hpFactor, damageFactor,
  // scaleFactor, canSplit:false, pooled:true, isSplitChild:true }. Plain slimes
  // pass nothing and behave as before.
  constructor(scene, x, y, slimeType, gameData, opts = {}) {
    const hasSheet = scene.textures.exists('slime_sheet');
    const placeholderKey =
      slimeType === 'dark_slime' ? 'px_dark_slime' : 'px_green_slime';
    super(scene, x, y, hasSheet ? 'slime_sheet' : placeholderKey);

    this.hasSheet = hasSheet;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.slimeType = slimeType;

    // Split-child flags + factors (Sprint 4): children don't split again, drop no
    // loot (economy untouched), recycle through GameScene's split pool, and keep
    // their size/HP/damage factors so a pooled reuse re-derives stats correctly.
    this.canSplit = opts.canSplit !== false;
    this.isSplitChild = opts.isSplitChild === true;
    this._pooled = opts.pooled === true;
    this._hpFactor = opts.hpFactor || 1;
    this._dmgFactor = opts.damageFactor || 1;
    this._splitScaleFactor = opts.scaleFactor || 1;

    // Level-independent stats.
    const stats = gameData.enemies[slimeType];
    this.wanderSpeed = stats.wanderSpeed;
    this.detectRange = stats.detectRange;
    this.loseRange = stats.loseRange;

    // Lunge telegraph config (Sprint 4) — timings from data, never hardcoded.
    this.lunge = stats.lunge || null;
    this._lungeCount = 1; // set by applyLevel (a lvl-5 green double-lunges)
    this._attackStrikesDone = 0;
    this._attackCdUntil = 0;
    this._strikeTimer = 0;
    this._recoverTimer = 0;
    this._telegraphTween = null;
    this._baseTint = null;

    // Level marker (Sprint 5): pips above the slime, colored by danger vs player.
    this.levelMarker = createLevelMarker(scene);

    // Level (Sprint 5) is the single difficulty driver — it sets HP/damage/speed,
    // size, body tint and the danger marker. Re-applied on pooled reuse so a
    // recycled split slime matches its new parent's level.
    this.applyLevel(opts.level);

    // --- Physics ---
    // Fixed-radius collider (BODY_RADIUS, not width*ratio) so the sprite scale
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
  }

  // Apply a 1-5 level: scales HP/damage/speed, size, body tint, and the danger
  // marker (Sprint 5). Called from the constructor and on pooled reuse. Split
  // factors persist on the instance so children re-derive correctly.
  applyLevel(level) {
    const stats = this.scene.gameData.enemies[this.slimeType];
    const cfg = this.scene.gameData.enemies.leveling;
    this.level = Phaser.Math.Clamp(Math.round(level || 1), 1, 5);
    const i = this.level - 1;
    const curve = stats.levelCurve;
    const hpMult = curve ? curve.hp[i] : 1;
    const dmgMult = curve ? curve.damage[i] : 1;
    const spdMult = curve ? curve.speed[i] : 1;

    const sizeStep = cfg ? cfg.sizeStepPerLevel * (this.level - 1) : 0;
    this._baseScale = SPRITE_SCALE * this._splitScaleFactor * (1 + sizeStep);
    this.setScale(this._baseScale);

    this.maxHP = Math.max(1, Math.round(stats.hp * hpMult * this._hpFactor));
    this.hp = this.maxHP;
    this.baseDamage = Math.max(1, Math.round(stats.damage * dmgMult * this._dmgFactor));
    this.baseChaseSpeed = stats.chaseSpeed * spdMult;
    this.currentDamage = this.baseDamage;
    this.currentChaseSpeed = this.baseChaseSpeed;
    this._lungeCount = stats.lungeCountByLevel ? stats.lungeCountByLevel[i] : 1;

    // levelTint[0] is 0xffffff (no shift), so lvl-1 reads as the base sprite;
    // for dark slimes the array carries the purple identity, darker per level.
    this._baseTint = stats.levelTint ? parseInt(stats.levelTint[i], 16) : null;
    this.restoreBaseTint();
    this.refreshDangerColor();
  }

  // Recolor the level marker by how this enemy compares to the player's power.
  refreshDangerColor() {
    const color = this.scene.dangerColorForLevel
      ? this.scene.dangerColorForLevel(this.level)
      : null;
    setMarkerLevel(this.levelMarker, this.level, color);
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
    if (this.levelMarker) positionLevelMarker(this.levelMarker, this);
    if (this.isDead) return;

    // While being knocked back, let the impulse play out — skip steering so the
    // velocity set in takeDamage() is not immediately overwritten.
    if (this.scene.time.now < this._knockbackUntil) {
      this.confineToForest();
      return;
    }

    const dtMs = dt * 1000;

    // --- Committed lunge states run to completion; no chase/lose retargeting
    // happens mid-tell, so the player can read and react to the wind-up. ---
    if (this.state === STATE.WIND_UP) {
      this.setVelocity(0, 0); // frozen — the squash tween is the tell
      this.confineToForest();
      return;
    }
    if (this.state === STATE.STRIKE) {
      // Velocity was locked in at strike start; let the committed leap ride.
      this._strikeTimer -= dtMs;
      if (this._strikeTimer <= 0) this.afterStrike();
      this.confineToForest();
      return;
    }
    if (this.state === STATE.RECOVER) {
      this.setVelocity(0, 0); // vulnerable — the punish window after a leap
      this._recoverTimer -= dtMs;
      if (this._recoverTimer <= 0) this.state = STATE.CHASE;
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
      // Commit to a lunge when in range and off cooldown; otherwise close in.
      if (this.lunge && dist <= this.lunge.attackRange && this.scene.time.now >= this._attackCdUntil) {
        this.beginLunge();
      } else {
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.setVelocity(
          Math.cos(angle) * this.currentChaseSpeed,
          Math.sin(angle) * this.currentChaseSpeed
        );
      }
    } else {
      this.updateWander(dt);
    }

    this.confineToForest();
  }

  // --- Lunge telegraph (Sprint 4) -------------------------------------------

  // Begin an attack: a high-level slime chains multiple lunges (Sprint 5), each
  // with its own readable wind-up. Tracks how many strikes this attack will run.
  beginLunge() {
    this._attackStrikesDone = 0;
    this.startWindUp();
  }

  // After a leap resolves: chain another wind-up if this level's lunge count
  // isn't spent yet (double-lunge), otherwise drop into the recovery window.
  afterStrike() {
    this._attackStrikesDone++;
    if (this._attackStrikesDone < this._lungeCount) {
      this.startWindUp();
    } else {
      this.enterRecover();
    }
  }

  // Freeze and squash down (the readable tell), then spring at the player's
  // locked-in position. A player who dashes clear during the squash is out of
  // the leap's straight-line path, so the lunge whiffs.
  startWindUp() {
    this.state = STATE.WIND_UP;
    this.setVelocity(0, 0);
    if (this._telegraphTween) this._telegraphTween.stop();
    this.setTint(0xffe08a); // warm warning flash — same grammar across enemies
    this._telegraphTween = this.scene.tweens.add({
      targets: this,
      scaleY: this._baseScale * this.lunge.squashScaleY,
      duration: this.lunge.windUpMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (this.isDead || this.state !== STATE.WIND_UP) return;
        this.startStrike();
      }
    });
  }

  startStrike() {
    const player = this.scene.player;
    const angle = Math.atan2(player.y - this.y, player.x - this.x); // locked here
    this.state = STATE.STRIKE;
    this._telegraphTween = null;
    this.setScale(this._baseScale); // un-squash: the spring releases
    this.restoreBaseTint();
    this.setVelocity(
      Math.cos(angle) * this.lunge.lungeSpeed,
      Math.sin(angle) * this.lunge.lungeSpeed
    );
    this._strikeTimer = this.lunge.lungeDurationMs;
  }

  enterRecover() {
    this.state = STATE.RECOVER;
    this.setVelocity(0, 0);
    this._recoverTimer = this.lunge.recoverMs;
    this._attackCdUntil = this.scene.time.now + this.lunge.cooldownMs;
  }

  // A landed hit during the wind-up interrupts the coil — the slime can't follow
  // through. A committed leap (STRIKE) still lands and the RECOVER punish window
  // is preserved; only the pre-commit wind-up is cancellable.
  interruptAttack() {
    if (this.state !== STATE.WIND_UP) return;
    if (this._telegraphTween) {
      this._telegraphTween.stop();
      this._telegraphTween = null;
    }
    this.setScale(this._baseScale);
    this.restoreBaseTint();
    this.state = STATE.CHASE;
    if (this.lunge) this._attackCdUntil = this.scene.time.now + this.lunge.cooldownMs;
  }

  restoreBaseTint() {
    if (this._baseTint !== null) this.setTint(this._baseTint);
    else this.clearTint();
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
      scaleX: this._baseScale * ANTICIPATE_PULSE_SCALE,
      scaleY: this._baseScale * ANTICIPATE_PULSE_SCALE,
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
    // Getting hit mid-wind-up interrupts the coil (no effect on STRIKE/RECOVER).
    this.interruptAttack();
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
    if (this.levelMarker) this.levelMarker.setVisible(false);
    // Don't leave a frozen squash/tint on a dying slime.
    if (this._telegraphTween) {
      this._telegraphTween.stop();
      this._telegraphTween = null;
    }

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: DEATH_FADE_MS,
      onComplete: () => this.onDeathComplete()
    });
  }

  onDeathComplete() {
    // Dark slimes fracture into smaller, pooled slimes at the death spot (Sprint
    // 4); children inherit the parent's level (Sprint 5) and carry canSplit=false
    // so a chain can't snowball.
    if (this.slimeType === 'dark_slime' && this.canSplit && this.scene.spawnDarkSlimeSplit) {
      this.scene.spawnDarkSlimeSplit(this.x, this.y, this.level);
    }
    // Split children award no loot — they exist for pressure, not income, so the
    // resource economy stays untouched (Sprint 4 hard rule).
    if (!this.isSplitChild) {
      this.dropBundle();
      this.dropSeeds();
    }
    EventBus.emit('enemy:died', {
      type: this.slimeType,
      position: { x: this.x, y: this.y },
      light: this.isSplitChild // suppress the heavy dark-slime death flash for children
    });
    const idx = this.scene.enemies.indexOf(this);
    if (idx > -1) this.scene.enemies.splice(idx, 1);
    // Pooled split children recycle through GameScene; everything else destroys.
    if (this._pooled && this.scene.releaseSplitSlime) {
      this.scene.releaseSplitSlime(this);
    } else {
      if (this.levelMarker) {
        this.levelMarker.destroy();
        this.levelMarker = null;
      }
      this.destroy();
    }
  }

  // Bring a pooled split slime back to life at (x, y), re-derived at `level`
  // (its new parent's level). applyLevel resets stats/size/tint/marker; the rest
  // mirrors the per-instance state the constructor sets.
  resetForReuse(x, y, level) {
    this.setPosition(x, y);
    this.applyLevel(level != null ? level : this.level);
    this.isDead = false;
    this.setActive(true);
    this.setVisible(true);
    this.setAlpha(1);
    if (this.body) this.body.enable = true;
    this.setVelocity(0, 0);
    this._knockbackUntil = 0;
    this._attackCdUntil = 0;
    this._strikeTimer = 0;
    this._recoverTimer = 0;
    this._attackStrikesDone = 0;
    if (this._telegraphTween) {
      this._telegraphTween.stop();
      this._telegraphTween = null;
    }
    this.state = STATE.WANDER;
    this._isWanderPaused = false;
    this.pickNewWanderDirection();
    if (this.levelMarker) this.levelMarker.setVisible(true);
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
