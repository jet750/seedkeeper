// RegionSpawnSystem.js
//
// Sprint 15 — region-based enemy spawning. The 6400x6400 world is too big to
// simulate all at once (running enough enemies to fill it would tank mobile), and
// the old approach spread a fixed population in radial bands AROUND THE GARDEN, so
// wandering far out met an empty map. This system instead populates the area
// AROUND THE PLAYER: as the player enters a region it fills with enemies, and as
// they leave the region empties, so each area feels alive without simulating the
// whole map.
//
// APPROACH: a grid of cells (chosen over a rolling radius because cells have a
// stable identity — "have I populated this region yet?" is a Set lookup, and
// despawn/hysteresis fall out naturally). Cells within activeRadiusCells of the
// player's cell are populated; a region-managed enemy whose cell drifts past
// despawnRadiusCells is removed (hysteresis keeps cells from flickering and pushes
// the despawn off-screen). An aggroed enemy is NEVER despawned mid-chase — it
// persists across region boundaries until it loses the player (task 4).
//
// WHAT THIS DOES NOT CHANGE: enemy LEVEL still comes from the distance-from-garden
// gradient (GameScene.computeEnemyLevel, via spawnSlime/spawnSkeleton), so the
// radial SPAWN_BAND leveling is intact — this sprint changes only WHERE/WHEN
// spawning happens. Type eligibility is gated by distance-from-garden (darks/
// skeletons only far enough out) and day (the scaling.startDay_* gates). All knobs
// live in entities.json enemies.regionSpawn.

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GARDEN_CENTER_X,
  GARDEN_CENTER_Y
} from '../core/Constants.js';

const SPAWN_MARGIN = 80; // keep spawns off the world edges (matches ENEMY_SPAWN_MARGIN)
const SAMPLE_ATTEMPTS = 12; // tries to find a valid (non-garden/water/road) spot per spawn

export default class RegionSpawnSystem {
  constructor(scene) {
    this.scene = scene;
    this.cfg = scene.gameData.enemies.regionSpawn;
    this.home = { x: GARDEN_CENTER_X, y: GARDEN_CENTER_Y };

    const size = this.cfg.cellSize;
    this.cols = Math.ceil(WORLD_WIDTH / size);
    this.rows = Math.ceil(WORLD_HEIGHT / size);

    // Cell keys we've already populated (so we don't re-spawn a cell every frame).
    // Pruned by distance as the player moves, so revisiting a region refills it.
    this.populated = new Set();

    this._lastCell = { cx: -999, cy: -999 };
    this._sinceSweep = 0;
    this._first = true;
  }

  // --- Cell math ------------------------------------------------------------

  cellOf(x, y) {
    const size = this.cfg.cellSize;
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / size)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / size)));
    return { cx, cy };
  }

  key(cx, cy) {
    return `${cx},${cy}`;
  }

  cellFromKey(k) {
    const [cx, cy] = k.split(',').map(Number);
    return { cx, cy };
  }

  chebyshev(a, b) {
    return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
  }

  isCellActive(cx, cy, pc) {
    return this.chebyshev({ cx, cy }, pc) <= this.cfg.activeRadiusCells;
  }

  // Active cells (within activeRadiusCells of the player's cell), clamped to the
  // grid and ordered nearest-first so the immediate area fills before the cap bites.
  activeCellList(pc) {
    const r = this.cfg.activeRadiusCells;
    const list = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const cx = pc.cx + dx;
        const cy = pc.cy + dy;
        if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
        list.push({ cx, cy, d: dx * dx + dy * dy });
      }
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  // --- Per-frame driver -----------------------------------------------------

  // Cheap-guarded: only does real work when the player changes cell, on a periodic
  // sweep (to catch enemies that disengaged a chase and should now despawn), or on
  // the very first tick (initial population around the player's start).
  update(dt) {
    const player = this.scene.player;
    if (!player) return;
    this._sinceSweep += dt * 1000;
    const pc = this.cellOf(player.x, player.y);
    const moved = pc.cx !== this._lastCell.cx || pc.cy !== this._lastCell.cy;
    if (!moved && !this._first && this._sinceSweep < this.cfg.sweepIntervalMs) return;
    this._lastCell = pc;
    this._sinceSweep = 0;
    this._first = false;
    this.recompute(pc);
  }

  recompute(pc) {
    const cfg = this.cfg;
    const enemies = this.scene.enemies;

    // Despawn region-managed, non-aggro enemies whose cell drifted beyond the
    // despawn radius. Aggroed enemies are skipped — a chase persists across region
    // boundaries (task 4) and they're cleaned up once they disengage and a later
    // recompute finds them out of range. Iterate backward: despawnEnemy splices.
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e || !e._regionManaged || e.isDead) continue;
      if (this.isAggro(e)) continue;
      const c = this.cellOf(e.x, e.y);
      if (this.chebyshev(c, pc) > cfg.despawnRadiusCells) this.scene.despawnEnemy(e);
    }

    // Forget cells we've left far behind so re-entering refills them fresh.
    for (const k of [...this.populated]) {
      if (this.chebyshev(this.cellFromKey(k), pc) > cfg.despawnRadiusCells) {
        this.populated.delete(k);
      }
    }

    // Populate active cells we haven't filled yet (nearest-first under the cap).
    for (const c of this.activeCellList(pc)) {
      const k = this.key(c.cx, c.cy);
      if (this.populated.has(k)) continue;
      this.populateCell(c.cx, c.cy);
      this.populated.add(k);
    }
  }

  // --- Population -----------------------------------------------------------

  populateCell(cx, cy) {
    const cfg = this.cfg;
    // New Game+ scales density up (parity with the old NG+ extra-spawn behaviour).
    const ngpMult = this.scene.newGamePlus
      ? this.scene.gameData.newGamePlus.enemyDensityMult || 1
      : 1;
    const target = Math.round(cfg.baseCellDensity * ngpMult);
    const cap = Math.round(cfg.maxActiveEnemies * ngpMult);
    for (let i = 0; i < target; i++) {
      if (this.scene.enemies.length >= cap) break; // global cap (NG+-scaled)
      const pos = this.sampleSpawnInCell(cx, cy);
      if (!pos) continue;
      const type = this.pickType(pos.x, pos.y);
      if (!type) continue;
      const enemy = this.scene.spawnRegionEnemy(type, pos.x, pos.y);
      if (enemy) enemy._regionManaged = true;
    }
  }

  // A valid spawn point inside the cell: on land (not garden, not water, not off
  // the edge) and density-weighted away from roads — a candidate near a path is
  // mostly rejected so roads stay quieter (but not enemy-free). Returns null if no
  // valid point turned up in SAMPLE_ATTEMPTS tries (e.g. a mostly-water cell).
  sampleSpawnInCell(cx, cy) {
    const size = this.cfg.cellSize;
    const road = this.cfg.road;
    const x0 = cx * size;
    const y0 = cy * size;
    for (let a = 0; a < SAMPLE_ATTEMPTS; a++) {
      const x = Math.min(WORLD_WIDTH - SPAWN_MARGIN, Math.max(SPAWN_MARGIN, x0 + Math.random() * size));
      const y = Math.min(WORLD_HEIGHT - SPAWN_MARGIN, Math.max(SPAWN_MARGIN, y0 + Math.random() * size));
      if (this.scene.isInGarden(x, y)) continue;
      if (this.scene.isOnWaterTile(x, y)) continue;
      if (road && this.scene.isNearRoad(x, y, road.proximityPx) && Math.random() > road.keepChance) {
        continue; // near a road — mostly skip so roads spawn sparsely
      }
      return { x, y };
    }
    return null;
  }

  // Choose an enemy type for a spawn point. Greens are eligible everywhere; darks
  // and skeletons unlock by distance-from-garden AND day gate (so the near-home
  // early game stays gentle, danger appears far out and later). Weighted pick over
  // whatever is eligible.
  pickType(x, y) {
    const cfg = this.cfg;
    const scaling = this.scene.gameData.enemies.scaling;
    const day = this.scene.daySystem ? this.scene.daySystem.dayNumber : 1;
    const dist = Math.hypot(x - this.home.x, y - this.home.y);

    const eligible = ['green_slime'];
    if (day >= scaling.startDay_darkSlime && dist >= cfg.darkMinDist) eligible.push('dark_slime');
    if (day >= scaling.startDay_skeleton && dist >= cfg.skeletonMinDist) eligible.push('skeleton');

    const weights = cfg.typeWeights || {};
    let total = 0;
    for (const t of eligible) total += weights[t] || 1;
    let r = Math.random() * total;
    for (const t of eligible) {
      r -= weights[t] || 1;
      if (r <= 0) return t;
    }
    return eligible[0];
  }

  // True while an enemy is actively engaged with the player (any non-idle combat
  // state). Such enemies are exempt from despawn so a chase isn't cut at a boundary.
  isAggro(e) {
    return typeof e.isAggro === 'function' ? e.isAggro() : false;
  }

  // --- Day rollover ---------------------------------------------------------

  // A new day re-levels enemies (the day bump in computeEnemyLevel) and re-mixes
  // types as new day gates open. Despawn the current non-aggro managed population
  // and clear cell tracking; the next update repopulates around the player with the
  // new day's eligibility + levels. Day rollover happens during the sleep fade (or
  // the death respawn), so this churn is off-screen.
  refreshForNewDay() {
    const enemies = this.scene.enemies;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e && e._regionManaged && !e.isDead && !this.isAggro(e)) this.scene.despawnEnemy(e);
    }
    this.populated.clear();
    this._first = true; // force a populate on the next update
  }
}
