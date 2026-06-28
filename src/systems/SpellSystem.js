// SpellSystem.js — the spell pipeline (Sprint magic-2).
//
// GameScene-owned system (like CombatSystem). Owns a pool of procedural SpellBolts and
// their enemy-overlap wiring, and dispatches a cast to the spell registry. The mana gate,
// cooldown and slot→id mapping live in GameScene.castSecondarySpell; this system handles
// the EFFECT side: resolve aim, run the spell's cast recipe, and provide the shared
// helpers (spawnBolt, damageInRadius, aoeRingVFX) every bolt/AoE spell reuses.

import Phaser from 'phaser';
import SpellBolt from '../entities/SpellBolt.js';
import { getSpellBehavior } from './spells/registry.js';

const BOLT_POOL_SIZE = 10;

// Tier colour ramps for the non-bolt spells (Sprint magic-3). Index = level-1.
// Distinct HUE per tier is a SECONDARY cue only — every spell ALSO scales size/
// reach/segments by tier (the colourblind-safe primary read). // TUNE
const ARC_COLORS = [0x9fd0ff, 0xbfe0ff, 0xd6ecff, 0xeaf6ff]; // pale → bright electric blue-white
const FROST_COLOR = 0x8fe6ff; // single cyan identity; size carries the tier
const THORN_COLOR = 0x6fae53; // vine green
const THORN_BARRIER_COLOR = 0x3f7a2e; // darker, denser at the barrier tier
const BULWARK_COLOR = 0xb8d5b1; // hedge-pastel dome

export default class SpellSystem {
  constructor(scene) {
    this.scene = scene;
    this.boltGroup = scene.physics.add.group();
    this.bolts = [];
    for (let i = 0; i < BOLT_POOL_SIZE; i++) {
      const b = new SpellBolt(scene);
      this.boltGroup.add(b);
      this.bolts.push(b);
    }
    // First-overlap-wins damage, mirroring the ranged projectile wiring.
    scene.physics.add.overlap(this.boltGroup, scene.slimeGroup, (b, e) => this.onBoltHit(b, e));
    scene.physics.add.overlap(this.boltGroup, scene.skeletonGroup, (b, e) => this.onBoltHit(b, e));

    // --- Ground-field + status infra (Sprint magic-3) -----------------------
    // Persistent ground spells (Frost field, Thornfield) live in `fields`, ticked
    // each frame by update(). Enemy slow is a velocity damp applied AFTER the enemy
    // AI has set its velocity for the frame (so it works for chase/wander/leap alike
    // on BOTH enemy types without editing either AI) — see _applySlows. `slowDecals`
    // maps a chilled enemy → its frost-shimmer overlay so death/expiry can't leak it.
    // `barrierGroup` holds the static colliders for Thornfield's max-tier barrier;
    // one collider per enemy group blocks every barrier in the group.
    this.fields = [];
    this.slowDecals = new Map();
    this._chilled = new Set();
    this.barrierGroup = scene.physics.add.staticGroup();
    scene.physics.add.collider(scene.slimeGroup, this.barrierGroup);
    scene.physics.add.collider(scene.skeletonGroup, this.barrierGroup);
    SpellSystem.ensureFieldTextures(scene);
  }

  // True if this spell id has a registered effect (Ember this sprint). GameScene uses
  // this to keep inert-but-owned spells truly inert — no mana spent on a fizzle.
  hasEffect(id) {
    return !!getSpellBehavior(id);
  }

  // Run a spell's effect. Returns true if a real effect fired; false → no behaviour
  // registered (an inert-but-owned spell), so the caller plays the fizzle instead.
  cast(id, level) {
    const behavior = getSpellBehavior(id);
    if (!behavior) return false;
    const p = this.scene.player;
    const aim = this.scene.resolveAim(p.x, p.y);
    if (p.faceTowardAngle) p.faceTowardAngle(aim.angle); // sprite faces the cast
    behavior.cast(this, {
      level,
      spellPower: (p.statBonuses && p.statBonuses.spellPower) || 0,
      x: p.x,
      y: p.y,
      angle: aim.angle,
      target: aim.target
    });
    return true;
  }

  // Spawn a pooled bolt (used by EmberSpell + any future bolt spell). Drops the shot if
  // the pool is exhausted (rare — bolts are short-lived).
  spawnBolt(opts) {
    const b = this.bolts.find((x) => !x.active);
    if (!b) return;
    b.fire(opts);
  }

  onBoltHit(bolt, enemy) {
    if (!bolt.active || enemy.isDead) return;
    bolt.applyHit(enemy, this);
  }

  // AoE damage helper: damage every active enemy within `radius` of (x,y), skipping the
  // direct-hit enemy (it already took the bolt's damage). Plays a procedural blast ring
  // sized to `radius` and styled to the casting `tier`.
  damageInRadius(x, y, radius, damage, exclude, tier) {
    if (radius <= 0 || damage <= 0) {
      if (radius > 0) this.aoeRingVFX(x, y, radius, tier);
      return;
    }
    const r2 = radius * radius;
    const list = this.scene.enemies || [];
    for (const e of list) {
      if (!e.active || e.isDead || e === exclude) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) e.takeDamage(damage, { x, y });
    }
    this.aoeRingVFX(x, y, radius, tier);
  }

  // Procedural impact blast — a double ring + a quick core flash that expand to the blast's
  // TRUE radius and fade, so the visual lands exactly on the hitbox. The growing-ring SHAPE
  // and the radius itself (52px L3 vs 112px L4) carry the read for colourblind players; the
  // tier colour (violet L3 → blue L4, matching the bolt via SpellBolt.tierColor) is a
  // secondary, redundant cue. Thick stroke + a longer hold so the blast reads, not flickers.
  aoeRingVFX(x, y, radius, tier) {
    const fx = SpellBolt.tierColor(tier);
    const stroke = fx.trail;
    const fill = fx.body;
    // Outer ring — grows from a tight core to the full blast radius.
    const outer = this.scene.add
      .circle(x, y, radius, fill, 0.22)
      .setStrokeStyle(6, stroke, 0.95)
      .setDepth(11)
      .setScale(0.22);
    this.scene.tweens.add({
      targets: outer,
      scale: 1,
      alpha: 0,
      duration: 480,
      ease: 'Quad.easeOut',
      onComplete: () => outer.destroy()
    });
    // Inner ring — a second, lighter ring trailing the outer one for a layered blast read.
    const inner = this.scene.add
      .circle(x, y, radius, fill, 0)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setDepth(11)
      .setScale(0.1);
    this.scene.tweens.add({
      targets: inner,
      scale: 0.7,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => inner.destroy()
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // Sprint magic-3 — shared infra for the non-bolt spells. Per-frame tick driven
  // by GameScene.update (right after the enemy AI loop, so the slow damp lands on
  // the velocity the AI just set). Ticks ground fields (DoT) and applies slows.
  // ════════════════════════════════════════════════════════════════════════
  update(dtMs) {
    const now = this.scene.time.now;
    this._tickFields(now, dtMs);
    this._applySlows(now);
  }

  // --- Targeting helpers (shared) -------------------------------------------

  // Nearest live enemy to (x,y) within maxRange, excluding any in `skip`. Used by
  // the auto-lock spells (Arc strike/chain, Frost single target) — independent of
  // the cone/cursor targeting so a cast always finds its mark.
  nearestEnemy(x, y, maxRange, skip) {
    const r2 = maxRange != null ? maxRange * maxRange : Infinity;
    let best = null;
    let bestD = Infinity;
    for (const e of this.scene.enemies || []) {
      if (!e || !e.active || e.isDead) continue;
      if (skip && skip.has(e)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d <= r2 && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // Damage every live enemy within `radius` of (x,y). Returns the count hit. Reused
  // by Frost's nova and the ground-field DoT tick. Source = (x,y) for knockback dir.
  damageEnemiesInRadius(x, y, radius, damage) {
    if (radius <= 0 || damage <= 0) return 0;
    const r2 = radius * radius;
    let hit = 0;
    for (const e of this.scene.enemies || []) {
      if (!e || !e.active || e.isDead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) {
        e.takeDamage(damage, { x, y });
        hit++;
      }
    }
    return hit;
  }

  // --- Enemy slow (status) --------------------------------------------------

  // Apply a single-target slow to one enemy: a velocity multiplier (<1) held until
  // now+durationMs. Stacks by taking the STRONGER slow + the LATER expiry, so a
  // fresh cast never weakens an existing chill. The damp itself is applied in
  // _applySlows every frame (see update()). // TUNE-free: pure mechanic.
  slowEnemy(enemy, mult, durationMs) {
    if (!enemy || enemy.isDead) return;
    const now = this.scene.time.now;
    const active = enemy._spellSlowUntil && now < enemy._spellSlowUntil;
    enemy._spellSlowMult = active ? Math.min(enemy._spellSlowMult, mult) : mult;
    enemy._spellSlowUntil = Math.max(active ? enemy._spellSlowUntil : 0, now + durationMs);
  }

  // Slow every live enemy within `radius` of (x,y) (Frost nova / field-on-cast).
  // Returns the count slowed.
  slowEnemiesInRadius(x, y, radius, mult, durationMs) {
    if (radius <= 0) return 0;
    const r2 = radius * radius;
    let n = 0;
    for (const e of this.scene.enemies || []) {
      if (!e || !e.active || e.isDead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) {
        this.slowEnemy(e, mult, durationMs);
        n++;
      }
    }
    return n;
  }

  // A frost burst: an expanding cyan ring + a scatter of ice flecks, flashed once.
  // Radius carries the read (single-target pop vs L2 nova vs the field's reach).
  frostVFX(x, y, radius, tier) {
    const r = Math.max(24, radius);
    const ring = this.scene.add.circle(x, y, r, FROST_COLOR, 0.18)
      .setStrokeStyle(3, 0xeaf6ff, 0.95).setDepth(11).setScale(0.2);
    this.scene.tweens.add({
      targets: ring, scale: 1, alpha: 0, duration: 420, ease: 'Quad.easeOut',
      onComplete: () => ring.destroy()
    });
    const flecks = 6 + (tier || 1) * 2;
    for (let i = 0; i < flecks; i++) {
      const a = Math.random() * Math.PI * 2;
      const fx = this.scene.add.image(x, y, 'fx_frost_chill')
        .setDepth(12).setScale(0.5).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: fx, x: x + Math.cos(a) * r * 0.8, y: y + Math.sin(a) * r * 0.8,
        alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => fx.destroy()
      });
    }
  }

  // Each frame: damp the velocity of every enemy that is chilled (by a single-target
  // slow OR by standing in a slow field), and keep a frost-shimmer decal over it.
  // Runs AFTER the enemy AI set its velocity, so it slows chase/wander/leap uniformly
  // on both enemy types without touching either AI. Reconciles decals so a chill that
  // ends (or an enemy that dies) never leaks its overlay.
  _applySlows(now) {
    const chilled = this._chilled;
    chilled.clear();
    for (const e of this.scene.enemies || []) {
      if (!e || !e.active || e.isDead || !e.body) continue;
      let mult = 1;
      if (e._spellSlowUntil && now < e._spellSlowUntil) mult = Math.min(mult, e._spellSlowMult || 1);
      for (const f of this.fields) {
        if (f.slowMult >= 1) continue;
        const dx = e.x - f.x;
        const dy = e.y - f.y;
        if (dx * dx + dy * dy <= f.radius * f.radius) mult = Math.min(mult, f.slowMult);
      }
      if (mult < 1) {
        e.body.velocity.x *= mult;
        e.body.velocity.y *= mult;
        chilled.add(e);
        this._positionChill(e);
      }
    }
    for (const [e, decal] of this.slowDecals) {
      if (!chilled.has(e)) {
        decal.destroy();
        this.slowDecals.delete(e);
      }
    }
  }

  // Create (once) and position the frost-shimmer overlay over a chilled enemy. A
  // cyan crystal SHAPE (not a tint) so it never fights the enemy's hit-flash/base-
  // tint machine and reads for colourblind players. Pulses gently so a frozen mob
  // is unmistakable.
  _positionChill(enemy) {
    let decal = this.slowDecals.get(enemy);
    if (!decal) {
      decal = this.scene.add.image(enemy.x, enemy.y, 'fx_frost_chill').setDepth(12).setAlpha(0.9);
      decal.setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: decal, scale: { from: 0.85, to: 1.1 }, alpha: { from: 0.65, to: 0.95 },
        duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
      this.slowDecals.set(enemy, decal);
    }
    decal.setPosition(enemy.x, enemy.y - 2);
  }

  // --- Ground fields (Frost field, Thornfield) ------------------------------

  // Place a persistent ground field. opts: { x, y, radius, durationMs, kind, tier,
  // slowMult, dmgPerTick, tickMs, blocks }. Draws a floor indicator (a flat decal
  // UNDER the enemies) + an optional static collider barrier (blocks pathing). The
  // field slows/DoT-damages only enemies (never the player). Returns the field rec.
  spawnField(opts) {
    const f = {
      x: opts.x,
      y: opts.y,
      radius: opts.radius,
      until: this.scene.time.now + opts.durationMs,
      durationMs: opts.durationMs,
      kind: opts.kind,
      tier: opts.tier || 1,
      slowMult: opts.slowMult != null ? opts.slowMult : 1,
      dmgPerTick: opts.dmgPerTick || 0,
      tickMs: opts.tickMs || 600,
      _tickAccum: 0,
      blocks: !!opts.blocks,
      decal: null,
      timerRing: null,
      barrier: null
    };
    this._buildFieldDecal(f);
    if (f.blocks) this._buildBarrier(f);
    this.fields.push(f);
    return f;
  }

  // The flat floor indicator: a filled disc + crisp rim drawn BELOW the enemies
  // (depth 6), plus an inner "timer ring" that shrinks over the field's life so the
  // remaining duration is visible at a glance. Thorn fields get a spiked rim (a
  // distinct SHAPE from Frost's smooth ring); the barrier tier draws denser + darker.
  _buildFieldDecal(f) {
    const frost = f.kind === 'frost';
    const fill = frost ? FROST_COLOR : f.blocks ? THORN_BARRIER_COLOR : THORN_COLOR;
    const g = this.scene.add.graphics().setDepth(6);
    g.fillStyle(fill, frost ? 0.16 : 0.22);
    g.fillCircle(f.x, f.y, f.radius);
    g.lineStyle(f.blocks ? 5 : 3, fill, 0.85);
    g.strokeCircle(f.x, f.y, f.radius);
    if (frost) {
      // A few radial ice spokes — crystalline read.
      g.lineStyle(2, 0xeaf6ff, 0.7);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.lineBetween(f.x, f.y, f.x + Math.cos(a) * f.radius * 0.9, f.y + Math.sin(a) * f.radius * 0.9);
      }
    } else {
      // Thorn spikes around the rim — denser when the patch is a barrier.
      const spikes = f.blocks ? 24 : 14;
      g.fillStyle(fill, 0.9);
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const bx = f.x + Math.cos(a) * f.radius;
        const by = f.y + Math.sin(a) * f.radius;
        const tx = f.x + Math.cos(a) * (f.radius + (f.blocks ? 14 : 9));
        const ty = f.y + Math.sin(a) * (f.radius + (f.blocks ? 14 : 9));
        const px = f.x + Math.cos(a + 0.12) * f.radius;
        const py = f.y + Math.sin(a + 0.12) * f.radius;
        g.fillTriangle(bx, by, px, py, tx, ty);
      }
    }
    f.decal = g;
    // Shrinking inner ring = visible countdown.
    const ring = this.scene.add.circle(f.x, f.y, f.radius * 0.92, fill, 0)
      .setStrokeStyle(2, 0xffffff, 0.5).setDepth(6);
    this.scene.tweens.add({ targets: ring, scale: 0, duration: f.durationMs, ease: 'Linear' });
    f.timerRing = ring;
  }

  // Invisible static circular collider that blocks enemy pathing (Thornfield L4).
  // Added to barrierGroup, which already colliders against both enemy groups.
  _buildBarrier(f) {
    const b = this.scene.add.circle(f.x, f.y, f.radius, 0x000000, 0);
    this.scene.physics.add.existing(b, true); // static body
    if (b.body) {
      b.body.setCircle(f.radius);
      b.body.updateFromGameObject();
    }
    this.barrierGroup.add(b);
    f.barrier = b;
  }

  // Tick every field: expire (tearing down decal/ring/barrier) and run the DoT.
  _tickFields(now, dtMs) {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      if (now >= f.until) {
        if (f.decal) f.decal.destroy();
        if (f.timerRing) f.timerRing.destroy();
        if (f.barrier) {
          this.barrierGroup.remove(f.barrier, true, true);
        }
        this.fields.splice(i, 1);
        continue;
      }
      if (f.dmgPerTick > 0) {
        f._tickAccum += dtMs;
        while (f._tickAccum >= f.tickMs) {
          f._tickAccum -= f.tickMs;
          this.damageEnemiesInRadius(f.x, f.y, f.radius, f.dmgPerTick);
        }
      }
    }
  }

  // --- Arc lightning VFX -----------------------------------------------------

  // A jagged multi-point lightning polyline through `nodes` (player → t1 → t2 …),
  // flashed once and faded. Higher tiers draw MORE jagged sub-segments + a THICKER,
  // brighter bolt (size/segments carry the tier; ARC_COLORS hue is the secondary
  // cue). A small burst pops at each struck node. Procedural — no textures.
  lightningVFX(nodes, tier) {
    if (!nodes || nodes.length < 2) return;
    const lvl = Math.max(1, Math.min(ARC_COLORS.length, tier || 1));
    const color = ARC_COLORS[lvl - 1];
    const segs = 3 + lvl * 2; // more zig-zag per tier
    const jag = 6 + lvl * 3; // wider deflection per tier
    const coreW = 2 + lvl; // thicker core per tier
    const points = [];
    for (let n = 0; n < nodes.length - 1; n++) {
      const a = nodes[n];
      const b = nodes[n + 1];
      for (let s = 0; s < segs; s++) {
        const t = s / segs;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        const off = s === 0 ? 0 : (Math.random() - 0.5) * 2 * jag;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const nl = Math.hypot(nx, ny) || 1;
        points.push({ x: px + (nx / nl) * off, y: py + (ny / nl) * off });
      }
    }
    points.push({ x: nodes[nodes.length - 1].x, y: nodes[nodes.length - 1].y });

    const g = this.scene.add.graphics().setDepth(13);
    g.setBlendMode(Phaser.BlendModes.ADD);
    const stroke = (width, col, alpha) => {
      g.lineStyle(width, col, alpha);
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let p = 1; p < points.length; p++) g.lineTo(points[p].x, points[p].y);
      g.strokePath();
    };
    stroke(coreW + 6, color, 0.35); // wide glow
    stroke(coreW, 0xffffff, 0.95); // bright core
    const sparks = nodes.map((node) =>
      this.scene.add.circle(node.x, node.y, coreW + 3, 0xffffff, 0.9).setDepth(13)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    // One quick flash-out; the jagged bolt is instant by design. Bolt + node sparks
    // fade and tear down together.
    this.scene.tweens.add({
      targets: [g, ...sparks], alpha: 0, duration: 170, ease: 'Quad.easeOut',
      onComplete: () => { g.destroy(); sparks.forEach((s) => s.destroy()); }
    });
  }

  // --- Bulwark dome VFX ------------------------------------------------------

  // A pulsing ward ring around the player that lasts `durationMs` then fades. Bigger,
  // brighter, faster-pulsing per tier; an outer ring shrinks over the duration as a
  // visible countdown. Follows the player each frame via a scene update hook.
  bulwarkDomeVFX(player, radius, durationMs, tier) {
    const lvl = Math.max(1, Math.min(4, tier || 1));
    const ring = this.scene.add.circle(player.x, player.y, radius, BULWARK_COLOR, 0.12)
      .setStrokeStyle(2 + lvl, BULWARK_COLOR, 0.9).setDepth(11);
    const pulse = this.scene.add.circle(player.x, player.y, radius, 0xffffff, 0)
      .setStrokeStyle(2, 0xffffff, 0.7).setDepth(11).setScale(0.6);
    this.scene.tweens.add({
      targets: pulse, scale: 1.05, alpha: { from: 0.8, to: 0 },
      duration: 520, repeat: Math.max(0, Math.floor(durationMs / 520) - 1), ease: 'Quad.easeOut'
    });
    // Countdown ring shrinks over the whole duration.
    const timer = this.scene.add.circle(player.x, player.y, radius * 0.96, BULWARK_COLOR, 0)
      .setStrokeStyle(3, 0xffffff, 0.55).setDepth(11);
    this.scene.tweens.add({ targets: timer, scale: 0, duration: durationMs, ease: 'Linear' });
    const follow = () => {
      ring.setPosition(player.x, player.y);
      pulse.setPosition(player.x, player.y);
      timer.setPosition(player.x, player.y);
    };
    this.scene.events.on('update', follow);
    this.scene.time.delayedCall(durationMs, () => {
      this.scene.events.off('update', follow);
      this.scene.tweens.add({
        targets: [ring, pulse, timer], alpha: 0, duration: 200,
        onComplete: () => { ring.destroy(); pulse.destroy(); timer.destroy(); }
      });
    });
  }

  // Generate the frost-shimmer decal texture once (a small cyan ice-crystal: a ring
  // + cross spokes). Neutral white art tinted at use; ADD-blended so it glows.
  static ensureFieldTextures(scene) {
    if (scene.textures.exists('fx_frost_chill')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.lineStyle(2, 0x8fe6ff, 1);
    g.strokeCircle(11, 11, 8);
    g.lineStyle(2, 0xffffff, 0.95);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineBetween(11, 11, 11 + Math.cos(a) * 9, 11 + Math.sin(a) * 9);
    }
    g.generateTexture('fx_frost_chill', 22, 22);
    g.destroy();
  }
}
