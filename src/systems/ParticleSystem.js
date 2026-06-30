// ParticleSystem.js
//
// Combat "juice" for Sprint 3: float-up damage numbers and death particle
// bursts. Both live in WORLD space (this system is owned by GameScene, not the
// HUD) so numbers rise from the enemy that was hit and bursts pop where it died.
//
// Note on architecture: the sprint spec sketched UIScene as the 'ui:floatText'
// listener, but the float text carries world coordinates (above the enemy
// sprite) and UIScene is a separate camera that deliberately never imports the
// game world. Subscribing here keeps UIScene a pure HUD and puts the text in the
// correct coordinate space. The event contract is unchanged — anything can still
// emit 'ui:floatText'.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
// VFX budget (combat-particle scalar + concurrent cap) is now LIVE from the player's Graphics
// setting (Sprint mobile-polish-menus, Phase 6). vfx() reads the current Low/Medium/High level;
// 'medium' reproduces the prior Constants MOBILE_VFX_SCALAR (0.5) / VFX_PARTICLE_CAP (256).
import { vfx } from '../core/GraphicsQuality.js';

const POOL_SIZE = 20;
const FLOAT_RISE = 40; // px the text drifts upward
const FLOAT_DURATION = 1200;
const FLOAT_DEPTH = 30; // above every world entity
const BURST_COUNT = 6;
const BURST_SIZE = 6;
const BURST_DISTANCE = 40;
const BURST_DURATION = 600;
const BURST_DEPTH = 12;
const ARC_BASE_R = 5; // base radius the pooled splat circle is built at (sized via scale)

export default class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    // Halved by GameScene.applyMobileOptimizations() on touch devices so heavy
    // combat doesn't spawn hundreds of tween targets on a mobile GPU. The float
    // damage numbers are untouched (they carry information, not just juice).
    this.mobileMode = false;

    // --- Pooled combat particles (Sprint mobile-overnight-batch, Phase 2) -------
    // The death bursts / collect pops / splats / confetti below spawned a fresh
    // GameObject per particle and destroyed it on tween-complete — create/destroy
    // churn that, in a heavy swarm, is a prime GC-pressure suspect. They now recycle
    // from per-shape pools (filled rect + filled arc). A hard concurrent cap
    // (VFX_PARTICLE_CAP) bounds the live count; _liveParticles is read by the dev
    // perf overlay (Phase 2 instrumentation). Pure recycling — visuals are identical.
    this._rectPool = [];
    this._arcPool = [];
    this._liveParticles = 0;

    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const t = scene.add
        .text(0, 0, '', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3
        })
        .setOrigin(0.5)
        .setDepth(FLOAT_DEPTH)
        .setActive(false)
        .setVisible(false);
      this.pool.push(t);
    }

    this._onFloatText = (d) => this.showFloatText(d.x, d.y, d.text, d.color);
    EventBus.on('ui:floatText', this._onFloatText);

    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);
  }

  // --- Float-up text pool ---------------------------------------------------

  getFromPool() {
    const free = this.pool.find((t) => !t.active);
    if (free) return free;
    // Pool exhausted (heavy combat) — recycle the oldest, cancelling its tween.
    const reuse = this.pool[0];
    this.scene.tweens.killTweensOf(reuse);
    return reuse;
  }

  returnToPool(textObj) {
    textObj.setActive(false).setVisible(false);
  }

  showFloatText(x, y, text, color = '#ffffff', duration = FLOAT_DURATION) {
    const textObj = this.getFromPool();
    textObj
      .setText(text)
      .setColor(color)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(1)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: textObj,
      y: y - FLOAT_RISE,
      alpha: 0,
      duration,
      ease: 'Power2',
      onComplete: () => this.returnToPool(textObj)
    });
  }

  // --- Pooled particle helpers (Sprint mobile-overnight-batch, Phase 2) ------

  // Grab a recycled filled RECTANGLE (or grow the pool), reset to a clean state, and
  // mark it live. Returns null when the hard concurrent cap is hit so the caller skips
  // that particle (a bounded budget, never a hang). Reset covers every property the
  // burst tweens touch (size/fill/scale/alpha/rotation/position/depth).
  _rect(x, y, w, h, tint, depth = BURST_DEPTH) {
    if (this._liveParticles >= vfx().particleCap) return null;
    let r = this._rectPool.find((o) => !o.active);
    if (!r) {
      r = this.scene.add.rectangle(0, 0, 8, 8, 0xffffff);
      this._rectPool.push(r);
    }
    r.setSize(w, h)
      .setFillStyle(tint, 1)
      .setPosition(x, y)
      .setDepth(depth)
      .setRotation(0)
      .setScale(1)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this._liveParticles++;
    return r;
  }

  // Same, for a filled CIRCLE (slime splat blobs). Arc.setRadius does NOT rebuild the
  // shape geometry in Phaser, so the pooled circle is created once at ARC_BASE_R and
  // sized via SCALE (radius / base) — which also leaves the splat's shrink tween, that
  // animates scale → 0, working exactly as before.
  _arc(x, y, radius, tint, depth = BURST_DEPTH) {
    if (this._liveParticles >= vfx().particleCap) return null;
    let a = this._arcPool.find((o) => !o.active);
    if (!a) {
      a = this.scene.add.circle(0, 0, ARC_BASE_R, 0xffffff);
      this._arcPool.push(a);
    }
    a.setFillStyle(tint, 1)
      .setPosition(x, y)
      .setDepth(depth)
      .setScale(radius / ARC_BASE_R)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this._liveParticles++;
    return a;
  }

  // Tween onComplete handler — park the particle back in its pool (no destroy).
  _recycle(obj) {
    obj.setActive(false).setVisible(false);
    this._liveParticles = Math.max(0, this._liveParticles - 1);
  }

  // Live pooled-particle count + active float-text — read by the dev perf overlay.
  activeCount() {
    let n = this._liveParticles;
    for (const t of this.pool) if (t.active) n++;
    return n;
  }

  // --- Death particle burst -------------------------------------------------

  showDeathBurst(x, y, color) {
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = (i / BURST_COUNT) * Math.PI * 2;
      const particle = this._rect(x, y, BURST_SIZE, BURST_SIZE, tint);
      if (!particle) break;
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * BURST_DISTANCE,
        y: y + Math.sin(angle) * BURST_DISTANCE,
        alpha: 0,
        duration: BURST_DURATION,
        onComplete: () => this._recycle(particle)
      });
    }
  }

  // --- Event-driven feedback bursts (Sprint 5) ------------------------------
  // All bursts fire on discrete gameplay events (never per-frame), so the
  // create/destroy-per-particle pattern is cheap here. Geometry only — no
  // external particle textures.

  toTint(color) {
    if (typeof color === 'number') return color;
    if (typeof color === 'string') return Phaser.Display.Color.HexStringToColor(color).color;
    return 0xffffff;
  }

  // Generic radial pop. `diamond` rotates square particles 45° for a sparkle
  // look; `yBias` nudges the spread upward (negative = up).
  // On mobile, scale the particle budget by the live Graphics-setting VFX scalar (min 1) so
  // juice never costs framerate. The 'medium' default (0.5) reproduces the prior hard-coded
  // "/2"; Low trims it further, High restores full density. Desktop is unscaled (unchanged).
  _count(n) {
    return this.mobileMode ? Math.max(1, Math.ceil(n * vfx().vfxScalar)) : n;
  }

  burst(x, y, { count, color, radius, duration, size, diamond = false, yBias = 0 }) {
    const tint = this.toTint(color);
    count = this._count(count);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = radius * (0.6 + Math.random() * 0.4);
      const p = this._rect(x, y, size, size, tint);
      if (!p) break;
      if (diamond) p.setRotation(Math.PI / 4);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist + yBias,
        alpha: 0,
        scale: 0.2,
        duration,
        ease: 'Power2',
        onComplete: () => this._recycle(p)
      });
    }
  }

  // 6 particles in the plant's colour, tight radial pop.
  seedCollect(position, color) {
    if (!position) return;
    this.burst(position.x, position.y, {
      count: 6, color, radius: 30, duration: 500, size: 5
    });
  }

  // 8 green sparkles rising from a harvested bed.
  harvestBurst(position) {
    if (!position) return;
    this.burst(position.x, position.y, {
      count: 8, color: 0x8ab87e, radius: 40, duration: 700, size: 6, yBias: -24
    });
  }

  // 10 plant-coloured diamonds from the workshop chest.
  upgradeBurst(position, color) {
    if (!position) return;
    this.burst(position.x, position.y, {
      count: 10, color, radius: 60, duration: 900, size: 7, diamond: true
    });
  }

  // 8 grey particles where the player fell.
  deathBurst(x, y) {
    this.burst(x, y, {
      count: 8, color: 0x9b9389, radius: 36, duration: 800, size: 6
    });
  }

  // --- Enemy death variety (Sprint 13) --------------------------------------

  // Green slime: 4 colored blobs burst radially and shrink to nothing — a pop.
  slimeSplat(x, y, color) {
    const tint = this.toTint(color);
    const n = this._count(4);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 20 + Math.random() * 10;
      const blob = this._arc(x, y, 5, tint);
      if (!blob) break;
      this.scene.tweens.add({
        targets: blob,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        scale: 0,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => this._recycle(blob)
      });
    }
  }

  // Dark slime: a bigger purple burst (the screen desaturate flash is GameScene's).
  darkSlimeBurst(x, y) {
    this.burst(x, y, {
      count: 10, color: 0x8833cc, radius: 48, duration: 500, size: 7, diamond: true
    });
  }

  // Skeleton: 3-4 white "bones" fly outward at random angles, spin, and fade.
  skeletonBones(x, y) {
    const count = this._count(3 + Math.floor(Math.random() * 2));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 20;
      const bone = this._rect(x, y, 4, 11, 0xe8e2d0);
      if (!bone) break;
      bone.setRotation(Math.random() * Math.PI);
      this.scene.tweens.add({
        targets: bone,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        angle: 180 + Math.random() * 180,
        alpha: 0,
        duration: 600,
        ease: 'Quad.easeOut',
        onComplete: () => this._recycle(bone)
      });
    }
  }

  // --- Garden lifecycle feedback (Sprint 13) --------------------------------

  // Harvest flourish: confetti that arcs up then falls under "gravity".
  harvestConfetti(position, color) {
    if (!position) return;
    const tint = this.toTint(color);
    const n = this._count(6);
    for (let i = 0; i < n; i++) {
      const p = this._rect(position.x, position.y, 6, 6, tint);
      if (!p) break;
      const dx = (Math.random() - 0.5) * 60;
      const peakY = position.y - (30 + Math.random() * 30);
      this.scene.tweens.add({
        targets: p,
        x: position.x + dx,
        y: peakY,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.scene.tweens.add({
            targets: p,
            y: peakY + 70,
            alpha: 0,
            angle: 180,
            duration: 400,
            ease: 'Quad.easeIn',
            onComplete: () => this._recycle(p)
          });
        }
      });
    }
  }

  // Watering ripple: 3 expanding blue rings staggered out from the bed centre.
  waterRipple(position) {
    if (!position) return;
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 100, () => {
        const ring = this.scene.add
          .circle(position.x, position.y, 4, 0x44aaff, 0)
          .setStrokeStyle(2, 0x44aaff)
          .setDepth(BURST_DEPTH);
        this.scene.tweens.add({
          targets: ring,
          scale: 6, // 4px → ~24px
          alpha: 0,
          duration: 600,
          ease: 'Quad.easeOut',
          onComplete: () => ring.destroy()
        });
      });
    }
  }

  cleanup() {
    EventBus.off('ui:floatText', this._onFloatText);
  }
}
