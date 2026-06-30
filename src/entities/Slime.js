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

// Drawn at 1x (Sprint 13: halved from 2x to match the player and read correctly
// against the hand-built world). Visual only — the physics body is set up
// separately below. The anticipation pulse multiplies this so the tell still
// reads as a grow, not a shrink, against the baseline.
const SPRITE_SCALE = 1;
// Fixed collider radius (source px), pinned so the sprite scale doesn't inflate
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

export default class Slime extends Phaser.Physics.Arcade.Sprite {
  // opts (Sprint 4) configures split children: { hpFactor, damageFactor,
  // scaleFactor, canSplit:false, pooled:true, isSplitChild:true }. Plain slimes
  // pass nothing and behave as before.
  constructor(scene, x, y, slimeType, gameData, opts = {}) {
    const hasSheet = scene.textures.exists('slime_sheet');
    // Sprint 14b: split children keep their dark-slime STATS but wear the STANDARD
    // slime skin. Green and dark slimes share slime_sheet and differ only by the
    // per-level body tint (levelTint), so skinType decides which type's tint +
    // placeholder this slime renders with — independent of its stat type.
    const skinType = opts.skinType || slimeType;
    const placeholderKey =
      skinType === 'dark_slime' ? 'px_dark_slime' : 'px_green_slime';
    super(scene, x, y, hasSheet ? 'slime_sheet' : placeholderKey);

    this.hasSheet = hasSheet;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.slimeType = slimeType;
    this.skinType = skinType;

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

    // Anti-stand-and-mash (Sprint 14b). _attackImmuneUntil: while a lunge is
    // committed the slime can't be interrupted or knocked out of it, so spam can't
    // cancel-lock it. The snap fields track stationary-spam: when the player stands
    // still and keeps swinging in range, the NEXT lunge becomes a faster red snap.
    this._attackImmuneUntil = 0;
    this._spamSeenAttackCount = 0;
    this._stationarySpamHits = 0;
    this._snapNextLunge = false;
    this._lungeIsSnap = false;

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
    // Sprint 14b: the tint comes from skinType, not slimeType — a split child has
    // dark-slime stats but renders with the green-slime tint so it looks standard.
    const skinStats = this.scene.gameData.enemies[this.skinType] || stats;
    this._baseTint = skinStats.levelTint ? parseInt(skinStats.levelTint[i], 16) : null;
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
      // Read stationary spam (Sprint 14b) so a standing, mashing player provokes a
      // faster snap-lunge instead of a predictable walk-into-range lunge.
      this.detectStationarySpam(player, dist);
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
  // Latches whether this whole attack is a punishing snap-lunge (Sprint 14b),
  // provoked by stationary spam, then clears the one-shot flag.
  beginLunge() {
    this._attackStrikesDone = 0;
    this._lungeIsSnap = this._snapNextLunge;
    this._snapNextLunge = false;
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
    // Commit-immunity opens here (Sprint 14b): hits land for damage but can't
    // interrupt or knock the slime out of the lunge for attackImmunityMs.
    this._attackImmuneUntil = this.scene.time.now + (this.lunge.attackImmunityMs || 0);
    // Snap-lunge (provoked by stationary spam) telegraphs red and quicker; the
    // standard commit keeps the warm warning flash — same grammar across enemies.
    this.setTint(this._lungeIsSnap ? 0xff5a3c : 0xffe08a);
    this._telegraphTween = this.scene.tweens.add({
      targets: this,
      scaleY: this._baseScale * this.lunge.squashScaleY,
      duration: this.lungeWindUpMs(),
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
    const speed = this.lungeSpeedVal();
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this._strikeTimer = this.lunge.lungeDurationMs;
  }

  // Effective lunge timings: a snap-lunge uses the faster snap windUp/lungeSpeed
  // (Sprint 14b), otherwise the standard telegraph values. Both come from config.
  lungeWindUpMs() {
    const snap = this._lungeIsSnap && this.lunge.snap;
    return snap ? this.lunge.snap.windUpMs : this.lunge.windUpMs;
  }

  lungeSpeedVal() {
    const snap = this._lungeIsSnap && this.lunge.snap;
    return snap ? this.lunge.snap.lungeSpeed : this.lunge.lungeSpeed;
  }

  // True while a committed lunge is protected from interruption/knockback.
  isAttackImmune() {
    return (
      (this.state === STATE.WIND_UP || this.state === STATE.STRIKE) &&
      this.scene.time.now < this._attackImmuneUntil
    );
  }

  // Count player swings made while standing still and in range; once enough pile
  // up, arm a snap-lunge for the next attack so standing and mashing gets punished
  // instead of being a safe dominant strategy. Any meaningful movement resets the
  // read. All thresholds are config (lunge.snap).
  detectStationarySpam(player, dist) {
    const snap = this.lunge && this.lunge.snap;
    if (!snap) return;
    const body = player.body;
    const speed = body ? Math.hypot(body.velocity.x, body.velocity.y) : 0;
    const stationary = speed < snap.stationarySpeed;
    const inRange = dist <= this.lunge.attackRange * snap.rangeMult;
    const attacks = player.attackCount || 0;
    const newAttacks = attacks - this._spamSeenAttackCount;
    this._spamSeenAttackCount = attacks;
    if (!stationary) {
      this._stationarySpamHits = 0; // moving breaks the read — reposition rewarded
      return;
    }
    if (newAttacks > 0 && inRange) {
      this._stationarySpamHits += newAttacks;
      if (this._stationarySpamHits >= snap.triggerAttacks) {
        this._snapNextLunge = true;
        this._stationarySpamHits = 0;
      }
    }
  }

  enterRecover() {
    this.state = STATE.RECOVER;
    this.setVelocity(0, 0);
    this._recoverTimer = this.lunge.recoverMs;
    this._attackCdUntil = this.scene.time.now + this.lunge.cooldownMs;
  }

  // A landed hit during the wind-up interrupts the coil — the slime can't follow
  // through. A committed leap (STRIKE) still lands and the RECOVER punish window
  // is preserved; only the pre-commit wind-up is cancellable. Sprint 14b: while
  // the commit-immunity window is open, even the wind-up can't be cancelled, so
  // spamming attack no longer trivially cancel-locks the lunge.
  interruptAttack() {
    if (this.state !== STATE.WIND_UP) return;
    if (this.isAttackImmune()) return;
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

  // opts.noKnockback (Sprint magic-4): a knockback-FREE damage path for ground/DoT
  // sources (Thornfield, any future damaging field). Without it the per-tick DoT
  // shoved enemies straight out of the field after one tick, undercutting "deny this
  // ground"; with it they sit in the zone taking sustained damage/slow. Damage, hit-
  // flash, interrupt and the float number are unchanged — only the shove is skipped.
  takeDamage(amount, sourcePosition, opts = {}) {
    if (this.isDead) return;
    // A committed lunge is protected (Sprint 14b): the hit still deals damage, but
    // it neither interrupts the wind-up nor knocks the slime off its leap — so the
    // lunge lands on a stationary player rather than being mash-cancelled.
    const committed = this.isAttackImmune();
    // Getting hit mid-wind-up interrupts the coil (no-op on STRIKE/RECOVER, and
    // no-op while committed).
    this.interruptAttack();
    this.hp -= amount;

    // Hit flash — white for a beat, then back to the slime's base look.
    this.setTint(0xffffff);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (this.isDead) return;
      if (this._baseTint !== null) this.setTint(this._baseTint);
      else this.clearTint();
    });

    // Knockback away from the hit source — skipped during a protected commit so the
    // leap's locked-in velocity rides through, and skipped for ground/DoT sources
    // (opts.noKnockback) so a field doesn't punt enemies out of itself each tick.
    if (!committed && !opts.noKnockback) {
      const angle = Phaser.Math.Angle.Between(sourcePosition.x, sourcePosition.y, this.x, this.y);
      this.setVelocity(Math.cos(angle) * KNOCKBACK_VELOCITY, Math.sin(angle) * KNOCKBACK_VELOCITY);
      this._knockbackUntil = this.scene.time.now + KNOCKBACK_MS;
    }

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
    // All kill loot (coins + souls + the rare full-plant drop) is handled centrally in
    // GameScene.onEnemyDied off this event; split children are flagged `light` there so
    // they award nothing (pressure, not income — Sprint 4 hard rule).
    EventBus.emit('enemy:died', {
      type: this.slimeType,
      position: { x: this.x, y: this.y },
      level: this.level, // coins + souls drop scales type × level
      light: this.isSplitChild // split child: no loot + suppress the heavy death flash
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
    this._attackImmuneUntil = 0;
    this._spamSeenAttackCount = 0;
    this._stationarySpamHits = 0;
    this._snapNextLunge = false;
    this._lungeIsSnap = false;
    if (this._telegraphTween) {
      this._telegraphTween.stop();
      this._telegraphTween = null;
    }
    this.state = STATE.WANDER;
    this._isWanderPaused = false;
    this.pickNewWanderDirection();
    if (this.levelMarker) this.levelMarker.setVisible(true);
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

  // --- Region spawning (Sprint 15) ------------------------------------------

  // True while engaged with the player — any non-wander state. The region system
  // reads this to keep a chasing slime alive across region boundaries (it won't be
  // despawned until it loses the player and drops back to WANDER).
  isAggro() {
    return this.state !== STATE.WANDER;
  }

  // Silently leave the simulation (region despawn): no loot, no death FX. Stops any
  // running telegraph tween and tears down the level marker, then destroys the
  // sprite (which auto-removes it from its physics group).
  despawn() {
    this.isDead = true; // stop update() from steering during teardown
    this.scene.tweens.killTweensOf(this);
    this._telegraphTween = null;
    if (this.levelMarker) {
      this.levelMarker.destroy();
      this.levelMarker = null;
    }
    this.destroy();
  }
}
