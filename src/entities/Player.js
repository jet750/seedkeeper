// Player.js
//
// The Seedkeeper. Arcade-physics sprite with 4-directional WASD/arrow movement,
// zone awareness, an HP pool with 1s post-hit invincibility, and EventBus-only
// communication with the rest of the game (no direct cross-module calls).

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import {
  GARDEN_LEFT,
  GARDEN_RIGHT,
  GARDEN_TOP,
  GARDEN_BOTTOM,
  SECONDARY_SLOT_COUNT,
  MANA_DEFAULT_MAX
} from '../core/Constants.js';
import Seed from './Seed.js';

const FLASH_INTERVAL_MS = 100;
const INVINCIBILITY_MS = 1000;

// --- Game feel (Sprint 9) ---
const IDLE_THRESHOLD_MS = 3000; // stand still this long → idle animation
const IDLE_BOB_SCALE_Y = 0.92; // gentle squash when no idle frames exist
const IDLE_BOB_MS = 600;
const STEP_INTERVAL_BASE_MS = 320; // footstep cadence at base speed
const STEP_VOLUME = 0.3;

// Walk-cycle playback speed. Lowered 8 -> 6 (Sprint 13), then 6 -> 4 (Sprint mobile-
// playability) — the cycle still read as nauseously fast on both desktop and mobile,
// so the leg alternation is slowed for a more natural step. Animation cadence is
// independent of travel speed (it is NOT tied to move speed). Tunable: raise for a
// brisker step, lower for slower.
const WALK_FRAME_RATE = 4;

// Facing-flip hysteresis (Sprint mobile-control-feel). The cardinal `facing` only
// flips when one movement axis dominates the other by this ratio. The mobile joystick
// feeds continuous analog dx/dy, so near a diagonal (|dx|≈|dy|) an un-thresholded
// "abs(dx) > abs(dy)" test oscillated facing frame-to-frame — each flip swapped the
// walk_<dir> anim key and reset the cycle to frame 0, so the sprite snapped direction
// and never animated ("glitchy" mobile movement). With this margin an ambiguous
// near-diagonal HOLDS the current facing instead of chattering. 1.0 = old behaviour;
// higher = stickier (flips later). Tunable during device feel-test. // TUNE
const FACING_FLIP_RATIO = 1.18;

// Drawn at 1x (Sprint 13: halved from 2x — the doubled sprite read oversized
// against the hand-built world's trees and props). Visual scale only; the physics
// body is configured independently below. The idle squash + stopIdle reset use
// this as their baseline so the scale holds.
const SPRITE_SCALE = 1;
// Fixed collider radius (source px). Pinned to a constant; Phaser's effective
// collision radius is halfWidth (= BODY_RADIUS * scaleX), so at the 1x scale this
// lands ~8px in-world — a snug footprint that threads tight forest tree gaps.
const BODY_RADIUS = 8;

// --- Melee attack (Sprint 3) ---
const ATTACK_ARC_RADIUS = 50; // px reach of the swing
const ATTACK_ARC_DEGREES = 90; // cone width, centred on facing
const ATTACK_VISUAL_MS = 150; // how long the swing graphic stays on screen
const ATTACK_ARC_ALPHA = 0.35;
const DIRECTION_ANGLES = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2
};

// --- Input buffering (Sprint 12 controller feel) ---
// A press landing just before its cooldown clears is held this long and fires
// the instant the cooldown expires, so combat/dash never feel like they "ate"
// an input. Tuned short so it assists timing without auto-firing stale presses.
const ATTACK_BUFFER_MS = 120;
const DASH_BUFFER_MS = 100;

// --- Stat-tree effects (Sprint 10) ---
// Provisional caps/tunables for the reconciled stat trees. The per-level
// coefficients live in entities.json (upgrades[*].stat.perLevelBonus); these
// bound the runtime effect so a maxed tree never trivialises the game.
const DAMAGE_REDUCTION_CAP = 0.3; // defense tree caps incoming-damage reduction at 30%
const REGEN_PAUSE_MS = 3000; // passive HP regen pauses this long after taking a hit
const DASH_BONUS_CD_CAP = 0.5; // dash tree shaves at most 50% off the dash cooldown
const DASH_BONUS_DIST_CAP = 0.25; // …and adds at most 25% dash distance

// --- Ranged / dash (Sprint 4) ---
const RANGED_COOLDOWN_MS = 400; // min time between shots
const CRIT_MULTIPLIER = 2; // crit deals double damage
const DASH_TRAIL_COUNT = 3;
const DASH_TRAIL_STAGGER_MS = 50;
const DASH_TRAIL_FADE_MS = 300;
const DASH_TRAIL_TINT = 0x88aaff;
const DIRECTION_VECTORS = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
};

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, gameData) {
    const hasSheet = scene.textures.exists('player_sheet');
    super(scene, x, y, hasSheet ? 'player_sheet' : 'px_player');

    this.hasSheet = hasSheet;
    if (!hasSheet) {
      // TODO(asset): drop player_sheet.png into /assets/images for animated
      // 4-direction walk/idle. Placeholder rectangle is in use until then.
    }

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Visual draw scale for zoom visibility. Set before the physics body below;
    // the circle radius is derived from this.width (source frame size, unaffected
    // by scale), so the collider math is unchanged.
    this.setScale(SPRITE_SCALE);

    // --- Stats (from data, never hardcoded) ---
    const stats = gameData.player;
    this.maxHP = stats.maxHP;
    this.speed = stats.speed;
    this.currentHP = this.maxHP;

    // --- Combat (Sprint 3) ---
    this.attackDamage = stats.attackDamage;
    this.attackCooldown = stats.attackCooldown; // ms between swings (weapon overrides)
    this.attackCooldownRemaining = 0;

    // Anti-stand-and-mash (Sprint 14b). attackCommitMs: a brief window after a
    // swing during which the player is committed and cannot dash-cancel out of the
    // attack, so mashing then instantly dodging a slime lunge isn't free. attackCount
    // is a monotonic swing tally slimes read to detect stationary spam.
    this.attackCommitMs = stats.attackCommitMs || 0;
    this._attackCommitRemaining = 0;
    this.attackCount = 0;

    // Input buffers (Sprint 12) — set when a press lands during cooldown, drained
    // the instant the matching cooldown clears.
    this.attackBuffer = false;
    this.attackBufferTimer = 0;
    this.dashBuffer = false;
    this.dashBufferTimer = 0;

    // --- Secondary-slot model (Sprint control-scheme-combat-input) ---
    // The active secondary determines what "fire active secondary" does. Slot 1 =
    // ranged (the only functional secondary this sprint). Slots 2..N are inert spell
    // SELECTORS. Defaults to slot 1.
    this.activeSecondary = 1;
    // Hold-to-strafe (Shift): while true, movement no longer rotates `facing`, so the
    // player can move sideways while keeping their aim/swing direction. _strafeTarget is
    // the specific enemy locked on the rising edge of Shift — facing re-points at its
    // live position every frame while held (persistent tracking lock).
    this._strafing = false;
    this._strafeTarget = null;

    // --- Mana scaffold (Sprint control-scheme-combat-input; DORMANT) ---
    // No spells exist yet, so mana stays at 0 and `manaUnlocked` false — the HUD bar
    // therefore never shows. The spell sprint flips this via unlockMana() and gates
    // each spell behind canCast()/spendMana(). Selecting/firing slots 2-5 is inert
    // until then.
    this.manaUnlocked = false;
    this.maxMana = 0;
    this.currentMana = 0;

    // --- Upgrades & gear (Sprint 4; reconciled Sprint 10) ---
    // Stat multipliers/bonuses recomputed from scratch on each upgrade (no drift).
    // One plant feeds each key (entities.json upgrades). timerBonus is legacy — no
    // tree feeds it now, but it stays 0 so DaySystem.setTimerBonus(0) is a no-op.
    this.statBonuses = {
      attackMult: 0, // tomato — melee damage
      damageReduction: 0, // sunflower — % incoming damage reduced (capped)
      hpMax: 0, // pumpkin — max-HP %
      speedMult: 0, // carrots — move speed %
      critChance: 0, // beanstalk — added crit chance
      harvestBonus: 0, // wheat — seed-collect range %
      rangedDamage: 0, // pineapple — projectile damage %
      spellPower: 0, // blue_flower — wired now, spells land later
      dashBonus: 0, // cucumber — dash cooldown↓ / distance↑
      healthRegen: 0, // red_berry — passive HP/sec
      timerBonus: 0 // legacy (no tree feeds this)
    };
    this.equippedGear = { weapon: null, armor: null, boots: null, ranged: null, wateringCan: 'basic' };

    // Derived gear effects (set by equip* methods).
    this.weaponDamage = 0; // flat bonus on top of effectiveAttack
    this.attackArcDegrees = ATTACK_ARC_DEGREES; // widened by heavier weapons
    this.armorReduction = 0; // 0..1 fraction of incoming damage blocked
    this.bootsSpeedBonus = 0; // additive multiplier from boots
    this.dashEnabled = false;
    this.dashData = null;
    this.dashCooldownRemaining = 0;
    this.isDashing = false;
    this.lastMoveDir = { x: 0, y: 1 }; // for dash when momentarily idle mid-press
    this.rangedData = null;
    this.rangedAmmo = 0;
    this.rangedAmmoMax = 0;
    this.rangedCooldownRemaining = 0;
    this.wateringCan = { bedsPerUse: 1 };

    // Effective combat values (kept in sync by recalculateStats()).
    this.effectiveAttack = stats.attackDamage;
    this.effectiveCrit = stats.critChance;

    // --- Inventory (Sprint 2) ---
    this.gameData = gameData;
    this.seedSlots = new Array(stats.seedSlots).fill(null); // e.g. ['carrots', null, null]

    // --- Water charges (Sprint 9; v2 watering capacity tree) ---
    // Replaces the old binary hasWater. A well visit fills `waterCharges` up to
    // `waterCapacity`; each bed watering spends one. Capacity is raised by the
    // coin-funded watering tier (see GameScene.applyWateringTier).
    this.waterCapacity = 1;
    this.waterCharges = 0;

    // --- Passive regen (Sprint 10; red_berry healthRegen tree) ---
    // Fractional HP accumulates each frame at statBonuses.healthRegen HP/sec and
    // heals in whole-HP steps; a hit sets _regenPauseRemaining so regen stalls
    // briefly after taking damage.
    this._regenAccum = 0;
    this._regenPauseRemaining = 0;

    // --- Idle + footsteps (Sprint 9 game feel) ---
    this.idleTimer = 0;
    this.isIdling = false;
    this.idleThreshold = IDLE_THRESHOLD_MS;
    this._idleTween = null;
    this.stepTimer = 0;
    this.stepCount = 0; // alternates the two footstep samples

    // --- State ---
    this.facing = 'down';
    // Last anim key actually issued (Sprint mobile-control-feel). playMove/playIdle only
    // (re)issue anims.play on a real change, so a steady heading never restarts the walk
    // cycle (the per-frame replay that, paired with facing chatter, caused the jank).
    this._currentAnimKey = null;
    this.isDead = false;
    this.invincible = false;
    this._flashEvent = null;
    this._invEndEvent = null;
    this._flashOn = false;

    // --- Physics body: fixed-radius circular collider pinned to the feet ---
    // Radius is BODY_RADIUS (not width*ratio) so the sprite scale doesn't inflate
    // the hitbox. Horizontally centred; vertically dropped to ~72% down the frame
    // so the collider hugs the feet (lower third), not the full sprite bounds —
    // the head/canopy can overlap a tree while the feet thread the gap below it.
    this.setCollideWorldBounds(true);
    const radius = BODY_RADIUS;
    this.body.setCircle(
      radius,
      this.width / 2 - radius,
      this.height * 0.72 - radius
    );
    this.setDepth(10);

    if (hasSheet) {
      this.createAnimations();
    }

    // --- Input (Sprint control-scheme-combat-input: rebound) ---
    // Q / left-click = melee · R / right-click = fire active secondary · Space = dash ·
    // Shift = hold-to-strafe (lock facing) · 1-5 select the active secondary (handled in
    // GameScene so it can be gated against the plant/swap pickers' own number keys) · E
    // interact (F legacy alias) is owned by GameScene. Movement is WASD (arrows alt).
    this.keys = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upArrow: Phaser.Input.Keyboard.KeyCodes.UP,
      downArrow: Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      melee: Phaser.Input.Keyboard.KeyCodes.Q,
      fireSecondary: Phaser.Input.Keyboard.KeyCodes.R,
      dash: Phaser.Input.Keyboard.KeyCodes.SPACE,
      strafe: Phaser.Input.Keyboard.KeyCodes.SHIFT
    });

    // --- Damage requests arrive via EventBus (slimes never call us directly) ---
    this._onDamageRequest = (data) => this.handleDamageRequest(data);
    EventBus.on('player:damaged', this._onDamageRequest);

    // --- Touch controls (Sprint Mobile) ---
    // The virtual joystick feeds an analog velocity here; keyboard always wins
    // when an axis is held (see update()). Desktop never emits these, so this is
    // inert there. Refs are stored so cleanup() can detach them exactly.
    this.touchVelocity = { x: 0, y: 0 };
    this._onTouchMove = ({ x, y }) => {
      this.touchVelocity.x = x;
      this.touchVelocity.y = y;
    };
    this._onTouchAttack = () => this.meleePressed();
    this._onTouchDash = () => this.tryDash();
    // The mobile Ranged-Magic button fires the ACTIVE SECONDARY now (slot 1 = ranged;
    // slots 2-5 inert), not ranged directly.
    this._onTouchRanged = () => this.fireSecondary();
    // The mobile radial (UIScene) and any cross-scene caller set the active secondary
    // via EventBus (selection only — never casts).
    this._onSecondarySelect = ({ slot } = {}) => this.selectSecondary(slot);
    EventBus.on('touch:move', this._onTouchMove);
    EventBus.on('touch:attack', this._onTouchAttack);
    EventBus.on('touch:dash', this._onTouchDash);
    EventBus.on('touch:ranged', this._onTouchRanged);
    EventBus.on('secondary:select', this._onSecondarySelect);

    // Clean up listeners when the scene tears down.
    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);

    // Seed effective stats from the base values (no upgrades applied yet).
    this.recalculateStats();

    // Establish and broadcast the starting zone (single source of truth).
    this.currentZone = this.computeZone();
    EventBus.emit('player:zoneChanged', { zone: this.currentZone });
  }

  createAnimations() {
    // player_sheet is a 4x4 grid (192x192 @ 48px): one ROW per direction, four walk
    // frames per row — row 0 down (0-3), row 1 up (4-7), row 2 left (8-11), row 3 right
    // (12-15), verified against the art. The idle pose for a direction is the FIRST frame
    // of that direction's row (the neutral standing frame). The old idle_* mapping read
    // 0/1/2/3 — i.e. four frames of the DOWN row — so idle_up/left/right showed a
    // down-facing pose; each idle now points at its own row's frame 0.
    const defs = [
      ['idle_down', 0, 0],
      ['idle_up', 4, 4],
      ['idle_left', 8, 8],
      ['idle_right', 12, 12],
      ['walk_down', 0, 3],
      ['walk_up', 4, 7],
      ['walk_left', 8, 11],
      ['walk_right', 12, 15]
    ];
    defs.forEach(([key, start, end]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('player_sheet', { start, end }),
        frameRate: start === end ? 1 : WALK_FRAME_RATE,
        repeat: start === end ? 0 : -1
      });
    });
  }

  update(dt) {
    if (this.isDead) {
      this.setVelocity(0, 0);
      return;
    }

    // Tick cooldowns down (dt is seconds; cooldowns are tracked in ms).
    const dtMs = dt * 1000;
    if (this.attackCooldownRemaining > 0) {
      this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - dtMs);
    }
    if (this._attackCommitRemaining > 0) {
      this._attackCommitRemaining = Math.max(0, this._attackCommitRemaining - dtMs);
    }
    if (this.rangedCooldownRemaining > 0) {
      this.rangedCooldownRemaining = Math.max(0, this.rangedCooldownRemaining - dtMs);
    }
    if (this.dashCooldownRemaining > 0) {
      this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - dtMs);
    }

    // Passive HP regen (red_berry healthRegen tree), paused briefly after a hit.
    this.tickRegen(dtMs);

    // Hold-to-strafe (Shift): persistent enemy-tracking lock (Sprint combat-input-mobile-
    // consolidated). On the rising edge, lock the specific current/nearest enemy; while
    // held, re-point facing at THAT same target's live position every frame so circling
    // or walking past it keeps the aim on it. The lock holds until Shift release or the
    // target's death — it never re-picks a different enemy mid-hold. updateFacing()
    // early-returns while strafing, so movement can't rotate the aim out from under it.
    // Desktop-only in practice: mobile has no Shift and uses forced auto-target instead.
    // TUNE: strafe lock mode — this is a TARGET lock (tracks the enemy). For a fixed
    // directional lock (freeze facing at press) instead, drop the acquire + per-frame
    // faceTowardAngle below and just hold _strafing.
    const strafeDown = this.keys.strafe.isDown;
    if (strafeDown && !this._strafing) this._strafeTarget = this.acquireStrafeTarget();
    this._strafing = strafeDown;
    if (!strafeDown) {
      this._strafeTarget = null;
    } else if (this._strafeTarget) {
      if (this._strafeTarget.active && !this._strafeTarget.isDead) {
        this.faceTowardAngle(
          Phaser.Math.Angle.Between(this.x, this.y, this._strafeTarget.x, this._strafeTarget.y)
        );
      } else {
        this._strafeTarget = null; // target died — lock ends, facing freezes where it is
      }
    }

    // Melee with input buffering (Sprint 12): if the cooldown is still running the
    // press is held briefly and fired the instant it clears.
    if (Phaser.Input.Keyboard.JustDown(this.keys.melee)) this.meleePressed();
    if (this.attackBuffer) {
      if (this.attackCooldownRemaining <= 0) {
        this.attack();
        this.attackBuffer = false;
      } else {
        this.attackBufferTimer -= dtMs;
        if (this.attackBufferTimer <= 0) this.attackBuffer = false;
      }
    }

    // Fire the active secondary (R / right-click). Slot 1 = ranged; slots 2-5 inert.
    if (Phaser.Input.Keyboard.JustDown(this.keys.fireSecondary)) this.fireSecondary();

    // dt is provided for frame-rate independence; Arcade Physics integrates
    // velocity * dt internally each step, so we drive movement via velocity.
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.left.isDown || k.leftArrow.isDown) dx -= 1;
    if (k.right.isDown || k.rightArrow.isDown) dx += 1;
    if (k.up.isDown || k.upArrow.isDown) dy -= 1;
    if (k.down.isDown || k.downArrow.isDown) dy += 1;

    // Touch joystick fills in any axis the keyboard isn't driving (keyboard
    // wins). touchVelocity is 0 on desktop, so this never affects mouse/keys.
    if (dx === 0 && this.touchVelocity.x !== 0) dx = this.touchVelocity.x;
    if (dy === 0 && this.touchVelocity.y !== 0) dy = this.touchVelocity.y;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      // Normalize so diagonals are not faster than cardinals.
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      this.lastMoveDir = { x: dx, y: dy };
      this.updateFacing(dx, dy);
      // Any movement breaks the idle pose immediately.
      this.idleTimer = 0;
      if (this.isIdling) this.stopIdle();
      this.playMove();
      this.updateFootsteps(dtMs);
    } else {
      this.stepTimer = 0;
      this.idleTimer += dtMs;
      if (this.idleTimer >= this.idleThreshold && !this.isIdling) {
        this.startIdle();
      }
      this.playIdle();
    }

    // Dash trigger (must be moving), with input buffering (Sprint 12). While
    // dashing, the dash velocity rides — normal movement is suspended until the
    // dash window ends.
    if (moving && Phaser.Input.Keyboard.JustDown(this.keys.dash)) {
      if (this.canDash()) this.dash();
      else if (this.dashEnabled) {
        this.dashBuffer = true;
        this.dashBufferTimer = DASH_BUFFER_MS;
      }
    }
    if (this.dashBuffer) {
      if (moving && this.canDash()) {
        this.dash();
        this.dashBuffer = false;
      } else {
        this.dashBufferTimer -= dtMs;
        if (this.dashBufferTimer <= 0 || !moving) this.dashBuffer = false;
      }
    }

    if (!this.isDashing) {
      if (moving) this.setVelocity(dx * this.speed, dy * this.speed);
      else this.setVelocity(0, 0);
    }

    this.checkZone();
  }

  updateFacing(dx, dy) {
    // Hold-to-strafe: keep the current facing/aim while moving (Shift held).
    if (this._strafing) return;
    // Hysteresis (Sprint mobile-control-feel): only flip the cardinal facing when one
    // axis dominates the other by FACING_FLIP_RATIO. Near a diagonal the analog stick
    // would otherwise oscillate facing frame-to-frame, restarting the walk anim (the
    // glitch). When neither axis clearly dominates, HOLD the current facing.
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > ay * FACING_FLIP_RATIO) {
      this.facing = dx < 0 ? 'left' : 'right';
    } else if (ay > ax * FACING_FLIP_RATIO) {
      this.facing = dy < 0 ? 'up' : 'down';
    }
    // else: ambiguous near-diagonal — keep the last facing (no flip, no anim restart).
  }

  // Snap `facing` to the nearest cardinal for an arbitrary aim angle (radians). Used by
  // mouse-led ranged fire, melee click-to-face, and the strafe tracking lock so the
  // sprite, the melee arc and the auto-target cone all orient to where the player aimed.
  faceTowardAngle(angle) {
    const a = Phaser.Math.Angle.Wrap(angle);
    const q = Math.PI / 4;
    if (a >= -q && a < q) this.facing = 'right';
    else if (a >= q && a < 3 * q) this.facing = 'down';
    else if (a >= -3 * q && a < -q) this.facing = 'up';
    else this.facing = 'left';
  }

  // The enemy a Shift-strafe locks onto: prefer the current reticle/auto target (so the
  // lock matches what's highlighted), else the nearest live enemy. Picked ONCE on the
  // rising edge of Shift — the hold never re-picks (see update()).
  acquireStrafeTarget() {
    const scene = this.scene;
    const ts = scene.targetingSystem;
    if (ts && ts.activeTarget && ts.activeTarget.active && !ts.activeTarget.isDead) {
      return ts.activeTarget;
    }
    let best = null;
    let bestD = Infinity;
    for (const e of scene.enemies || []) {
      if (!e || e.isDead || !e.active) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // Issue a directional anim only when it actually changed (Sprint mobile-control-feel).
  // anims.play(key, true) already no-ops a same-key replay, but tracking the last key
  // makes the "steady heading never restarts the cycle" guarantee explicit and keeps the
  // walk/idle transition in sync with the facing-flip hysteresis above.
  _playAnim(key) {
    if (!this.hasSheet || this._currentAnimKey === key || !this.anims.exists(key)) return;
    this.anims.play(key, true);
    this._currentAnimKey = key;
  }

  playMove() {
    this._playAnim(`walk_${this.facing}`);
  }

  playIdle() {
    this._playAnim(`idle_${this.facing}`);
  }

  // --- Idle animation (Sprint 9) --------------------------------------------
  // After idleThreshold ms of stillness, play a directional idle anim if the
  // sheet has one, else a subtle squash-bob tween on the placeholder.
  startIdle() {
    this.isIdling = true;
    if (this.hasSheet && this.anims.exists(`idle_${this.facing}`)) {
      this._playAnim(`idle_${this.facing}`);
      return;
    }
    this._idleTween = this.scene.tweens.add({
      targets: this,
      scaleY: SPRITE_SCALE * IDLE_BOB_SCALE_Y,
      duration: IDLE_BOB_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  stopIdle() {
    this.isIdling = false;
    this.idleTimer = 0;
    if (this._idleTween) {
      this._idleTween.stop();
      this._idleTween = null;
    }
    this.setScale(SPRITE_SCALE); // restore the 2x baseline, not 1x
  }

  // --- Footsteps (Sprint 9) -------------------------------------------------
  // Randomised pitch per step; cadence scales with effective speed so faster
  // boots tap out a quicker rhythm. Silent until sfx_step.* lands in /assets.
  updateFootsteps(dtMs) {
    this.stepTimer += dtMs;
    const baseSpeed = this.gameData.player.speed;
    const stepInterval = STEP_INTERVAL_BASE_MS * (baseSpeed / Math.max(1, this.speed));
    if (this.stepTimer < stepInterval) return;
    this.stepTimer = 0;
    // Footstep loudness is its own channel (Settings → Footsteps), independent of
    // the SFX slider so the constant walk tap can be dialled down on its own.
    // Effective = footstep × master, silenced when muted or the slider is at 0.
    const s = this.scene.audioSettings || {};
    const vol = s.muted ? 0 : (s.footstepVolume ?? STEP_VOLUME) * (s.masterVolume ?? 1);
    if (vol <= 0) return;
    // Alternate the two step samples with randomised pitch so a walk taps out a
    // left/right rhythm rather than one repeated click. Silent until the sfx land.
    const stepKey = this.stepCount % 2 === 0 ? 'sfx_step' : 'sfx_step_2';
    this.stepCount++;
    const key = this.scene.cache.audio.exists(stepKey) ? stepKey : 'sfx_step';
    if (this.scene.cache.audio.exists(key)) {
      const rate = 0.9 + Math.random() * 0.2;
      this.scene.sound.play(key, { volume: vol, rate });
    }
  }

  // --- Melee attack (Sprint 3) ----------------------------------------------

  // Single entry point for a melee press from any source (Q key, left-click, mobile
  // melee button). Swings now if off cooldown, else buffers the press (Sprint 12) so
  // a tap landing just before the cooldown clears still lands.
  meleePressed() {
    if (this.attackCooldownRemaining <= 0) {
      this.attack();
    } else {
      this.attackBuffer = true;
      this.attackBufferTimer = ATTACK_BUFFER_MS;
    }
  }

  attack() {
    if (this.attackCooldownRemaining > 0) return;
    this.attackCooldownRemaining = this.attackCooldown;
    // Commit to the swing (Sprint 14b): can't dash-cancel for a brief window, and
    // bump the tally slimes read to punish stationary spam.
    this._attackCommitRemaining = this.attackCommitMs;
    this.attackCount++;

    let damage = this.getAttackDamage();
    const crit = Math.random() < this.effectiveCrit;
    if (crit) damage *= CRIT_MULTIPLIER;

    // CombatSystem resolves the actual hits from this event — Player never
    // touches enemies directly. arcDegrees rides along so heavier weapons swing
    // a wider cone.
    EventBus.emit('player:attacked', {
      direction: this.facing,
      damage: Math.round(damage),
      position: { x: this.x, y: this.y },
      arcRadius: ATTACK_ARC_RADIUS,
      arcDegrees: this.attackArcDegrees,
      crit
    });

    this.showAttackArc();
  }

  // Effective melee damage = stat-scaled base + flat weapon bonus.
  getAttackDamage() {
    return this.effectiveAttack + this.weaponDamage;
  }

  // Brief semi-transparent swing wedge in the facing direction.
  showAttackArc() {
    const facingAngle = DIRECTION_ANGLES[this.facing] ?? 0;
    const half = Phaser.Math.DegToRad(this.attackArcDegrees / 2);
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, ATTACK_ARC_ALPHA);
    g.slice(this.x, this.y, ATTACK_ARC_RADIUS, facingAngle - half, facingAngle + half, false);
    g.fillPath();
    g.setDepth(11);
    this.scene.time.delayedCall(ATTACK_VISUAL_MS, () => g.destroy());
  }

  // --- Stats & gear (Sprint 4) ----------------------------------------------

  // Recompute derived combat values from base data + current stat bonuses.
  // Called after any stat/gear change so effects never drift.
  recalculateStats() {
    const base = this.gameData.player;
    this.effectiveAttack = base.attackDamage * (1 + this.statBonuses.attackMult);
    this.effectiveCrit = base.critChance + this.statBonuses.critChance;
    // devSpeedMult is the dev-menu "2X SPEED" cheat (runtime only, never saved).
    this.speed = Math.floor(
      base.speed * (1 + this.statBonuses.speedMult + this.bootsSpeedBonus) * (this.devSpeedMult || 1)
    );

    // Scale current HP proportionally when max HP changes (pumpkin hpMax tree).
    const effectiveMaxHP = Math.floor(base.maxHP * (1 + this.statBonuses.hpMax));
    const hpRatio = this.maxHP > 0 ? this.currentHP / this.maxHP : 1;
    this.maxHP = effectiveMaxHP;
    this.currentHP = Math.max(1, Math.floor(this.maxHP * hpRatio));

    EventBus.emit('player:statsChanged', { maxHP: this.maxHP, currentHP: this.currentHP });
  }

  // Coin-funded weapon (v2). weaponDamage is a flat bonus added on top of the
  // base/stat-scaled attack; arcDegrees widens the swing for heavier weapons.
  equipWeapon(tier) {
    this.equippedGear.weapon = tier.id;
    this.weaponDamage = tier.weaponDamage || 0;
    this.attackCooldown = tier.attackCooldown || this.gameData.player.attackCooldown;
    this.attackArcDegrees = tier.arcDegrees || ATTACK_ARC_DEGREES;
  }

  equipArmor(tier) {
    this.equippedGear.armor = tier.id;
    this.armorReduction = tier.damageReduction || 0;
  }

  equipBoots(tier) {
    this.equippedGear.boots = tier.id;
    this.bootsSpeedBonus = tier.speedBonus || 0;
    if (tier.dashEnabled) {
      this.dashEnabled = true;
      this.dashData = {
        dashSpeed: tier.dashSpeed,
        dashDuration: tier.dashDuration,
        dashCooldown: tier.dashCooldown
      };
      // Tell the mobile control layer to reveal its dash button (no-op on desktop).
      EventBus.emit('dash:enabled', {});
    }
    this.recalculateStats();
  }

  equipRanged(tier) {
    this.equippedGear.ranged = tier.id;
    this.rangedData = {
      projDamage: tier.projDamage,
      projRange: tier.projRange,
      projSpeed: tier.projSpeed
    };
    this.rangedAmmo = tier.ammo;
    this.rangedAmmoMax = tier.ammo;
    EventBus.emit('ranged:equipped', { ammo: this.rangedAmmo, max: this.rangedAmmoMax });
  }

  // --- Water charges (Sprint 9) ---------------------------------------------

  // Well-upgrade track raises how many waterings a single well visit grants.
  setWaterCapacity(capacity) {
    this.waterCapacity = capacity;
    if (this.waterCharges > this.waterCapacity) this.waterCharges = this.waterCapacity;
    EventBus.emit('player:waterChanged', {
      charges: this.waterCharges,
      capacity: this.waterCapacity
    });
  }

  // Top up to capacity at the well.
  fillWater() {
    this.waterCharges = this.waterCapacity;
    EventBus.emit('player:waterFilled', {
      charges: this.waterCharges,
      capacity: this.waterCapacity
    });
  }

  // Spend one charge to water a bed. Returns false when dry.
  useWater() {
    if (this.waterCharges <= 0) return false;
    this.waterCharges--;
    EventBus.emit('player:waterUsed', {
      charges: this.waterCharges,
      capacity: this.waterCapacity
    });
    return true;
  }

  // 0 = basic, 1 = copper, 2 = golden — scales watering acceleration odds.
  getWateringCanTier() {
    const id = this.equippedGear.wateringCan;
    if (id === 'golden_can') return 2;
    if (id === 'copper_can') return 1;
    return 0;
  }

  // Grow/shrink the inventory, preserving existing seeds.
  resizeSeedSlots(newLength) {
    const next = new Array(newLength).fill(null);
    for (let i = 0; i < Math.min(this.seedSlots.length, newLength); i++) {
      next[i] = this.seedSlots[i];
    }
    this.seedSlots = next;
    EventBus.emit('inventory:changed', { slots: [...this.seedSlots] });
  }

  // --- Secondary slots (Sprint control-scheme-combat-input) -----------------
  // Slot 1 = ranged (functional). Slots 2..SECONDARY_SLOT_COUNT are spell SELECTORS:
  // selecting one changes the active secondary but casts NOTHING (spell effects are a
  // later sprint). Switching slots is the intended tension mechanic.

  selectSecondary(slot) {
    if (!slot || slot < 1 || slot > SECONDARY_SLOT_COUNT) return;
    if (slot === this.activeSecondary) return;
    this.activeSecondary = slot;
    EventBus.emit('secondary:changed', { slot, total: SECONDARY_SLOT_COUNT });
    // TEST: toggle-then-fire vs auto-cast-on-select — once spell effects exist, flip
    // this handler to fire immediately on select. For now selection NEVER casts.
  }

  // Fire the active secondary (R / right-click / mobile Ranged-Magic). Slot 1 routes to
  // the existing ranged system; slots 2-5 are inert selectors, so firing them is a
  // deliberate no-op until the spell sprint wires real effects.
  fireSecondary() {
    if (this.activeSecondary === 1) {
      this.fireRanged();
      return;
    }
    // Inert spell slot — selected, nothing to cast yet. The spell sprint will check
    // canCast(cost)/spendMana(cost) here for the active slot's spell.
  }

  // --- Mana gating scaffold (Sprint control-scheme-combat-input; DORMANT) ----
  // Built and wired, exercised only once the spell sprint unlocks mana. Until then
  // unlockMana() is never called in normal play (a dev cheat reveals it for HUD
  // testing), so the bar stays hidden and these gates always read "locked".

  unlockMana(max = MANA_DEFAULT_MAX) {
    this.manaUnlocked = true;
    this.maxMana = max;
    this.currentMana = max;
    EventBus.emit('mana:unlocked', { mana: this.currentMana, max: this.maxMana });
  }

  canCast(cost) {
    return this.manaUnlocked && this.currentMana >= cost;
  }

  spendMana(cost) {
    if (!this.canCast(cost)) return false;
    this.currentMana = Math.max(0, this.currentMana - cost);
    EventBus.emit('mana:changed', { mana: this.currentMana, max: this.maxMana });
    return true;
  }

  // --- Ranged attack (Sprint 4) ---------------------------------------------

  // Single source of truth for "can the ranged shot fire right now" (Sprint combat-input-
  // mobile-consolidated). The fire path reads ONLY this, so the clip count and the
  // cooldown can never diverge into a cached cannot-fire state.
  canFireRanged() {
    return (
      this.equippedGear.ranged !== null &&
      this.rangedAmmo > 0 &&
      this.rangedCooldownRemaining <= 0
    );
  }

  fireRanged() {
    if (!this.canFireRanged()) return;

    this.rangedAmmo--;
    this.rangedCooldownRemaining = RANGED_COOLDOWN_MS;
    EventBus.emit('ranged:fired', { ammo: this.rangedAmmo, max: this.rangedAmmoMax });

    // Ranged-damage stat tree (Sprint 10, pineapple) scales projectile damage.
    const projDamage = Math.round(
      this.rangedData.projDamage * (1 + (this.statBonuses.rangedDamage || 0))
    );

    // GameScene owns the pooled projectiles and the enemy-overlap wiring.
    EventBus.emit('projectile:spawn', {
      x: this.x,
      y: this.y,
      facing: this.facing,
      damage: projDamage,
      range: this.rangedData.projRange,
      speed: this.rangedData.projSpeed
    });
  }

  restoreAmmo() {
    if (this.equippedGear.ranged === null) return;
    this.rangedAmmo = this.rangedAmmoMax;
    // Clear the cooldown too so firing re-enables the instant ammo is restored — the
    // fire gate (canFireRanged) also checks rangedCooldownRemaining, so a leftover
    // cooldown was the cached "cannot fire" state after a refill (Sprint combat-input-
    // mobile-consolidated).
    this.rangedCooldownRemaining = 0;
    EventBus.emit('ranged:fired', { ammo: this.rangedAmmo, max: this.rangedAmmoMax });
  }

  // --- Dash (Sprint 4) ------------------------------------------------------

  // Mid-swing commitment (Sprint 14b) — true during the brief window after an
  // attack when the player can't dash-cancel out of it.
  isAttackCommitted() {
    return this._attackCommitRemaining > 0;
  }

  canDash() {
    return (
      this.dashEnabled &&
      this.dashCooldownRemaining <= 0 &&
      !this.isDashing &&
      !this.isAttackCommitted()
    );
  }

  tryDash() {
    if (!this.canDash()) return;
    this.dash();
  }

  dash() {
    const d = this.dashData;
    const dir = this.lastMoveDir;
    // Dash stat tree (Sprint 10, cucumber → dashBonus): more distance, shorter
    // cooldown per level (both capped). Dash itself is still gated behind boots
    // gear; the stat only sweetens it once dash is unlocked.
    const bonus = this.statBonuses.dashBonus || 0;
    const distMult = 1 + Math.min(DASH_BONUS_DIST_CAP, bonus * 0.5);
    const cdMult = 1 - Math.min(DASH_BONUS_CD_CAP, bonus);
    this.setVelocity(dir.x * d.dashSpeed * distMult, dir.y * d.dashSpeed * distMult);
    this.isDashing = true;
    this.dashCooldownRemaining = d.dashCooldown * cdMult;
    EventBus.emit('player:dashed', {});

    this.scene.time.delayedCall(d.dashDuration, () => {
      this.isDashing = false; // normal movement resumes next frame
    });

    this.spawnDashTrail();
  }

  spawnDashTrail() {
    const texKey = this.texture.key;
    for (let i = 0; i < DASH_TRAIL_COUNT; i++) {
      this.scene.time.delayedCall(i * DASH_TRAIL_STAGGER_MS, () => {
        if (!this.active) return;
        const ghost = this.scene.add.image(this.x, this.y, texKey);
        if (this.hasSheet && this.anims.currentFrame) {
          ghost.setFrame(this.anims.currentFrame.index);
        }
        ghost.setScale(SPRITE_SCALE).setAlpha(0.35).setTint(DASH_TRAIL_TINT).setDepth(9);
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: DASH_TRAIL_FADE_MS,
          onComplete: () => ghost.destroy()
        });
      });
    }
  }

  // --- Zone tracking --------------------------------------------------------

  computeZone() {
    // Garden is now a centered rectangle, not the top band — check all four sides.
    const inGarden =
      this.x > GARDEN_LEFT &&
      this.x < GARDEN_RIGHT &&
      this.y > GARDEN_TOP &&
      this.y < GARDEN_BOTTOM;
    return inGarden ? 'garden' : 'forest';
  }

  checkZone() {
    const zone = this.computeZone();
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      // Debounced by construction: only fires when the zone actually changes.
      EventBus.emit('player:zoneChanged', { zone });
    }
  }

  // --- Health ---------------------------------------------------------------

  handleDamageRequest(data) {
    // Notifications (already carrying currentHP) are our own outbound echoes or
    // UI-facing payloads — ignore them so this stays a pure request handler and
    // never loops.
    if (data.currentHP !== undefined) return;
    if (this.isDead || this.invincible) return;

    const amount = data.amount || 0;
    if (amount <= 0) return;

    // Any hit stalls passive regen briefly (red_berry healthRegen tree).
    this._regenPauseRemaining = REGEN_PAUSE_MS;

    // Incoming damage is reduced by gear armor (Sprint 4) and the defense stat
    // tree (Sprint 10, sunflower → damageReduction, capped). The two stack
    // multiplicatively so combined reduction can approach but never reach 100%;
    // at least 1 damage always lands.
    const statDR = Math.min(DAMAGE_REDUCTION_CAP, this.statBonuses.damageReduction || 0);
    const totalReduction = 1 - (1 - this.armorReduction) * (1 - statDR);
    const reduced = totalReduction > 0
      ? Math.max(1, Math.floor(amount * (1 - totalReduction)))
      : amount;

    this.currentHP = Math.max(0, this.currentHP - reduced);
    EventBus.emit('player:damaged', {
      amount: reduced,
      currentHP: this.currentHP,
      maxHP: this.maxHP
    });

    if (this.currentHP <= 0) {
      this.die();
      return;
    }
    this.startInvincibility();
  }

  // Passive regen tick (Sprint 10). Accumulates fractional HP at the current
  // healthRegen rate (HP/sec) and heals in whole-HP steps; stalls while
  // _regenPauseRemaining is counting down after a recent hit.
  tickRegen(dtMs) {
    if (this._regenPauseRemaining > 0) {
      this._regenPauseRemaining = Math.max(0, this._regenPauseRemaining - dtMs);
      return;
    }
    const rate = this.statBonuses.healthRegen || 0; // HP per second
    if (rate <= 0 || this.isDead || this.currentHP >= this.maxHP) {
      this._regenAccum = 0;
      return;
    }
    this._regenAccum += rate * (dtMs / 1000);
    if (this._regenAccum >= 1) {
      const whole = Math.floor(this._regenAccum);
      this._regenAccum -= whole;
      this.heal(whole);
    }
  }

  heal(amount) {
    if (this.isDead || amount <= 0) return;
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
    EventBus.emit('player:healed', {
      amount,
      currentHP: this.currentHP,
      maxHP: this.maxHP
    });
  }

  healToFull() {
    const amount = this.maxHP - this.currentHP;
    this.currentHP = this.maxHP;
    EventBus.emit('player:healed', {
      amount,
      currentHP: this.currentHP,
      maxHP: this.maxHP
    });
  }

  // --- Inventory (Sprint 2) -------------------------------------------------

  hasEmptySlot() {
    return this.seedSlots.includes(null);
  }

  isFull() {
    return !this.hasEmptySlot();
  }

  addSeed(plantType) {
    const emptyIndex = this.seedSlots.indexOf(null);
    if (emptyIndex === -1) return false; // full
    this.seedSlots[emptyIndex] = plantType;
    EventBus.emit('inventory:changed', { slots: [...this.seedSlots] });
    return true;
  }

  dropSeed(slotIndex) {
    const plantType = this.seedSlots[slotIndex];
    if (!plantType) return null;
    this.seedSlots[slotIndex] = null;
    // Create a world Seed object at the player's feet (self-registers with the
    // scene so it can be re-collected). Returned so callers (e.g. the swap
    // picker) can reference it.
    const seed = new Seed(this.scene, this.x, this.y, plantType, this.scene.gameData);
    EventBus.emit('inventory:changed', { slots: [...this.seedSlots] });
    return seed;
  }

  // Remove a seed from inventory without spawning a world object (used when
  // planting it into a garden bed). Returns the plant type removed.
  removeSeedAt(slotIndex) {
    const plantType = this.seedSlots[slotIndex];
    if (!plantType) return null;
    this.seedSlots[slotIndex] = null;
    EventBus.emit('inventory:changed', { slots: [...this.seedSlots] });
    return plantType;
  }

  getOldestSeed() {
    return this.seedSlots.findIndex((s) => s !== null); // first filled slot (FIFO)
  }

  startInvincibility() {
    this.invincible = true;
    this._flashOn = false;
    this._flashEvent = this.scene.time.addEvent({
      delay: FLASH_INTERVAL_MS,
      repeat: Math.floor(INVINCIBILITY_MS / FLASH_INTERVAL_MS) - 1,
      callback: () => {
        this._flashOn = !this._flashOn;
        if (this._flashOn) this.setTint(0xffffff);
        else this.clearTint();
      }
    });
    this._invEndEvent = this.scene.time.delayedCall(INVINCIBILITY_MS, () => {
      this.invincible = false;
      this.clearTint();
    });
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.invincible = true;
    this.stopIdle();
    this.idleTimer = 0;
    this.setVelocity(0, 0);
    this.clearTint();
    this.setTint(0x666666);
    EventBus.emit('player:died', {});
  }

  // Brought back to life by GameScene after the death/respawn sequence. Clears
  // every death/invincibility artefact and refills HP. (Sprint 3 — death is no
  // longer game-over; the player respawns at the garden centre.)
  respawn(x, y) {
    this.isDead = false;
    this.invincible = false;
    if (this._flashEvent) {
      this._flashEvent.remove(false);
      this._flashEvent = null;
    }
    if (this._invEndEvent) {
      this._invEndEvent.remove(false);
      this._invEndEvent = null;
    }
    this.clearTint();
    this.stopIdle();
    this.idleTimer = 0;
    this.stepTimer = 0;
    this.setPosition(x, y);
    this.currentHP = this.maxHP;
    this.attackCooldownRemaining = 0;
    this._attackCommitRemaining = 0;
    this.isDashing = false;
    this.dashCooldownRemaining = 0;
    this.rangedCooldownRemaining = 0;
    this.body.enable = true;
    this.setVelocity(0, 0);

    EventBus.emit('player:healed', {
      amount: this.maxHP,
      currentHP: this.maxHP,
      maxHP: this.maxHP
    });

    // Recompute and broadcast the zone from the respawn point (garden = safe).
    this.currentZone = this.computeZone();
    EventBus.emit('player:zoneChanged', { zone: this.currentZone });
  }

  cleanup() {
    EventBus.off('player:damaged', this._onDamageRequest);
    EventBus.off('touch:move', this._onTouchMove);
    EventBus.off('touch:attack', this._onTouchAttack);
    EventBus.off('touch:dash', this._onTouchDash);
    EventBus.off('touch:ranged', this._onTouchRanged);
    EventBus.off('secondary:select', this._onSecondarySelect);
    if (this._flashEvent) this._flashEvent.remove(false);
    if (this._invEndEvent) this._invEndEvent.remove(false);
  }
}
