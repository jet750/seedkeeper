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
// gradient (GameScene.computeEnemyLevel, via spawnSlime/spawnSkeleton). Type
// eligibility is gated by distance-from-garden (darks/skeletons only far enough out)
// and day (the scaling.startDay_* gates). Enemy knobs live in
// entities.json enemies.regionSpawn.
//
// Sprint 16 — RECALIBRATED + extended. (a) Enemy per-cell density is now DISTANCE-
// SCALED (cellDensityByBand, indexed by the leveling.bands a cell falls in): sparse
// near camp, denser far out. (b) Road thinning now reduces the cell's COUNT (drops
// near-road spawns) instead of just repositioning them, so roads are genuinely
// quieter. (c) This system now ALSO populates region-based WILD SEEDS (the same
// cells, distance-scaled count + distance-weighted tier rarity — common near camp,
// rare/valuable far out), which despawn with their region and refresh on day
// rollover. Seed knobs live in entities.json seeds.regionSpawn.

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
    this.bands = scene.gameData.enemies.leveling.bands; // distance tiers (shared with leveling)
    this.seedCfg = (scene.gameData.seeds && scene.gameData.seeds.regionSpawn) || null;
    this.home = { x: GARDEN_CENTER_X, y: GARDEN_CENTER_Y };

    // Group plant keys by their tier (foundNear) once, so seed population can pick a
    // distance-weighted tier and then a random plant within it (common crops near
    // camp, rare/magic crops far out — Sprint 16).
    this.plantsByTier = {};
    const plants = scene.gameData.plants || {};
    for (const key of Object.keys(plants)) {
      const tier = (plants[key] && plants[key].foundNear) || 'mid_forest';
      (this.plantsByTier[tier] = this.plantsByTier[tier] || []).push(key);
    }

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

  // Which distance band (index into leveling.bands) a world point falls in — the
  // shared LOW/MID/HIGH tier that drives both enemy level and the distance-scaled
  // enemy density + seed density/rarity (Sprint 16). Beyond the last band's maxDist
  // (the far corners) clamps to the last (HIGH) band.
  bandIndexForDist(dist) {
    for (let i = 0; i < this.bands.length; i++) {
      if (dist <= this.bands[i].maxDist) return i;
    }
    return this.bands.length - 1;
  }

  // Distance band for a cell, measured from its centre.
  bandIndexForCell(cx, cy) {
    const size = this.cfg.cellSize;
    const wx = (cx + 0.5) * size;
    const wy = (cy + 0.5) * size;
    return this.bandIndexForDist(Math.hypot(wx - this.home.x, wy - this.home.y));
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

    // Despawn region-managed wild seeds whose cell drifted past the despawn radius
    // (off-screen, by the same hysteresis). A seed mid magnet-arc is skipped so we
    // don't yank it out of the player's hands. Uncollected seeds simply leave with
    // their region; re-entering (or a day rollover) repopulates fresh ones.
    this.despawnFarSeeds(pc);

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
      this.populateSeedsInCell(c.cx, c.cy);
      this.populated.add(k);
    }
  }

  despawnFarSeeds(pc) {
    const seeds = this.scene.seeds;
    if (!seeds) return;
    for (let i = seeds.length - 1; i >= 0; i--) {
      const s = seeds[i];
      if (!s || !s._regionManaged || s.collecting) continue;
      const c = this.cellOf(s.x, s.y);
      if (this.chebyshev(c, pc) > this.cfg.despawnRadiusCells) this.scene.despawnSeed(s);
    }
  }

  // --- Population -----------------------------------------------------------

  populateCell(cx, cy) {
    const cfg = this.cfg;
    // New Game+ scales density up (parity with the old NG+ extra-spawn behaviour).
    const ngpMult = this.scene.newGamePlus
      ? this.scene.gameData.newGamePlus.enemyDensityMult || 1
      : 1;
    // Distance-scaled density (Sprint 16): sparse near camp, denser far out — this
    // weights the population to the dangerous far/high bands and makes leaving the
    // gate a few enemies rather than a mob.
    const bandIdx = this.bandIndexForCell(cx, cy);
    const baseDensity = cfg.cellDensityByBand[bandIdx];
    const target = Math.round(baseDensity * ngpMult);
    const cap = Math.round(cfg.maxActiveEnemies * ngpMult);
    const road = cfg.road;
    for (let i = 0; i < target; i++) {
      if (this.scene.enemies.length >= cap) break; // global cap (NG+-scaled)
      const pos = this.sampleLandInCell(cx, cy);
      if (!pos) continue;
      // Road thinning as a COUNT reduction (Sprint 16): a valid land point near a
      // road is mostly DROPPED (not re-sampled), so roads carry genuinely fewer
      // enemies and the open off-road forest stays the dense zone. Re-sampling the
      // old way only nudged the spawn off the path tile but kept the full count.
      if (road && this.scene.isNearRoad(pos.x, pos.y, road.proximityPx) && Math.random() > road.keepChance) {
        continue;
      }
      const type = this.pickType(pos.x, pos.y);
      if (!type) continue;
      const enemy = this.scene.spawnRegionEnemy(type, pos.x, pos.y);
      if (enemy) enemy._regionManaged = true;
    }
  }

  // A valid point inside the cell on LAND — not garden interior, not water, not off
  // the world edge. Shared by enemy and seed population. Road thinning is the
  // caller's job (a count reduction), so it's NOT applied here. Returns null if no
  // valid land turned up in SAMPLE_ATTEMPTS tries (e.g. a mostly-water/garden cell).
  sampleLandInCell(cx, cy) {
    const size = this.cfg.cellSize;
    const x0 = cx * size;
    const y0 = cy * size;
    for (let a = 0; a < SAMPLE_ATTEMPTS; a++) {
      const x = Math.min(WORLD_WIDTH - SPAWN_MARGIN, Math.max(SPAWN_MARGIN, x0 + Math.random() * size));
      const y = Math.min(WORLD_HEIGHT - SPAWN_MARGIN, Math.max(SPAWN_MARGIN, y0 + Math.random() * size));
      if (this.scene.isInGarden(x, y)) continue;
      if (this.scene.isOnWaterTile(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  // --- Seed population (Sprint 16) ------------------------------------------

  // Fill a freshly-entered cell with wild seeds. COUNT scales with the cell's
  // distance band (denser far out) and TYPE is a distance-weighted tier roll
  // (common meadow seeds near camp, rare deep-forest / magic seeds far out), so the
  // dangerous far bands are the rewarding ones. Capped by maxActiveSeeds.
  populateSeedsInCell(cx, cy) {
    const cfg = this.seedCfg;
    if (!cfg) return;
    const bandIdx = this.bandIndexForCell(cx, cy);
    const target = cfg.seedsPerCellByBand[bandIdx];
    const cap = cfg.maxActiveSeeds;
    for (let i = 0; i < target; i++) {
      if (this.regionSeedCount() >= cap) break;
      const pos = this.sampleLandInCell(cx, cy);
      if (!pos) continue;
      const type = this.pickSeedType(bandIdx);
      if (!type) continue;
      const seed = this.scene.spawnRegionSeed(type, pos.x, pos.y);
      if (seed) seed._regionManaged = true;
    }
  }

  // Weighted tier pick for the cell's band, then a random plant of that tier. Tiers
  // with no plants or zero weight are skipped; returns null only if the band has no
  // eligible tier (then the caller skips the spawn).
  pickSeedType(bandIdx) {
    const weights = this.seedCfg.tierWeightByBand[bandIdx] || {};
    const tiers = [];
    let total = 0;
    for (const tier of Object.keys(weights)) {
      const list = this.plantsByTier[tier];
      if (!list || !list.length || weights[tier] <= 0) continue;
      total += weights[tier];
      tiers.push(tier);
    }
    if (!total) return null;
    let r = Math.random() * total;
    let chosen = tiers[0];
    for (const tier of tiers) {
      r -= weights[tier];
      if (r <= 0) {
        chosen = tier;
        break;
      }
    }
    const list = this.plantsByTier[chosen];
    return list[Math.floor(Math.random() * list.length)];
  }

  regionSeedCount() {
    const seeds = this.scene.seeds;
    if (!seeds) return 0;
    let n = 0;
    for (const s of seeds) if (s && s._regionManaged) n++;
    return n;
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
    // Wild seeds refresh with the day too (Sprint 16 — replaces the 14b daily
    // reroll): drop the current region-managed seeds (skip any mid magnet-arc) so
    // the next update repopulates fresh spots + types around the player.
    const seeds = this.scene.seeds;
    if (seeds) {
      for (let i = seeds.length - 1; i >= 0; i--) {
        const s = seeds[i];
        if (s && s._regionManaged && !s.collecting) this.scene.despawnSeed(s);
      }
    }
    this.populated.clear();
    this._first = true; // force a populate on the next update
  }
}
