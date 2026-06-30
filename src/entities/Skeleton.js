// Skeleton.js
//
// Deep-forest patrolling enemy introduced in Sprint 3. Walks a fixed 3-waypoint
// loop until the player enters detectRange, chases until the player escapes
// loseRange, then navigates back to the nearest waypoint and resumes patrol.
// Tankier and harder-hitting than slimes; drops a guaranteed Red Berry plus one
// weighted-random seed on death. Damage to the player and death notifications go
// out via EventBus only — the skeleton never calls Player methods directly.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { GARDEN_LEFT, GARDEN_RIGHT, GARDEN_TOP, GARDEN_BOTTOM } from '../core/Constants.js';
import { spawnEnemyAlert } from './enemyIndicator.js';
import { createLevelMarker, setMarkerLevel, positionLevelMarker } from './enemyLevelMarker.js';

// patrol/chase → WIND_UP (red flash + rear-back, committed) → overhead strike →
// RECOVER (long, vulnerable punish window). The wind-up is dodgeable with a dash
// out of strike range (Sprint 4).
const STATE = { PATROL: 'PATROL', CHASE: 'CHASE', WIND_UP: 'WIND_UP', RECOVER: 'RECOVER' };
const WAYPOINT_REACHED = 12; // px — close enough to advance to the next waypoint
const LOOK_RANGE = 200; // px — head turns toward the player within this range (Sprint 9)
const HIT_FLASH_MS = 100;
const KNOCKBACK_VELOCITY = 160; // heavier than a slime — takes less of a shove
const KNOCKBACK_MS = 250;
const DAMAGE_TEXT_OFFSET = 24;
const DEATH_FADE_MS = 400;

// Drawn at 1x (Sprint 13: halved from 2x to match the player and read correctly
// against the hand-built world). Visual only — the physics body is set up
// separately below.
const SPRITE_SCALE = 1;
// Fixed collider radius (source px), pinned so the sprite scale doesn't inflate
// the hitbox. Effective in-world radius is halfWidth (= BODY_RADIUS * scaleX).
const BODY_RADIUS = 8;

export default class Skeleton extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, waypoints, gameData, opts = {}) {
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

    this.enemyType = 'skeleton';

    // --- Variant (Sprint 7): 'standard' (smaller, white-tinted, Lv1-3) vs 'mega'
    // (current oversized, no tint, Lv3-5, higher HP/damage). Both share the same
    // Anokolisa sheets; the variant only changes scale, tint, level band, stats. ---
    const stats = gameData.enemies.skeleton;
    const cfg = gameData.enemies.leveling;
    this.variant = (opts && opts.variant) === 'mega' ? 'mega' : 'standard';
    const v = (stats.variants && stats.variants[this.variant]) || {};

    // --- Level (Sprint 5): difficulty driver — clamped to the variant's band. ---
    this.level = Phaser.Math.Clamp(
      Math.round((opts && opts.level) || 1),
      v.minLevel || 1,
      v.maxLevel || 5
    );
    const i = this.level - 1;
    const curve = stats.levelCurve;
    const hpMult = curve ? curve.hp[i] : 1;
    const dmgMult = curve ? curve.damage[i] : 1;
    const spdMult = curve ? curve.speed[i] : 1;

    // Visual draw scale + a per-level size step (set before the body below; the
    // collider radius derives from this.width, unscaled). The real 64x64 frames
    // carry transparent padding, so the art reads smaller than the frame box.
    const sizeStep = cfg ? cfg.sizeStepPerLevel * (this.level - 1) : 0;
    this._baseScale = SPRITE_SCALE * (1 + sizeStep) * (v.scaleMult || 1);
    this.setScale(this._baseScale);
    if (useReal) this.setupRealAnimations();

    // --- Stats (data → level curve) ---
    this.hp = Math.max(1, Math.round(stats.hp * hpMult * (v.hpMult || 1)));
    this.maxHP = this.hp;
    this.damage = Math.max(1, Math.round(stats.damage * dmgMult * (v.damageMult || 1)));
    this.patrolSpeed = stats.patrolSpeed * spdMult;
    this.chaseSpeed = stats.chaseSpeed * spdMult;
    this.detectRange = stats.detectRange;
    this.loseRange = stats.loseRange;

    // Overhead-strike telegraph config (Sprint 4) — all timings from data.
    // Level can speed the wind-up and add a follow-up strike (Sprint 5).
    this.overhead = stats.overhead || null;
    this._windUpMult =
      this.overhead && this.overhead.windUpMultByLevel ? this.overhead.windUpMultByLevel[i] : 1;
    this._followUp =
      this.overhead && this.overhead.followUpFromLevel
        ? this.level >= this.overhead.followUpFromLevel
        : false;
    this._strikesDone = 0;
    this._attackCdUntil = 0;
    this._recoverTimer = 0;
    this._telegraphTween = null;
    this._strikeFacingLeft = false;

    // Variant body tint (Sprint 7), restored after every hit-flash/telegraph:
    // standard is white-tinted to read as the lesser skeleton, mega is natural
    // bone (no tint). Overrides the Sprint 5 per-level tint.
    this._baseTint = v.tint != null ? parseInt(v.tint, 16) : null;
    if (this._baseTint !== null) this.setTint(this._baseTint);

    // Level marker (Sprint 5): pips above the skeleton, colored by danger.
    this.levelMarker = createLevelMarker(scene);
    this.refreshDangerColor();

    // --- Combat state ---
    this.isDead = false;
    this._knockbackUntil = 0;

    // --- Physics: fixed-radius collider, centred in the sprite ---
    // Pinned to BODY_RADIUS (not width*ratio) so the sprite scale doesn't
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

  // Recolor the level marker by how this skeleton compares to the player's power.
  refreshDangerColor() {
    const color = this.scene.dangerColorForLevel
      ? this.scene.dangerColorForLevel(this.level)
      : null;
    setMarkerLevel(this.levelMarker, this.level, color);
  }

  restoreBaseTint() {
    if (this._baseTint !== null) this.setTint(this._baseTint);
    else this.clearTint();
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
    if (this.levelMarker) positionLevelMarker(this.levelMarker, this);
    if (this.isDead) return;

    // While being knocked back, let the impulse play out — skip AI steering so
    // the velocity we set in takeDamage() is not immediately overwritten.
    if (this.scene.time.now < this._knockbackUntil) {
      this.confineToForest();
      return;
    }

    const dtMs = dt * 1000;

    // --- Committed overhead states run to completion; no chase/lose retarget. ---
    if (this.state === STATE.WIND_UP) {
      this.setVelocity(0, 0); // rooted mid-rear-back; the tween + red tint are the tell
      this.confineToForest();
      return;
    }
    if (this.state === STATE.RECOVER) {
      this.setVelocity(0, 0); // long vulnerable window after the slam
      this._recoverTimer -= dtMs;
      if (this._recoverTimer <= 0) {
        this.state = STATE.CHASE;
        if (this.useReal && this.anims) this.anims.resume();
      }
      this.confineToForest();
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // --- Transitions ---
    // Forest Fog weather reduces detect range for the day (Sprint 11).
    const detect = this.detectRange * (this.scene.weatherDetectMult || 1);
    if (this.state === STATE.PATROL && dist < detect) {
      this.state = STATE.CHASE;
      this.showAlertIndicator(); // "!" — spotted the player
    } else if (this.state === STATE.CHASE && dist > this.loseRange) {
      this.state = STATE.PATROL;
      this._wpIndex = this.nearestWaypointIndex();
      this.showLostIndicator(); // "?" — lost the player
    }

    // Head-turn tell: face the player whenever they're close, even mid-patrol.
    if (dist < LOOK_RANGE) {
      this.setFlipX(player.x < this.x);
    }

    // --- Behaviour ---
    if (this.state === STATE.CHASE) {
      // Wind up the overhead when in range and off cooldown; otherwise close in.
      if (this.overhead && dist <= this.overhead.attackRange && this.scene.time.now >= this._attackCdUntil) {
        this.beginAttack();
      } else {
        this.moveToward(player.x, player.y, this.chaseSpeed);
      }
    } else {
      this.patrol();
    }

    this.confineToForest();
  }

  // --- Overhead strike telegraph (Sprint 4) ---------------------------------

  // Begin an attack: a high-level skeleton follows the first overhead with a
  // second, snappier one (Sprint 5). Tracks how many strikes this attack runs.
  beginAttack() {
    this._strikesPlanned = 1 + (this._followUp ? 1 : 0);
    this._strikesDone = 0;
    this.startWindUp();
  }

  // TODO Sprint N — sword animation on overhead strike:
  // When sword sprite assets are imported, add a sword child sprite
  // to the skeleton that animates during the WIND_UP → STRIKE states.
  // The telegraph (red flash + jiggle) should be replaced with a
  // visible weapon raise so the wind-up reads as intentional not glitchy.

  // Rear back with a red flash + upward stretch (the tell), then slam. A player
  // who dashes out of strike range (or behind the locked facing) before the slam
  // takes no hit and gets a long punish window. Higher levels wind up faster, and
  // a follow-up strike is snappier than the lead (Sprint 5).
  startWindUp() {
    const player = this.scene.player;
    this.state = STATE.WIND_UP;
    this.setVelocity(0, 0);
    if (player) {
      this._strikeFacingLeft = player.x < this.x;
      this.setFlipX(this._strikeFacingLeft);
    }
    if (this.useReal && this.anims) this.anims.pause();
    if (this._telegraphTween) this._telegraphTween.stop();
    this.setTint(0xff3333); // red wind-up flash — shared telegraph grammar
    const base = this.overhead.windUpMs * this._windUpMult;
    const duration = this._strikesDone > 0 ? base * 0.7 : base;
    this._telegraphTween = this.scene.tweens.add({
      targets: this,
      scaleY: this._baseScale * this.overhead.raiseScale,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (this.isDead || this.state !== STATE.WIND_UP) return;
        this.strike();
      }
    });
  }

  strike() {
    this._telegraphTween = null;
    this.setScale(this._baseScale); // slam down to neutral
    this.restoreBaseTint();
    this.resolveStrike();
    this.afterStrike();
  }

  // Chain a follow-up wind-up if this attack has strikes left, else recover.
  afterStrike() {
    this._strikesDone++;
    if (this._strikesDone < this._strikesPlanned) {
      this.startWindUp();
    } else {
      this.enterRecover();
    }
  }

  // Land the overhead if the player is still inside strikeRange and within the
  // frontal arc of the locked facing — routed through the i-frame-aware damage path.
  resolveStrike() {
    const o = this.overhead;
    const player = this.scene.player;
    if (!player) return;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (dist > o.strikeRange) return;
    const facing = this._strikeFacingLeft ? Math.PI : 0;
    const toPlayer = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const half = Phaser.Math.DegToRad(o.strikeArcDeg / 2);
    if (Math.abs(Phaser.Math.Angle.Wrap(toPlayer - facing)) > half) return;
    const dmg = Math.max(1, Math.round(this.damage * o.strikeDamageMult));
    EventBus.emit('player:damaged', { amount: dmg });
  }

  enterRecover() {
    this.state = STATE.RECOVER;
    this.setVelocity(0, 0);
    this._recoverTimer = this.overhead.recoverMs;
    this._attackCdUntil = this.scene.time.now + this.overhead.cooldownMs;
  }

  // A landed hit during the wind-up interrupts the overhead (RECOVER is left
  // alone so the punish window survives).
  interruptAttack() {
    if (this.state !== STATE.WIND_UP) return;
    if (this._telegraphTween) {
      this._telegraphTween.stop();
      this._telegraphTween = null;
    }
    this.setScale(this._baseScale);
    this.restoreBaseTint();
    if (this.useReal && this.anims) this.anims.resume();
    this.state = STATE.CHASE;
    this._attackCdUntil = this.scene.time.now + this.overhead.cooldownMs;
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

  // Keep skeletons out of the safe garden square — bounce them back off whichever
  // garden edge is nearest, sealing the fence gate gaps the player walks through.
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

  // Red "!" tell when the skeleton spots the player (PATROL → CHASE): pops above
  // the skeleton, bounces up, holds, then fades — plus a brief red body tint.
  showAlertIndicator() {
    spawnEnemyAlert(this, '!', '#ff3333', false);
    this.setTint(0xff6666);
    this.scene.time.delayedCall(200, () => {
      if (!this.isDead) this.restoreBaseTint();
    });
  }

  // Blue "?" tell when the skeleton loses the player (CHASE → PATROL). Same motion
  // as the alert but fades faster and leaves the body untinted.
  showLostIndicator() {
    spawnEnemyAlert(this, '?', '#66aaff', true);
  }

  // Requested by GameScene on body overlap. Player owns the invincibility
  // window, so emitting every overlap frame is safe.
  touchPlayer() {
    EventBus.emit('player:damaged', { amount: this.damage });
  }

  // --- Combat ---------------------------------------------------------------

  // opts.noKnockback (Sprint magic-4): a knockback-FREE damage path for ground/DoT
  // sources (Thornfield, any future damaging field), so a per-tick field doesn't shove
  // enemies out of itself after one tick. Damage/hit-flash/interrupt/float number are
  // unchanged — only the shove is skipped.
  takeDamage(amount, sourcePosition, opts = {}) {
    if (this.isDead) return;
    // Getting hit mid-wind-up interrupts the overhead (no effect on RECOVER).
    this.interruptAttack();
    this.hp -= amount;

    // Hit flash.
    this.setTint(0xffffff);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (!this.isDead) this.restoreBaseTint();
    });

    // Knockback away from the hit source — skipped for ground/DoT sources so a field
    // doesn't punt enemies out of itself each tick (opts.noKnockback).
    if (!opts.noKnockback) {
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
    // Clear any in-flight overhead tell so a dying skeleton doesn't crumble while
    // stuck mid-rear-back (raised scale / red tint).
    if (this._telegraphTween) {
      this._telegraphTween.stop();
      this._telegraphTween = null;
    }
    this.setScale(this._baseScale);
    this.clearTint();

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
        // Kill loot (coins + souls + rare full-plant) is handled centrally in
        // GameScene.onEnemyDied off this event. // coins + souls scale level
        EventBus.emit('enemy:died', { type: 'skeleton', position: { x: this.x, y: this.y }, level: this.level });
        const idx = this.scene.enemies.indexOf(this);
        if (idx > -1) this.scene.enemies.splice(idx, 1);
        if (this.levelMarker) {
          this.levelMarker.destroy();
          this.levelMarker = null;
        }
        this.destroy();
      }
    });
  }

  // --- Region spawning (Sprint 15) ------------------------------------------

  // True while engaged with the player — any non-patrol state. The region system
  // reads this to keep a chasing skeleton alive across region boundaries until it
  // loses the player and resumes patrol.
  isAggro() {
    return this.state !== STATE.PATROL;
  }

  // Silently leave the simulation (region despawn): no loot, no death FX. Kills any
  // running attack/telegraph tween, tears down the level marker, and destroys the
  // sprite (auto-removed from its physics group).
  despawn() {
    this.isDead = true; // stop update() from steering during teardown
    this.scene.tweens.killTweensOf(this);
    if (this.levelMarker) {
      this.levelMarker.destroy();
      this.levelMarker = null;
    }
    this.destroy();
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
