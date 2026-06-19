// Player.js
//
// The Seedkeeper. Arcade-physics sprite with 4-directional WASD/arrow movement,
// zone awareness, an HP pool with 1s post-hit invincibility, and EventBus-only
// communication with the rest of the game (no direct cross-module calls).

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { GARDEN_ZONE_HEIGHT } from '../core/Constants.js';
import Seed from './Seed.js';

const FLASH_INTERVAL_MS = 100;
const INVINCIBILITY_MS = 1000;

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

    // --- Stats (from data, never hardcoded) ---
    const stats = gameData.player;
    this.maxHP = stats.maxHP;
    this.speed = stats.speed;
    this.currentHP = this.maxHP;

    // --- Combat (Sprint 3) ---
    this.attackDamage = stats.attackDamage;
    this.attackCooldown = stats.attackCooldown; // ms between swings
    this.attackCooldownRemaining = 0;
    this.equippedWeapon = null; // bare hands; weapon slot wired up in Sprint 4
    this.statBonuses = { attackMult: 0 }; // stays 0 until Sprint 4 upgrades

    // --- Inventory (Sprint 2) ---
    this.gameData = gameData;
    this.seedSlots = new Array(stats.seedSlots).fill(null); // e.g. ['red_mushroom', null, null]
    this.hasWater = false;

    // --- State ---
    this.facing = 'down';
    this.isDead = false;
    this.invincible = false;
    this._flashEvent = null;
    this._invEndEvent = null;
    this._flashOn = false;

    // --- Physics body: circular collider centred in the sprite ---
    this.setCollideWorldBounds(true);
    const radius = this.width * 0.32;
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
      attack: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    // --- Damage requests arrive via EventBus (slimes never call us directly) ---
    this._onDamageRequest = (data) => this.handleDamageRequest(data);
    EventBus.on('player:damaged', this._onDamageRequest);

    // Clean up listeners when the scene tears down.
    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);

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

    // Tick the melee cooldown down (dt is seconds; cooldown is tracked in ms).
    if (this.attackCooldownRemaining > 0) {
      this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - dt * 1000);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.attack)) {
      this.attack();
    }

    // dt is provided for frame-rate independence; Arcade Physics integrates
    // velocity * dt internally each step, so we drive movement via velocity.
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.left.isDown || k.leftArrow.isDown) dx -= 1;
    if (k.right.isDown || k.rightArrow.isDown) dx += 1;
    if (k.up.isDown || k.upArrow.isDown) dy -= 1;
    if (k.down.isDown || k.downArrow.isDown) dy += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      // Normalize so diagonals are not faster than cardinals.
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      this.setVelocity(dx * this.speed, dy * this.speed);
      this.updateFacing(dx, dy);
      this.playMove();
    } else {
      this.setVelocity(0, 0);
      this.playIdle();
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

  // --- Melee attack (Sprint 3) ----------------------------------------------

  attack() {
    if (this.attackCooldownRemaining > 0) return;
    this.attackCooldownRemaining = this.attackCooldown;

    // CombatSystem resolves the actual hits from this event — Player never
    // touches enemies directly.
    EventBus.emit('player:attacked', {
      direction: this.facing,
      damage: this.getAttackDamage(),
      position: { x: this.x, y: this.y },
      arcRadius: ATTACK_ARC_RADIUS
    });

    this.showAttackArc();
  }

  getAttackDamage() {
    return this.attackDamage * (1 + this.statBonuses.attackMult);
  }

  // Brief semi-transparent swing wedge in the facing direction.
  showAttackArc() {
    const facingAngle = DIRECTION_ANGLES[this.facing] ?? 0;
    const half = Phaser.Math.DegToRad(ATTACK_ARC_DEGREES / 2);
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, ATTACK_ARC_ALPHA);
    g.slice(this.x, this.y, ATTACK_ARC_RADIUS, facingAngle - half, facingAngle + half, false);
    g.fillPath();
    g.setDepth(11);
    this.scene.time.delayedCall(ATTACK_VISUAL_MS, () => g.destroy());
  }

  // --- Zone tracking --------------------------------------------------------

  computeZone() {
    return this.y < GARDEN_ZONE_HEIGHT ? 'garden' : 'forest';
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

    this.currentHP = Math.max(0, this.currentHP - amount);
    EventBus.emit('player:damaged', {
      amount,
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
    if (!plantType) return;
    this.seedSlots[slotIndex] = null;
    // Create a world Seed object at the player's feet (self-registers with the
    // scene so it can be re-collected).
    new Seed(this.scene, this.x, this.y, plantType, this.scene.gameData);
    EventBus.emit('inventory:changed', { slots: [...this.seedSlots] });
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
    this.setPosition(x, y);
    this.currentHP = this.maxHP;
    this.attackCooldownRemaining = 0;
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
    if (this._flashEvent) this._flashEvent.remove(false);
    if (this._invEndEvent) this._invEndEvent.remove(false);
  }
}
