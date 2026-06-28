// DynamicNature.js — Living-world nature cycling (world-v1)
//
// Reads the `nature_dynamic` object layer authored into the Tiled world maps
// (world_v1_*.tmx) and, once per in-game day, shows the correct growth frame for
// each flower / mushroom and the correct seasonal state for each fruit tree.
//
// DESIGN GOALS (per the world-v1 spec):
//   * Reuse the EXISTING day counter — never start a parallel one. See the
//     SEASON/DAY CYCLING HOOK below.
//   * STATIC-SAFE: this module is purely additive and isolated to world
//     rendering. If the Tiled map / object layer / tileset textures are not
//     loaded (the live build is still procedural and does not load these maps
//     yet), init() no-ops with zero errors. The prop tile layers already carry
//     each element's frame-0 sprite, so the world still renders correctly today;
//     wiring the day hook later is a one-line change.
//   * No combat / economy / save / homestead gameplay code is touched.
//
// Animation model (matches the metadata written by the generator):
//   Flowers & mushrooms — independent, staggered:
//     frame = frames[(dayCount + offset) % frames.length]
//   Fruit trees — synchronized by a global season:
//     season = SEASONS[floor(dayCount / SEASON_LENGTH) % 4]
//     show fruitOverlay when season === fruitType, else the plain baseTree.

export const SEASON_LENGTH = 2;                       // tunable: in-game days per fruit season
export const SEASONS = ['apple', 'orange', 'yellow', 'pink'];

export default class DynamicNature {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {string}  [opts.mapKey='world']  tilemap cache key (when the engine loads one)
   * @param {Phaser.Tilemaps.Tilemap} [opts.map]  an already-created tilemap (optional)
   * @param {Object.<string,string>} [opts.sheets]  tilesetName -> loaded spritesheet texture key
   *        (each sheet must be loaded with frameWidth/Height = 16). When omitted, the module
   *        stays in static-fallback mode (no-op) and the tile-layer frame-0 sprites remain.
   * @param {number} [opts.depth=6]  render depth for the dynamic sprites
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.mapKey = opts.mapKey || 'world';
    this.map = opts.map || null;
    this.sheets = opts.sheets || null;
    this.depth = opts.depth != null ? opts.depth : 6;
    this.objects = [];
    this.sprites = [];
    this.enabled = false;
    this._gidIndex = null;
    this._onDay = null;
  }

  // Entry point. Fully guarded so a missing map / layer / textures can never throw
  // into the scene create() path.
  init() {
    try {
      this._init();
    } catch (err) {
      this.enabled = false;
      if (this.scene && this.scene.game && this.scene.game.config && this.scene.game.config.dev) {
        // Only surface in dev; never break the live world.
        // eslint-disable-next-line no-console
        console.warn('[DynamicNature] static-safe fallback:', err && err.message);
      }
    }
    return this;
  }

  _init() {
    const scene = this.scene;
    // 1. Resolve a tilemap. Either one was passed in, or one is in the cache.
    if (!this.map) {
      const cacheOk = scene.cache && scene.cache.tilemap && scene.cache.tilemap.exists(this.mapKey);
      if (!cacheOk) return;                       // no map loaded -> static fallback
      this.map = scene.make.tilemap({ key: this.mapKey });
    }
    // 2. Find the nature_dynamic object layer.
    const layer = this.map.getObjectLayer && this.map.getObjectLayer('nature_dynamic');
    if (!layer || !layer.objects || !layer.objects.length) return;

    // 3. Build a gid -> {sheetKey, frameIndex} resolver from the map's tilesets.
    //    Requires opts.sheets mapping tileset names to loaded 16x16 spritesheets.
    if (!this.sheets) return;                      // no textures -> static fallback
    this._gidIndex = this._buildGidIndex(this.map);

    // 4. Parse objects into a compact runtime form.
    this.objects = layer.objects
      .map((o) => this._parseObject(o))
      .filter(Boolean);
    if (!this.objects.length) return;

    // 5. Initial draw at the current day, then refresh whenever the day advances.
    this._drawAll(this._currentDay());
    this._bindDayEvents();
    this.enabled = true;
  }

  // --- day / season --------------------------------------------------------

  // SEASON/DAY CYCLING HOOK — reuse the game's existing day counter. The live
  // game exposes it as scene.daySystem.dayNumber; we read it here and nowhere
  // else. If it is not present we fall back to day 0 (still renders frame-0).
  _currentDay() {
    const ds = this.scene && this.scene.daySystem;
    const d = ds && typeof ds.dayNumber === 'number' ? ds.dayNumber : 0;
    return d > 0 ? d : 0;
  }

  _currentSeason(day) {
    return SEASONS[Math.floor(day / SEASON_LENGTH) % SEASONS.length];
  }

  // Refresh on day advance. Uses the scene EventBus if the project exposes one
  // on the scene; otherwise this is simply never called and the first-draw frame
  // persists (still correct, just not animated). Guarded so it is optional.
  _bindDayEvents() {
    const bus = this.scene && (this.scene.eventBus || this.scene.events);
    if (!bus || !bus.on) return;
    this._onDay = () => this.refresh();
    // The project emits 'day:advanced' on day change.
    bus.on('day:advanced', this._onDay);
  }

  // --- drawing -------------------------------------------------------------

  _drawAll(day) {
    this._clear();
    const season = this._currentSeason(day);
    for (const o of this.objects) {
      const gid = this._frameGidFor(o, day, season);
      if (gid == null) continue;
      const spr = this._spriteForGid(gid, o.x, o.y);
      if (spr) this.sprites.push(spr);
    }
  }

  // Which gid (frame) should show right now for this element.
  _frameGidFor(o, day, season) {
    if (o.kind === 'fruit_tree') {
      const arr = season === o.fruitType ? o.fruitOverlay : o.baseTree;
      return arr && arr.length ? arr[0] : null; // anchor tile; footprint extras stay as static tiles
    }
    if (o.frames && o.frames.length) {
      return o.frames[(day + (o.offset || 0)) % o.frames.length];
    }
    return null;
  }

  _spriteForGid(gid, x, y) {
    const ref = this._gidIndex && this._gidIndex(gid);
    if (!ref) return null;
    // Object x/y in Tiled point objects is the point itself (tile center as authored).
    const img = this.scene.add.image(x, y, ref.sheetKey, ref.frameIndex);
    img.setOrigin(0.5, 0.5).setDepth(this.depth);
    return img;
  }

  refresh() {
    if (!this.enabled) return;
    this._drawAll(this._currentDay());
  }

  _clear() {
    for (const s of this.sprites) s.destroy();
    this.sprites.length = 0;
  }

  destroy() {
    this._clear();
    const bus = this.scene && (this.scene.eventBus || this.scene.events);
    if (bus && bus.off && this._onDay) bus.off('day:advanced', this._onDay);
    this.enabled = false;
  }

  // --- parsing helpers -----------------------------------------------------

  _parseObject(o) {
    const props = this._props(o);
    const kind = props.kind || o.type;
    if (!kind) return null;
    const base = { kind, x: o.x, y: o.y };
    if (kind === 'fruit_tree') {
      return Object.assign(base, {
        fruitType: props.fruitType,
        baseTree: this._csvNums(props.baseTree),
        fruitOverlay: this._csvNums(props.fruitOverlay),
      });
    }
    // flower | mushroom
    return Object.assign(base, {
      species: props.species,
      frames: this._csvNums(props.frames),
      offset: parseInt(props.offset, 10) || 0,
    });
  }

  // Tiled object.properties is an array of {name,value}; normalize to a map.
  _props(o) {
    const out = {};
    if (Array.isArray(o.properties)) {
      for (const p of o.properties) out[p.name] = p.value;
    } else if (o.properties && typeof o.properties === 'object') {
      Object.assign(out, o.properties);
    }
    return out;
  }

  _csvNums(v) {
    if (Array.isArray(v)) return v.map(Number);
    if (typeof v === 'string') return v.split(',').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
    return [];
  }

  // Build a function gid -> {sheetKey, frameIndex} from the map's tileset table.
  // Each Tiled tileset has firstgid + name; we map the name to a loaded 16x16
  // spritesheet via opts.sheets, and frameIndex = gid - firstgid.
  _buildGidIndex(map) {
    const sets = (map.tilesets || [])
      .map((ts) => ({
        first: ts.firstgid,
        count: ts.total || (ts.tileCount != null ? ts.tileCount : 0),
        key: this.sheets[ts.name],
      }))
      .filter((s) => s.key)
      .sort((a, b) => a.first - b.first);
    return (gid) => {
      for (let i = sets.length - 1; i >= 0; i--) {
        if (gid >= sets[i].first) {
          return { sheetKey: sets[i].key, frameIndex: gid - sets[i].first };
        }
      }
      return null;
    };
  }
}
