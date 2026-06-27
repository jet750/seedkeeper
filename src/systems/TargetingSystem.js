// TargetingSystem.js
//
// Auto-target / aim-assist (Sprint control-scheme-combat-input). It picks an
// "active target" among the live enemies each frame and drives a steady pulsing
// reticle on it; GameScene.firePooledProjectile reads the locked target so ranged
// shots aim at it (any angle) with slight homing — the fix for the old cardinal-only
// "needs near-perfect axis alignment" aiming.
//
// Two strengths, per the design:
//   * Mobile  — STRONG / full-auto, forced ON. Nearest enemy inside a facing-weighted
//               cone is acquired automatically.
//   * Desktop — WEAK / mouse-led, OFF by default (toggle T → scene.autoTargetDesktop).
//               When on, the target is the in-cone enemy nearest the cursor.
//
// It owns no enemy/Player internals beyond reading x/y/isDead off scene.enemies, and
// communicates nothing over EventBus — it's a polled helper read by GameScene.

import Phaser from 'phaser';
import { AUTO_TARGET_CONE_DEG } from '../core/Constants.js';

// Furthest an enemy can be and still be acquired (px). Keeps the reticle on near
// threats, not something across the map. // TUNE
const ACQUIRE_RANGE = 380;
const RETICLE_COLOR = 0xff5a3c; // red-orange brackets on the current target
const RETICLE_RADIUS = 15; // base ring radius (source px)
// Steady pulse (NOT a flash) — accessibility requirement. Smooth sine scale/alpha.
const RETICLE_PULSE_MS = 620;

const FACING_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

export default class TargetingSystem {
  constructor(scene) {
    this.scene = scene;
    this.activeTarget = null;
    // Manual hard lock (Sprint combat-input-mobile-consolidated): clicking an enemy
    // pins it as THE target — tracked (reticle + ranged homing) until it dies or the
    // player clicks elsewhere — and overrides the weak/auto pick. Works whether or not
    // the auto-target assist is on.
    this.hardTarget = null;
    this._mobile = !!scene._mobile;

    // Pulsing reticle ring — depth 31 sits above enemy level markers (30) and the
    // player (10) but below HUD/labels. Hidden until a target is acquired.
    this.reticle = scene.add.graphics().setDepth(31).setVisible(false);
    this.reticle.lineStyle(2, RETICLE_COLOR, 1);
    this.reticle.strokeCircle(0, 0, RETICLE_RADIUS);
    // Four corner ticks so it reads as a target bracket, not just a circle.
    const t = RETICLE_RADIUS + 5;
    [[-t, 0], [t, 0], [0, -t], [0, t]].forEach(([dx, dy]) => {
      this.reticle.lineBetween(dx * 0.6, dy * 0.6, dx, dy);
    });
    this._pulse = scene.tweens.add({
      targets: this.reticle,
      scale: { from: 0.86, to: 1.16 },
      alpha: { from: 0.55, to: 1 },
      duration: RETICLE_PULSE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);
  }

  // Desktop toggle entry — clears the current target immediately when switched off so
  // the reticle doesn't linger. (update() re-reads scene.autoTargetDesktop anyway.)
  setEnabled() {
    if (!this.isActive()) {
      this.activeTarget = null;
      this.reticle.setVisible(false);
    }
  }

  // Is the assist live this frame? Mobile is forced on; desktop follows the pref.
  isActive() {
    return this._mobile ? true : !!this.scene.autoTargetDesktop;
  }

  // Manual click-to-lock (desktop). Pins a specific enemy; passing null/dead clears it.
  setHardTarget(enemy) {
    this.hardTarget = enemy && enemy.active && !enemy.isDead ? enemy : null;
  }

  clearHardTarget() {
    this.hardTarget = null;
  }

  update() {
    // A live hard lock takes precedence and drives the reticle even with the auto-target
    // assist OFF — clicking an enemy must track it regardless of the toggle.
    if (this.hardTarget && (!this.hardTarget.active || this.hardTarget.isDead)) {
      this.hardTarget = null; // it died / despawned — release the lock
    }
    if (this.hardTarget) {
      this.activeTarget = this.hardTarget;
      this.reticle.setPosition(this.activeTarget.x, this.activeTarget.y).setVisible(true);
      return;
    }
    if (!this.isActive()) {
      this.activeTarget = null;
      this.reticle.setVisible(false);
      return;
    }
    this.activeTarget = this.pickTarget();
    if (this.activeTarget) {
      this.reticle.setPosition(this.activeTarget.x, this.activeTarget.y).setVisible(true);
    } else {
      this.reticle.setVisible(false);
    }
  }

  // The target for THIS shot — re-validated so a dead/despawned enemy never carries a
  // homing projectile. GameScene calls this at fire time (per-shot lock). The hard lock
  // wins; else the auto/weak pick (activeTarget) when the assist is on.
  lockTarget() {
    const t = (this.hardTarget && this.hardTarget.active && !this.hardTarget.isDead)
      ? this.hardTarget
      : this.activeTarget;
    if (!t || !t.active || t.isDead) return null;
    return t;
  }

  // Choose the active target. Both modes require the enemy inside the facing cone +
  // acquire range; mobile picks the cone-best (distance + angular bias), desktop picks
  // the in-cone enemy nearest the cursor (mouse-led).
  pickTarget() {
    const scene = this.scene;
    const player = scene.player;
    if (!player || player.isDead || !scene.enemies || scene.enemies.length === 0) return null;

    const facing = FACING_ANGLE[player.facing] ?? 0;
    const halfCone = Phaser.Math.DegToRad(AUTO_TARGET_CONE_DEG / 2);

    // Mouse-led aim point (desktop). activePointer.worldX/Y are resolved against the
    // main world camera, so they're already in world space.
    const ptr = scene.input ? scene.input.activePointer : null;
    const aimX = ptr ? ptr.worldX : player.x;
    const aimY = ptr ? ptr.worldY : player.y;

    let best = null;
    let bestScore = Infinity;
    for (const e of scene.enemies) {
      if (!e || e.isDead || !e.active) continue;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, e.x, e.y);
      if (dist > ACQUIRE_RANGE) continue;
      const ang = Phaser.Math.Angle.Between(player.x, player.y, e.x, e.y);
      const dev = Math.abs(Phaser.Math.Angle.Wrap(ang - facing));
      if (dev > halfCone) continue; // outside the facing cone

      let score;
      if (this._mobile) {
        // Strong/full-auto: nearest in cone, lightly biased toward dead-ahead.
        score = dist * (1 + dev * 0.5);
      } else {
        // Weak/mouse-led: the in-cone enemy closest to the cursor.
        score = Phaser.Math.Distance.Between(aimX, aimY, e.x, e.y);
      }
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  cleanup() {
    if (this._pulse) {
      this._pulse.stop();
      this._pulse = null;
    }
    if (this.reticle) {
      this.reticle.destroy();
      this.reticle = null;
    }
    this.activeTarget = null;
  }
}
