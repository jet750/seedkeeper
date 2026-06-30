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
import {
  AUTO_TARGET_CONE_DEG,
  TARGETING_ACQUIRE_RANGE,
  TARGETING_OFFSCREEN_MARGIN,
  TARGETING_OFFSCREEN_PENALTY,
  TARGETING_AGGRO_BIAS,
  TARGETING_FACING_BIAS,
  TARGETING_CLUSTER_RADIUS,
  THORNFIELD_AHEAD_DIST
} from '../core/Constants.js';

// Furthest an enemy can be and still be acquired (px). Keeps the reticle on near
// threats, not something across the map. // TUNE → Constants.TARGETING_ACQUIRE_RANGE
const ACQUIRE_RANGE = TARGETING_ACQUIRE_RANGE;
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

  // Choose the active target. Mobile uses the THREAT-weighted policy (nearestThreat);
  // desktop keeps the cone + mouse-led pick (unchanged this sprint).
  pickTarget() {
    return this._mobile ? this.nearestThreat() : this._pickDesktopTarget();
  }

  // Desktop weak/mouse-led pick (Sprint control-scheme-combat-input — UNCHANGED). The
  // in-cone enemy nearest the cursor, within acquire range. Only runs with the desktop
  // auto-target preference ON.
  _pickDesktopTarget() {
    const scene = this.scene;
    const player = scene.player;
    if (!player || player.isDead || !scene.enemies || scene.enemies.length === 0) return null;

    const facing = FACING_ANGLE[player.facing] ?? 0;
    const halfCone = Phaser.Math.DegToRad(AUTO_TARGET_CONE_DEG / 2);
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
      const score = Phaser.Math.Distance.Between(aimX, aimY, e.x, e.y);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Threat-weighted policy (Sprint mobile-overnight-batch, Phase 1)
  // ════════════════════════════════════════════════════════════════════════

  // The mobile auto-target AND the Bolt archetype's pick: the nearest actively-
  // pursuing ON-SCREEN enemy, with only a soft pull toward the aim/run direction.
  // Candidates = within acquire range OR on-screen; an off-screen candidate pays a
  // penalty and an aggroed one gets a bonus, so the chasing mass beats an off-screen
  // wanderer that happens to lie dead ahead. Returns null when nothing qualifies.
  nearestThreat() {
    const scene = this.scene;
    const player = scene.player;
    if (!player || player.isDead || !scene.enemies || scene.enemies.length === 0) return null;
    const view = this._worldView();
    const biasAngle = this._biasAngle(player);

    let best = null;
    let bestScore = Infinity;
    for (const e of scene.enemies) {
      if (!e || e.isDead || !e.active) continue;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, e.x, e.y);
      const onScreen = this._onScreen(e, view);
      if (dist > ACQUIRE_RANGE && !onScreen) continue; // far AND off-screen → never the threat

      const ang = Phaser.Math.Angle.Between(player.x, player.y, e.x, e.y);
      const dev = Math.abs(Phaser.Math.Angle.Wrap(ang - biasAngle)); // 0..π off the aim/run dir
      const devFactor = 1 + (dev / Math.PI) * TARGETING_FACING_BIAS; // soft directional pull
      const aggroFactor = this._isThreat(e) ? TARGETING_AGGRO_BIAS : 1; // pursuers win
      const screenFactor = onScreen ? 1 : TARGETING_OFFSCREEN_PENALTY; // avoid off-screen
      const score = dist * devFactor * aggroFactor * screenFactor;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  // Per-archetype placement seam (STRUCTURAL — Sprint mobile-overnight-batch, Phase 1).
  // A manual hard lock (tap/click-to-target) ALWAYS wins for every archetype. Otherwise,
  // only when the assist is live (mobile always; desktop only with auto-target ON), each
  // archetype gets its own auto-placement:
  //   • 'zone'     → the densest visible cluster centroid (drop the AoE on the pack);
  //   • 'blocking' → a point on the vector toward the pursuing mass (lay the field in
  //                  their path, behind a fleeing player);
  //   • 'bolt'/'self'/anything else → no positional override (the bolt rides the auto
  //                  threat-target; a self-cast sits on the player).
  // Returns { x, y, target } or null (→ the spell keeps its own existing default, which
  // is how desktop-with-assist-off stays byte-for-byte unchanged).
  resolvePlacement(policy, aim) {
    const hard =
      this.hardTarget && this.hardTarget.active && !this.hardTarget.isDead ? this.hardTarget : null;
    if (hard) return { x: hard.x, y: hard.y, target: hard };
    if (!this.isActive()) return null;
    if (policy === 'zone') {
      const c = this.densestClusterCentroid();
      return c ? { x: c.x, y: c.y, target: null } : null;
    }
    if (policy === 'blocking') {
      const b = this.blockingPoint(aim ? aim.angle : 0);
      return b ? { x: b.x, y: b.y, target: null } : null;
    }
    return null;
  }

  // Zone archetype: the centroid of the densest on-screen cluster. Pick the visible
  // enemy with the most neighbours within TARGETING_CLUSTER_RADIUS, then return the
  // average position of it + those neighbours. Null when no enemy is visible.
  densestClusterCentroid() {
    const view = this._worldView();
    const r2 = TARGETING_CLUSTER_RADIUS * TARGETING_CLUSTER_RADIUS;
    const visible = [];
    for (const e of this.scene.enemies || []) {
      if (!e || e.isDead || !e.active) continue;
      if (this._onScreen(e, view)) visible.push(e);
    }
    if (!visible.length) return null;
    let bestCount = -1;
    let bestX = visible[0].x;
    let bestY = visible[0].y;
    for (const a of visible) {
      let count = 0;
      let sx = 0;
      let sy = 0;
      for (const b of visible) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx * dx + dy * dy <= r2) {
          count++;
          sx += b.x;
          sy += b.y;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestX = sx / count;
        bestY = sy / count;
      }
    }
    return { x: bestX, y: bestY };
  }

  // Blocking archetype: a point a fixed distance from the player TOWARD the centroid of
  // the pursuing (aggroed) on-screen mass — i.e. in their path, behind a fleeing player.
  // No pursuers → fall back to the aim direction (ahead of the player). The fixed reach
  // is the Thornfield ahead-distance (shared so the field lands at its usual range).
  blockingPoint(aimAngle) {
    const player = this.scene.player;
    if (!player) return null;
    const view = this._worldView();
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (const e of this.scene.enemies || []) {
      if (!e || e.isDead || !e.active) continue;
      if (!this._isThreat(e) || !this._onScreen(e, view)) continue;
      n++;
      sx += e.x;
      sy += e.y;
    }
    const dir = n > 0 ? Math.atan2(sy / n - player.y, sx / n - player.x) : aimAngle;
    return {
      x: player.x + Math.cos(dir) * THORNFIELD_AHEAD_DIST,
      y: player.y + Math.sin(dir) * THORNFIELD_AHEAD_DIST
    };
  }

  // Off-screen threat directions (Sprint mobile-overnight-batch, Phase 3). The HUD draws
  // an edge arrow per entry pointing where an unseen pursuer is. Returns up to maxCount
  // { angle, dist } for AGGROED enemies that are OFF-screen, nearest first. World-space
  // angle == screen-space direction (the camera is axis-aligned / unrotated), so the HUD
  // places each arrow by angle alone.
  offScreenThreats(maxCount) {
    const scene = this.scene;
    const player = scene.player;
    if (!player || player.isDead || !scene.enemies || scene.enemies.length === 0) return [];
    const view = this._worldView();
    const out = [];
    for (const e of scene.enemies) {
      if (!e || e.isDead || !e.active) continue;
      if (!this._isThreat(e)) continue; // only active pursuers
      if (this._onScreen(e, view)) continue; // only the UNSEEN ones
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      out.push({ angle: Math.atan2(dy, dx), dist: Math.hypot(dx, dy) });
    }
    out.sort((a, b) => a.dist - b.dist);
    return maxCount ? out.slice(0, maxCount) : out;
  }

  // --- threat-policy helpers ------------------------------------------------

  // The camera's world-space view rect (or null pre-camera). Used for the on-screen test.
  _worldView() {
    return this.scene.cameras && this.scene.cameras.main ? this.scene.cameras.main.worldView : null;
  }

  // Is this enemy within the camera view (expanded by the margin)? True when there is no
  // camera yet, so targeting still works before the world view is established.
  _onScreen(e, view) {
    if (!view) return true;
    const m = TARGETING_OFFSCREEN_MARGIN;
    return (
      e.x >= view.x - m && e.x <= view.right + m && e.y >= view.y - m && e.y <= view.bottom + m
    );
  }

  // Is this enemy actively pursuing the player? Both enemy types expose isAggro()
  // (true outside their idle PATROL/WANDER state); anything else counts as not a threat.
  _isThreat(e) {
    return typeof e.isAggro === 'function' ? e.isAggro() : false;
  }

  // The soft-bias direction: the player's RUN direction while moving, else their facing.
  _biasAngle(player) {
    const b = player.body;
    if (b && (Math.abs(b.velocity.x) > 4 || Math.abs(b.velocity.y) > 4)) {
      return Math.atan2(b.velocity.y, b.velocity.x);
    }
    return FACING_ANGLE[player.facing] ?? 0;
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
