// Player.js
//
// The Seedkeeper. Arcade-physics sprite with 4-directional WASD/arrow movement,
// zone awareness, an HP pool with 1s post-hit invincibility, and EventBus-only
// communication with the rest of the game (no direct cross-module calls).

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { GARDEN_LEFT, GARDEN_RIGHT, GARDEN_TOP, GARDEN_BOTTOM } from '../core/Constants.js';
import Seed from './Seed.js';

const FLASH_INTERVAL_MS = 100;
const INVINCIBILITY_MS = 1000;

// --- Game feel (Sprint 9) ---
const IDLE_THRESHOLD_MS = 3000; // stand still this long → idle animation
const IDLE_BOB_SCALE_Y = 0.92; // gentle squash when no idle frames exist
const IDLE_BOB_MS = 600;
const STEP_INTERVAL_BASE_MS = 320; // footstep cadence at base speed
const STEP_VOLUME = 0.3;

// Drawn at 2x so the Seedkeeper reads clearly at the current camera zoom.
// Visual scale only — the physics body is configured independently below. The
// idle squash + stopIdle reset use this as their baseline so the 2x holds.
const SPRITE_SCALE = 2;
// Fixed collider radius (source px). Pinned to a constant so the 2x sprite scale
// doesn't inflate the hitbox: Phaser's effective collision radius is halfWidth
// (= BODY_RADIUS * scaleX), so this lands ~16px in-world — close to the original
// pre-zoom collider on the 48px frame.
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

    // Input buffers (Sprint 12) — set when a press lands during cooldown, drained
    // the instant the matching cooldown clears.
    this.attackBuffer = false;
    this.attackBufferTimer = 0;
    this.dashBuffer = false;
    this.dashBufferTimer = 0;

    // --- Upgrades & gear (Sprint 4) ---
    // Stat multipliers/bonuses recomputed from scratch on each upgrade (no drift).
    this.statBonuses = {
      attackMult: 0,
      hpMult: 0,
      speedMult: 0,
      timerBonus: 0,
      critBonus: 0,
      harvestRange: 0
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
    this.seedSlots = new Array(stats.seedSlots).fill(null); // e.g. ['red_mushroom', null, null]

    // --- Water charges (Sprint 9 well-upgrade) ---
    // Replaces the old binary hasWater. A well visit fills `waterCharges` up to
    // `waterCapacity`; each bed watering spends one. Capacity is raised by the
    // well-upgrade track (see GameScene.applyWellUpgrade).
    this.waterCapacity = 1;
    this.waterCharges = 0;

    // --- Idle + footsteps (Sprint 9 game feel) ---
    this.idleTimer = 0;
    this.isIdling = false;
    this.idleThreshold = IDLE_THRESHOLD_MS;
    this._idleTween = null;
    this.stepTimer = 0;
    this.stepCount = 0; // alternates the two footstep samples

    // --- State ---
    this.facing = 'down';
    this.isDead = false;
    this.invincible = false;
    this._flashEvent = null;
    this._invEndEvent = null;
    this._flashOn = false;

    // --- Physics body: fixed-radius circular collider, centred in the sprite ---
    // Re-asserted to BODY_RADIUS (not width*ratio) so the 2x sprite scale doesn't
    // double the hitbox. updateBounds() leaves `radius` alone, so the offset below
    // (width/2 - radius) keeps the circle centred on the 48px frame at any scale.
    this.setCollideWorldBounds(true);
    const radius = BODY_RADIUS;
    this.body.setCircle(
      radius,
      this.width / 2 - radius,
      this.height / 2 - radius
    );
    this.setDepth(10);

    if (hasSheet) {
      this.createAnimations();
    }

    // --- Input ---
    this.keys = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upArrow: Phaser.Input.Keyboard.KeyCodes.UP,
      downArrow: Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      attack: Phaser.Input.Keyboard.KeyCodes.SPACE,
      ranged: Phaser.Input.Keyboard.KeyCodes.R,
      dash: Phaser.Input.Keyboard.KeyCodes.SHIFT
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
    this._onTouchAttack = () => {
      if (this.attackCooldownRemaining <= 0) {
        this.attack();
      } else {
        // Buffer exactly like the keyboard press so a tap never feels eaten.
        this.attackBuffer = true;
        this.attackBufferTimer = ATTACK_BUFFER_MS;
      }
    };
    this._onTouchDash = () => this.tryDash();
    this._onTouchRanged = () => this.fireRanged();
    EventBus.on('touch:move', this._onTouchMove);
    EventBus.on('touch:attack', this._onTouchAttack);
    EventBus.on('touch:dash', this._onTouchDash);
    EventBus.on('touch:ranged', this._onTouchRanged);

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
    // Sprout Lands 48x48 4-dir sheet assumed layout: rows of walk frames.
    // Adjust frame ranges when the real sheet is finalised.
    const defs = [
      ['idle_down', 0, 0],
      ['idle_up', 1, 1],
      ['idle_left', 2, 2],
      ['idle_right', 3, 3],
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
        frameRate: start === end ? 1 : 8,
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
    if (this.rangedCooldownRemaining > 0) {
      this.rangedCooldownRemaining = Math.max(0, this.rangedCooldownRemaining - dtMs);
    }
    if (this.dashCooldownRemaining > 0) {
      this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - dtMs);
    }

    // Attack with input buffering (Sprint 12): if the cooldown is still running
    // the press is held briefly and fired the instant it clears.
    if (Phaser.Input.Keyboard.JustDown(this.keys.attack)) {
      if (this.attackCooldownRemaining <= 0) {
        this.attack();
      } else {
        this.attackBuffer = true;
        this.attackBufferTimer = ATTACK_BUFFER_MS;
      }
    }
    if (this.attackBuffer) {
      if (this.attackCooldownRemaining <= 0) {
        this.attack();
        this.attackBuffer = false;
      } else {
        this.attackBufferTimer -= dtMs;
        if (this.attackBufferTimer <= 0) this.attackBuffer = false;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ranged)) this.fireRanged();

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
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx < 0 ? 'left' : 'right';
    } else {
      this.facing = dy < 0 ? 'up' : 'down';
    }
  }

  playMove() {
    if (this.hasSheet) this.anims.play(`walk_${this.facing}`, true);
  }

  playIdle() {
    if (this.hasSheet) this.anims.play(`idle_${this.facing}`, true);
  }

  // --- Idle animation (Sprint 9) --------------------------------------------
  // After idleThreshold ms of stillness, play a directional idle anim if the
  // sheet has one, else a subtle squash-bob tween on the placeholder.
  startIdle() {
    this.isIdling = true;
    if (this.hasSheet && this.anims.exists(`idle_${this.facing}`)) {
      this.anims.play(`idle_${this.facing}`, true);
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

  attack() {
    if (this.attackCooldownRemaining > 0) return;
    this.attackCooldownRemaining = this.attackCooldown;

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
    this.effectiveCrit = base.critChance + this.statBonuses.critBonus;
    this.speed = Math.floor(base.speed * (1 + this.statBonuses.speedMult + this.bootsSpeedBonus));

    // Scale current HP proportionally when max HP changes.
    const effectiveMaxHP = Math.floor(base.maxHP * (1 + this.statBonuses.hpMult));
    const hpRatio = this.maxHP > 0 ? this.currentHP / this.maxHP : 1;
    this.maxHP = effectiveMaxHP;
    this.currentHP = Math.max(1, Math.floor(this.maxHP * hpRatio));

    EventBus.emit('player:statsChanged', { maxHP: this.maxHP, currentHP: this.currentHP });
  }

  equipWeapon(tier) {
    this.equippedGear.weapon = tier.id;
    this.weaponDamage = tier.attackDamage || 0;
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

  equipSatchel(tier) {
    this.resizeSeedSlots(tier.seedSlots);
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

  equipWateringCan(tier) {
    this.equippedGear.wateringCan = tier.id;
    this.wateringCan = { bedsPerUse: tier.bedsPerUse || 1 };
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

  // --- Ranged attack (Sprint 4) ---------------------------------------------

  fireRanged() {
    if (this.equippedGear.ranged === null) return;
    if (this.rangedAmmo <= 0 || this.rangedCooldownRemaining > 0) return;

    this.rangedAmmo--;
    this.rangedCooldownRemaining = RANGED_COOLDOWN_MS;
    EventBus.emit('ranged:fired', { ammo: this.rangedAmmo, max: this.rangedAmmoMax });

    // GameScene owns the pooled projectiles and the enemy-overlap wiring.
    EventBus.emit('projectile:spawn', {
      x: this.x,
      y: this.y,
      facing: this.facing,
      damage: this.rangedData.projDamage,
      range: this.rangedData.projRange,
      speed: this.rangedData.projSpeed
    });
  }

  restoreAmmo() {
    if (this.equippedGear.ranged === null) return;
    this.rangedAmmo = this.rangedAmmoMax;
    EventBus.emit('ranged:fired', { ammo: this.rangedAmmo, max: this.rangedAmmoMax });
  }

  // --- Dash (Sprint 4) ------------------------------------------------------

  canDash() {
    return this.dashEnabled && this.dashCooldownRemaining <= 0 && !this.isDashing;
  }

  tryDash() {
    if (!this.canDash()) return;
    this.dash();
  }

  dash() {
    const d = this.dashData;
    const dir = this.lastMoveDir;
    this.setVelocity(dir.x * d.dashSpeed, dir.y * d.dashSpeed);
    this.isDashing = true;
    this.dashCooldownRemaining = d.dashCooldown;
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

    // Armor reduces incoming damage (Sprint 4); at least 1 always lands.
    const reduced = this.armorReduction > 0
      ? Math.max(1, Math.floor(amount * (1 - this.armorReduction)))
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
    if (this._flashEvent) this._flashEvent.remove(false);
    if (this._invEndEvent) this._invEndEvent.remove(false);
  }
}
