// CombatSystem.js
//
// Centralised hit detection for player melee attacks (Sprint 3). Listens for
// 'player:attacked' on the EventBus and resolves which enemies fall inside the
// swing's range + facing arc, then asks each one to take damage. It never
// touches Player or enemy internals beyond the public takeDamage() contract —
// all wiring is via EventBus and GameScene's `enemies` array.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';

const ARC_DEGREES = 90; // width of the swing cone, centred on facing direction
const HITBOX_LIFETIME_MS = 150; // visual/logical lifetime of one swing
const COMBO_RESET_TIME = 2000; // ms gap between hits before the combo lapses (Sprint 13)
const COMBO_MIN_SHOW = 3; // surface the combo to the HUD from this count up

// Hit stop (Sprint 9): freeze physics + tweens for a few frames the instant a
// melee blow connects. Heavier weapons land with more weight. Ranged hits
// resolve outside CombatSystem, so they never trigger this.
const HIT_STOP_BARE = 60; // bare hands
const HIT_STOP_BY_WEAPON = { dagger: 75, sword: 90 };

export default class CombatSystem {
  constructor(scene) {
    this.scene = scene;
    // Declared for Sprint 4 multi-frame hitboxes; the player swing currently
    // resolves instantly on emit, so nothing persists between frames yet.
    this.activeHitboxes = [];
    this._hitStopActive = false;

    // Combo state (Sprint 13) — counts rapid successive landed swings.
    this.comboCount = 0;
    this.comboTimer = 0;

    this._handlers = [];
    this.on('player:attacked', (data) => this.handlePlayerAttack(data));
    // Taking a hit breaks the combo.
    this.on('player:damaged', (d) => {
      if (d && d.currentHP !== undefined) this.resetCombo();
    });

    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);
  }

  on(event, handler) {
    EventBus.on(event, handler);
    this._handlers.push([event, handler]);
  }

  handlePlayerAttack({ direction, damage, position, arcRadius, arcDegrees }) {
    const hitbox = {
      x: position.x,
      y: position.y,
      radius: arcRadius,
      damage,
      direction,
      // Weapons widen the swing cone (sword = 120°); default to the base arc.
      arcDegrees: arcDegrees ?? ARC_DEGREES,
      expireTime: Date.now() + HITBOX_LIFETIME_MS,
      sourceType: 'player'
    };
    this.checkEnemyHits(hitbox);
  }

  checkEnemyHits(hitbox) {
    let landed = false;
    let hitSkeleton = false;
    this.scene.enemies.forEach((enemy) => {
      if (enemy.isDead) return;
      const dist = Phaser.Math.Distance.Between(hitbox.x, hitbox.y, enemy.x, enemy.y);
      if (dist <= hitbox.radius && this.isInArc(hitbox, enemy)) {
        enemy.takeDamage(hitbox.damage, { x: hitbox.x, y: hitbox.y });
        landed = true;
        if (enemy.enemyType === 'skeleton') hitSkeleton = true;
      }
    });
    if (landed && hitbox.damage > 0) {
      // One hit stop + one screenshake per swing (not per enemy). The weapon and
      // whether a skeleton was struck pick the GameScene shake profile.
      this.triggerHitStop(this.hitStopDuration());
      const weapon = this.scene.player ? this.scene.player.equippedGear.weapon : null;
      EventBus.emit('combat:meleeLanded', { weapon, hitSkeleton });
      this.onHitLanded();
    }
  }

  // --- Combo counter (Sprint 13) --------------------------------------------

  onHitLanded() {
    this.comboCount++;
    this.comboTimer = COMBO_RESET_TIME;
    if (this.comboCount >= COMBO_MIN_SHOW) {
      EventBus.emit('combat:combo', { count: this.comboCount });
    }
  }

  resetCombo() {
    if (this.comboCount === 0) return;
    this.comboCount = 0;
    this.comboTimer = 0;
    EventBus.emit('combat:comboEnd', {});
  }

  // Ticked by GameScene each frame so the combo lapses after a quiet gap.
  update(delta) {
    if (this.comboCount > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) this.resetCombo();
    }
  }

  // Duration scales with the equipped melee weapon tier.
  hitStopDuration() {
    const weapon = this.scene.player && this.scene.player.equippedGear.weapon;
    return HIT_STOP_BY_WEAPON[weapon] ?? HIT_STOP_BARE;
  }

  // Freeze the world for a handful of frames so the blow reads as impactful.
  // Guarded so multi-enemy swings (or rapid follow-ups) never stack pauses and
  // resume the world early. scene.time keeps ticking, so the delayedCall fires.
  triggerHitStop(duration = HIT_STOP_BARE) {
    if (this._hitStopActive) return;
    this._hitStopActive = true;
    this.scene.physics.pause();
    this.scene.tweens.pauseAll();
    this.scene.time.delayedCall(duration, () => {
      this.scene.physics.resume();
      this.scene.tweens.resumeAll();
      this._hitStopActive = false;
    });
  }

  isInArc(hitbox, target) {
    const angle = Phaser.Math.Angle.Between(hitbox.x, hitbox.y, target.x, target.y);
    const facingAngle = this.directionToAngle(hitbox.direction);
    const halfArc = Phaser.Math.DegToRad(hitbox.arcDegrees / 2);
    const diff = Math.abs(Phaser.Math.Angle.Wrap(angle - facingAngle));
    return diff <= halfArc;
  }

  directionToAngle(direction) {
    const map = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    return map[direction] ?? 0;
  }

  cleanup() {
    this._handlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._handlers = [];
    this.activeHitboxes = [];
  }
}
