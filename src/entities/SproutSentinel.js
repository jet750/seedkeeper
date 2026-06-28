// SproutSentinel.js — the persistent auto-turret entity (Sprint magic-4).
//
// The Sprout Sentinel is the sixth spell and the FIRST persistent spell entity: where
// the other five resolve instantly, casting the Sentinel PLANTS this stationary turret
// in the world. It lives for `lifetimeMs`; every `fireMs` it auto-targets the nearest
// live enemy within `range` and attacks (v1: a green mini-bolt — the pooled Ember
// SpellBolt tinted green + scaled down); then it despawns. It is NOT destructible in v1
// (lifetime-based despawn only — destructible/HP is a flagged later addition). The
// SpellSystem owns it: caps it at one active and ticks it each frame from update().
//
// ── mode SEAM (future melee / mage branches) ──────────────────────────────────────
// The attack is dispatched through `_attack(system)` on `this.mode` (default 'ranged').
// v1 implements ONLY 'ranged'. To add the full branch system later WITHOUT rebuilding
// this entity: add a `case 'melee'` (tick that damages enemies in a small radius) and a
// `case 'mage'` (tick that casts an AoE), and have SproutSentinelSpell pass the chosen
// `mode` into spawnSentinel. Lifetime, the one-active cap, targeting, the body sprite
// and the planting puff are all mode-agnostic and stay exactly as-is.

import Phaser from 'phaser';
import {
  SENTINEL_BODY_TEXTURE,
  SENTINEL_BODY_FRAME,
  SENTINEL_BODY_SCALE,
  SENTINEL_BODY_DEPTH,
  SENTINEL_BOLT_TINT,
  SENTINEL_BOLT_SCALE,
  SENTINEL_BOLT_SPEED
} from '../core/Constants.js';

export default class SproutSentinel {
  // opts: { x, y, tier, mode, damage, fireMs, lifetimeMs, range }
  constructor(scene, opts) {
    this.scene = scene;
    this.x = opts.x;
    this.y = opts.y;
    // Tier values plumbed straight from the cast onto the live entity. THE EMBER-BUG
    // GUARD: the tier value MUST reach the turret — the headless L1/L4 check reads these
    // four fields back off the spawned entity to prove L1 ≠ L4.
    this.tier = opts.tier || 1;
    this.mode = opts.mode || 'ranged'; // attack-branch seam (default: ranged turret)
    this.damage = opts.damage;
    this.fireMs = opts.fireMs;
    this.lifetimeMs = opts.lifetimeMs;
    this.range = opts.range;

    const now = scene.time.now;
    this.bornAt = now;
    this.diesAt = now + this.lifetimeMs;
    this._nextFireAt = now + this.fireMs; // first shot lands one interval after planting
    this.dead = false;

    this.sprite = this._makeBody(scene, opts.x, opts.y);
    this._spawnPuff(scene, opts.x, opts.y);
  }

  // Build the turret body — the grown crop sprite when its texture is registered/loaded
  // (it is, via the manifest), else a procedural fallback so the turret is never invisible
  // in prod (MEMORY vite-glob-asset-emission: guard art with textures.exists()). Origin
  // is rooted near the base so the stalk "stands" on the soil.
  _makeBody(scene, x, y) {
    let s;
    if (scene.textures.exists(SENTINEL_BODY_TEXTURE)) {
      s = scene.add.sprite(x, y, SENTINEL_BODY_TEXTURE, SENTINEL_BODY_FRAME);
    } else {
      SproutSentinel.ensureFallbackTexture(scene);
      s = scene.add.sprite(x, y, 'px_sentinel_body');
    }
    s.setOrigin(0.5, 0.82);
    s.setScale(SENTINEL_BODY_SCALE);
    s.setDepth(SENTINEL_BODY_DEPTH);
    // A gentle idle sway so a planted turret reads as alive, not a static prop.
    this._idleTween = scene.tweens.add({
      targets: s,
      angle: { from: -3, to: 3 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    return s;
  }

  // A small procedural "planting" puff: a brown soil ring that bursts outward + a few
  // green sprout flecks that arc upward, then fade. Procedural only — no texture deps.
  _spawnPuff(scene, x, y) {
    const ring = scene.add
      .circle(x, y + 6, 14, 0x6b4f2a, 0.0)
      .setStrokeStyle(3, 0x8a6a3a, 0.9)
      .setDepth(SENTINEL_BODY_DEPTH - 1)
      .setScale(0.3);
    scene.tweens.add({
      targets: ring,
      scale: 1.4,
      alpha: 0,
      duration: 360,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy()
    });
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI; // upward fan
      const fleck = scene.add
        .triangle(x, y + 4, 0, 6, 3, 0, 6, 6, 0x8ab87e, 0.95)
        .setDepth(SENTINEL_BODY_DEPTH + 1);
      const dist = 14 + Math.random() * 16;
      scene.tweens.add({
        targets: fleck,
        x: x + Math.cos(a) * dist,
        y: y + 4 + Math.sin(a) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 320 + Math.random() * 160,
        ease: 'Quad.easeOut',
        onComplete: () => fleck.destroy()
      });
    }
  }

  // Per-frame tick, driven by SpellSystem.update. Returns false once the turret has
  // expired (the system then removes + destroys it). Expires on lifetime, else runs the
  // mode's attack on the fire interval.
  update(now, system) {
    if (this.dead) return false;
    if (now >= this.diesAt) {
      this.despawn();
      return false;
    }
    if (now >= this._nextFireAt) {
      this._attack(system);
      this._nextFireAt = now + this.fireMs;
    }
    return true;
  }

  // Attack dispatch — THE MODE SEAM. v1 implements 'ranged' only; melee/mage plug in here.
  _attack(system) {
    switch (this.mode) {
      case 'ranged':
      default:
        this._fireRanged(system);
        break;
      // case 'melee': this._strikeMelee(system); break;  // future branch
      // case 'mage':  this._castMage(system);   break;  // future branch
    }
  }

  // Auto-target the nearest live enemy in range (reusing SpellSystem.nearestEnemy) and
  // fire a green, scaled-down Ember bolt at it — semi-homing onto the target. Reuses the
  // pooled SpellBolt + the existing bolt→enemy overlap wiring (no new collision code). A
  // whiff (no enemy in range) simply holds fire until the next interval.
  _fireRanged(system) {
    const target = system.nearestEnemy(this.x, this.y, this.range);
    if (!target) return;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    system.spawnBolt({
      x: this.x,
      y: this.y - 6, // muzzle a touch above the soil
      angle,
      target,
      tier: 1, // base kite art …
      tint: SENTINEL_BOLT_TINT, // … recoloured green …
      scaleMult: SENTINEL_BOLT_SCALE, // … and shrunk → "green mini fireball"
      speed: SENTINEL_BOLT_SPEED,
      range: this.range,
      damage: this.damage,
      aoeRadius: 0,
      aoeDamage: 0
    });
    this._recoilTell();
  }

  // A quick squash-and-spring on the body so each shot reads as the turret firing.
  _recoilTell() {
    if (!this.sprite || this.dead) return;
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: SENTINEL_BODY_SCALE * 0.88,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut'
    });
  }

  // Lifetime expiry (or scene teardown): stop the idle sway and wither the body out, then
  // destroy it. Idempotent — safe to call once; the system drops the reference after.
  despawn() {
    if (this.dead) return;
    this.dead = true;
    if (this._idleTween) {
      this._idleTween.stop();
      this._idleTween = null;
    }
    const s = this.sprite;
    this.sprite = null;
    if (!s) return;
    this.scene.tweens.killTweensOf(s);
    this.scene.tweens.add({
      targets: s,
      alpha: 0,
      scaleY: SENTINEL_BODY_SCALE * 0.4,
      duration: 240,
      ease: 'Quad.easeIn',
      onComplete: () => s.destroy()
    });
  }

  // Procedural fallback body — a small green stalk-on-a-mound — generated once, used only
  // if the configured crop texture is somehow absent (defensive; the manifest emits it).
  static ensureFallbackTexture(scene) {
    if (scene.textures.exists('px_sentinel_body')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x6b4f2a, 1); // soil mound
    g.fillEllipse(8, 28, 14, 6);
    g.fillStyle(0x3f7a2e, 1); // stalk
    g.fillRect(7, 8, 2, 18);
    g.fillStyle(0x8ab87e, 1); // leaves
    g.fillTriangle(8, 6, 2, 14, 8, 14);
    g.fillTriangle(8, 6, 14, 14, 8, 14);
    g.generateTexture('px_sentinel_body', 16, 32);
    g.destroy();
  }
}
