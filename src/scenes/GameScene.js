// GameScene.js
//
// The playable world: a two-zone map (safe garden on top, dangerous forest
// below), the player, wandering slimes, the day-timer system, zone-reactive
// music, and — added in Sprint 2 — the full resource loop: collectible seeds in
// the forest, plantable garden beds, a well for watering, a bed for sleeping,
// and a plant bank. All HUD state is pushed over EventBus to the parallel
// UIScene; GameScene orchestrates the entities it owns directly.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import GameState from '../core/GameState.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GARDEN_ZONE_HEIGHT,
  TILE_SIZE,
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  isDevModeActive
} from '../core/Constants.js';
import Player from '../entities/Player.js';
import Slime from '../entities/Slime.js';
import Skeleton from '../entities/Skeleton.js';
import Seed, { SEED_SCALE } from '../entities/Seed.js';
import GardenBed from '../entities/GardenBed.js';
import WorldDetail from '../entities/WorldDetail.js';
import Projectile from '../entities/Projectile.js';
import DaySystem from '../systems/DaySystem.js';
import CombatSystem from '../systems/CombatSystem.js';
import ParticleSystem from '../systems/ParticleSystem.js';
import AudioSystem from '../systems/AudioSystem.js';
import AchievementSystem from '../systems/AchievementSystem.js';
import SaveSystem from '../core/SaveSystem.js';
import entitiesData from '../data/entities.json';

const INTERACT_RANGE = 48; // px — F-key reach for beds, well, sleep
const SEED_COLLECT_RANGE = 26; // px — player must be this close to pick up a seed
const DEMO_WIN_PER_PLANT = 10; // grow this many of EVERY plant type to trigger the demo win
const PROXIMITY_LABEL_DIST = 80; // px — interactive-structure labels reveal within this range
const SLEEP_FADE_MS = 500;
const SWAP_TIMEOUT_DIST = 80; // px — walking this far from a seed cancels the swap picker

// --- Combat & enemy spawning (Sprint 3) ---
const DARK_SLIME_TINT = 0x8833cc;
const MAX_DARK_SLIMES = 4;
const ENEMY_SPAWN_MARGIN = 80; // keep spawns off the world edges
const DEEP_FOREST_THRESHOLD = 0.7; // skeletons spawn below this fraction of WORLD_HEIGHT
const SKELETON_PATROL_SPREAD = 220; // px between a skeleton's patrol waypoints
const DEATH_DROP_SCATTER = 40; // spread of seeds dropped on player death
const SEED_RECOVERY_MS = 30000; // recovery window before death-dropped seeds vanish
const GATE_SCALE = 2; // closed-gate draw scale at the zone boundary (Sprint 10b)
const RESPAWN_FADE_MS = 500;
const RESPAWN_DELAY_MS = 1500;
const SHAKE_DURATION_MS = 250;
const SHAKE_INTENSITY = 0.004;
const ENEMY_DEATH_COLORS = {
  green_slime: '#8AB87E',
  dark_slime: '#8833cc',
  skeleton: '#E8E2D0'
};

// --- Upgrades, save & projectiles (Sprint 4) ---
// Which player gear slot each plant's gear track feeds.
const GEAR_SLOT_BY_PLANT = {
  red_mushroom: 'weapon',
  blue_flower: 'armor',
  golden_wheat: 'boots',
  green_herb: 'satchel',
  glowshroom: 'ranged',
  sunflower: 'wateringCan'
};
const DEFAULT_BANK = {
  red_mushroom: 0,
  blue_flower: 0,
  golden_wheat: 0,
  green_herb: 0,
  glowshroom: 0,
  sunflower: 0
};
const PROJECTILE_POOL_SIZE = 10;
// Garden bed grid layout (row-wraps as satchel upgrades add beds).
const BED_BASE_X = 1340;
const BED_BASE_Y = 260;
const BED_COL_GAP = 160;
const BED_ROW_GAP = 150;
const BEDS_PER_ROW = 4;
const CHEST_X = 1600;
const CHEST_Y = 560;
// obj_chest.png is a 48x48 sheet: row 0 is a closed→open progression.
const CHEST_CLOSED_FRAME = 0;
const CHEST_OPEN_FRAME = 4;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  // Receives { slotIndex, save } from MenuScene. Falls back to a fresh default
  // save when launched directly (e.g. dev hot-reload).
  init(data) {
    this.currentSlot = data && data.slotIndex != null ? data.slotIndex : 0;
    this.saveData = data && data.save ? data.save : SaveSystem.load(this.currentSlot);
  }

  create() {
    this.gameData = entitiesData;
    this.currentZone = 'garden';
    this._respawning = false;
    this._postTimerApplied = false;
    this._sleeping = false;
    this._swapCandidate = null;
    this._swapPickerOpen = false;
    this._swapSnoozedSeed = null;
    this._upgradeOpen = false;
    this._winOpen = false;
    this._signpostOpen = false;
    this._lastPromptText = null; // contextual F-prompt dedupe (Sprint 9)
    this._dictionaryOpen = false;
    this._worldDetailOpen = false;
    this._busHandlers = [];

    // --- Weather day-scoped modifiers (Sprint 11) ---
    this.weatherDetectMult = 1; // fog → 0.6 (read by enemies)
    this.weatherRespawnMult = 1; // wind → 0.7 (read by seeds)
    this._weatherAccelBonus = 0; // sunny → +0.15 watering accelerate chance
    this._pendingGrowthPenalty = false; // cloudy → +1 day on the next night

    // --- Win / New Game+ / run-stats state (Sprint 5 + Sprint 11 run summary) ---
    this.newGamePlus = !!this.saveData.newGamePlus;
    this._demoWinTriggered = !!this.saveData.demoWinTriggered;
    this._fullWinTriggered = false;
    this.runStats = {
      enemiesDefeated: 0,
      upgradesPurchased: 0,
      seedsCollected: 0,
      deaths: 0,
      firstPlantGrown: null,
      killsByType: { green_slime: 0, dark_slime: 0, skeleton: 0 }
    };
    this.audioSettings = {
      masterVolume: 1.0,
      sfxVolume: 0.8,
      musicVolume: 0.5,
      muted: false,
      ...(this.saveData.settings || {})
    };

    // --- Persistent state restored from the save slot ---
    this.plantBank = { ...DEFAULT_BANK, ...(this.saveData.bank || {}) };
    this.upgradeLevels = JSON.parse(JSON.stringify(this.saveData.upgrades));
    this.plantsGrownEver = { ...DEFAULT_BANK, ...(this.saveData.plantsGrownEver || {}) };
    this.wellLevel = this.saveData.wellLevel || 0; // Sprint 9 well-upgrade tier index
    // Sprint 11 retention state.
    this.discoveredPlants = [...(this.saveData.discoveredPlants || [])];
    this._dailySeedCollected = this.saveData.dailySeedCollected || null;
    this._dailySeedToastShown = this.saveData.dailySeedToastShown || null;
    this._playtimeMs = (this.saveData.totalPlaytime || 0) * 1000;

    // Single source of truth for all active enemies (slimes + skeletons). The
    // CombatSystem and enemy-scaling logic both read this array.
    this.enemies = [];

    this.ensurePlaceholderTextures();
    this.buildWorld();
    this.setupBounds();

    // --- Player ---
    this.player = new Player(
      this,
      WORLD_WIDTH / 2,
      GARDEN_ZONE_HEIGHT / 2,
      this.gameData
    );

    // --- Camera ---
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(2.0);

    // --- Day/night atmosphere tint (Sprint 9) ---
    // A screen-fixed colour wash over the world (below the HUD scene). Garden
    // warms and forest cools slightly more with each passing day. Deliberately
    // subtle — felt, not noticed. Phaser cameras have no setTint, so this is a
    // scrollFactor-0 overlay rather than a camera filter.
    this.dayTint = this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(50);

    // --- Slimes ---
    this.spawnSlimes();
    this.physics.add.collider(this.slimeGroup, this.slimeGroup);
    this.physics.add.overlap(
      this.player,
      this.slimeGroup,
      (player, slime) => slime.touchPlayer(),
      null,
      this
    );

    // --- Skeletons (spawn from day 5; group + overlap set up empty now so
    // dynamically-added skeletons damage the player on contact) ---
    this.skeletonGroup = this.physics.add.group();
    this.physics.add.collider(this.skeletonGroup, this.slimeGroup);
    this.physics.add.overlap(
      this.player,
      this.skeletonGroup,
      (player, skeleton) => skeleton.touchPlayer(),
      null,
      this
    );

    // --- Combat systems ---
    this.combatSystem = new CombatSystem(this);
    this.particleSystem = new ParticleSystem(this);
    this.audioSystem = new AudioSystem(this, this.audioSettings);
    this.sound.mute = !!this.audioSettings.muted;

    // --- Projectile pool (Sprint 4 ranged) ---
    this.spawnProjectilePool();

    // --- Plant bundles (Sprint 7) — enemy drops that go straight to the bank ---
    this.bundleGroup = this.physics.add.group();
    this.physics.add.overlap(
      this.player,
      this.bundleGroup,
      (player, bundle) => this.collectBundle(bundle),
      null,
      this
    );

    // --- Hard zone boundary (Sprint 7) — invisible wall enemies can't cross ---
    this.createZoneBoundary();

    // --- Sprint 2 world objects ---
    this.seeds = [];
    this.spawnSeeds();
    this.spawnGardenBeds();
    this.spawnGardenStructures();
    this.spawnProps();
    this.createForestAmbience();

    // --- Sprint 11 world systems ---
    this.createRockFormations(); // physics-collider cover geometry
    this.createWorldDetails(); // examinable storytelling objects
    this.maybeSpawnDailySeed(); // once-a-day glowing gift

    // --- Day timer (extracted system) ---
    this.daySystem = new DaySystem(this, this.gameData);
    this.daySystem.dayNumber = this.saveData.dayNumber || 1;
    // Weather for the current day: restore the saved one, or pick a quiet
    // starting weather on a fresh game (no day-1 wake-up toast). Modifiers apply
    // either way; the HUD icon is pushed in syncHud().
    if (this.saveData.todayWeather) {
      this.daySystem.restoreWeather(this.saveData.todayWeather);
    } else {
      const pool = this.gameData.weather;
      this.daySystem.todayWeather = pool[Math.floor(Math.random() * pool.length)];
    }
    this.applyWeatherEffects(this.daySystem.todayWeather);

    // --- Achievements (Sprint 6) — mounted after daySystem so unlocks can
    // stamp the current day. Driven purely by EventBus events. ---
    this.achievementSystem = new AchievementSystem(this, this.saveData);

    // --- Apply saved upgrades to the freshly-built player ---
    this.applyAllUpgrades();

    // Populate the enemy density appropriate to the loaded day (no-op on day 1).
    this.handleEnemyScaling(this.daySystem.dayNumber);

    // --- Audio ---
    this.setupMusic();

    // --- Interaction input ---
    this.fKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    // M toggles global mute (persisted in settings, applied via the SoundManager).
    this.input.keyboard.on('keydown-M', () => this.toggleMute());

    // --- EventBus wiring ---
    this.subscribe('player:zoneChanged', (d) => this.onZoneChanged(d));
    this.subscribe('player:died', () => this.onPlayerDied());
    this.subscribe('player:damaged', (d) => this.onPlayerDamaged(d));
    this.subscribe('day:timerExpired', () => this.onTimerExpired());
    this.subscribe('day:advanced', (d) => this.onDayAdvanced(d));
    this.subscribe('plant:harvested', (d) => this.onPlantHarvested(d));
    this.subscribe('enemy:died', (d) => this.onEnemyDied(d));
    this.subscribe('seed:collected', (d) => this.onSeedCollected(d));
    this.subscribe('projectile:spawn', (d) => this.firePooledProjectile(d));
    this.subscribe('upgrade:closed', () => this.onUpgradeClosed());
    this.subscribe('upgrade:purchased', (d) => this.onUpgradePurchased(d));
    this.subscribe('player:slept', () => this.onPlayerSlept());

    // --- Win state & New Game+ (Sprint 5) ---
    this.subscribe('win:demo', () => this.openWin('demo'));
    this.subscribe('win:full', () => this.openWin('full'));
    this.subscribe('win:closed', () => this.closeWin());
    this.subscribe('newGamePlus:activated', () => this.onNewGamePlusActivated());

    // --- Achievements & signpost (Sprint 6) ---
    this.subscribe('save:requested', () => this.autoSave());
    this.subscribe('signpost:closed', () => this.onSignpostClosed());

    // --- Enemy drops & swap picker (Sprint 7) ---
    this.subscribe('bundle:collected', (d) => this.onBundleCollected(d));
    this.subscribe('inventory:swapConfirmed', (d) => this.executeSwap(d.dropSlotIndex));
    this.subscribe('inventory:swapCancelled', () => this.onSwapCancelled());

    // --- Weather + retention (Sprint 11) ---
    this.subscribe('weather:changed', (d) => this.onWeatherChanged(d));
    this.subscribe('dictionary:closed', () => { this._dictionaryOpen = false; });
    this.subscribe('worlddetail:closed', () => { this._worldDetailOpen = false; });

    // --- HUD scene ---
    this.scene.launch('UIScene', { dayNumber: this.daySystem.dayNumber });
    // Push the full restored HUD state once UIScene has booted and subscribed.
    this.time.delayedCall(0, () => this.syncHud());

    // --- Developer cheat menu (parallel scene; inert unless dev mode active) ---
    this.scene.launch('DevMenuScene');
    if (isDevModeActive()) this.setupDevHandlers();

    // Seed the initial atmosphere tint for the loaded zone + day.
    this.applyDayTint();

    this.events.once('shutdown', this.shutdown, this);
    this.events.once('destroy', this.shutdown, this);
  }

  // Broadcast all restored state so the HUD reflects the loaded save.
  syncHud() {
    EventBus.emit('day:dayChanged', { day: this.daySystem.dayNumber });
    EventBus.emit('inventory:changed', { slots: [...this.player.seedSlots] });
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
    EventBus.emit('player:statsChanged', {
      maxHP: this.player.maxHP,
      currentHP: this.player.currentHP
    });
    if (this.player.equippedGear.ranged !== null) {
      EventBus.emit('ranged:equipped', {
        ammo: this.player.rangedAmmo,
        max: this.player.rangedAmmoMax
      });
    }
    EventBus.emit('ngplus:status', { active: this.newGamePlus });
    EventBus.emit('audio:muteChanged', { muted: this.audioSettings.muted });
    EventBus.emit('player:waterChanged', {
      charges: this.player.waterCharges,
      capacity: this.player.waterCapacity
    });
    if (this.daySystem && this.daySystem.todayWeather) {
      // Icon-only sync (no wake-up toast) so a reloaded run shows current weather.
      EventBus.emit('weather:changed', { weather: this.daySystem.todayWeather, isNewDay: false });
    }
  }

  // --- Placeholder textures (Sprint 2 additive — leaves BootScene untouched) -

  ensurePlaceholderTextures() {
    if (!this.textures.exists('px_seed')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(7, 7, 7);
      g.generateTexture('px_seed', 14, 14);
      g.destroy();
    }
    if (!this.textures.exists('px_projectile')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xeac34f, 1);
      g.fillRect(0, 0, 8, 4);
      g.generateTexture('px_projectile', 8, 4);
      g.destroy();
    }
  }

  // --- World construction ---------------------------------------------------

  buildWorld() {
    // TODO Sprint 5: replace placeholder geometry with a Tiled map once
    // /assets/tilemaps/world.json exists. The tileSprite branches below already
    // pick up real tileset art automatically when the PNGs land in /assets; the
    // object-layer extraction (seeds/beds/gate/chest/well/sleep) is the remaining
    // work and is deferred until the map is authored in Tiled (mapeditor.org).
    const forestY = GARDEN_ZONE_HEIGHT;
    const forestHeight = WORLD_HEIGHT - GARDEN_ZONE_HEIGHT;

    if (this.textures.exists('tileset_garden')) {
      this.add
        .tileSprite(0, 0, WORLD_WIDTH, GARDEN_ZONE_HEIGHT, 'tileset_garden')
        .setOrigin(0, 0)
        .setDepth(0);
    } else {
      // TODO(asset): tileset_garden.png — solid fill placeholder in use.
      // Garden is a warmer, lighter green than the forest (Sprint 7 polish).
      this.add
        .rectangle(0, 0, WORLD_WIDTH, GARDEN_ZONE_HEIGHT, 0x4a7c3f)
        .setOrigin(0, 0)
        .setDepth(0);
    }

    if (this.textures.exists('tileset_forest')) {
      // Same grass tile as the garden, tinted darker/cooler so the dangerous
      // forest reads distinctly from the safe garden at a glance.
      this.add
        .tileSprite(0, forestY, WORLD_WIDTH, forestHeight, 'tileset_forest')
        .setOrigin(0, 0)
        .setTint(0x5f7a5a)
        .setDepth(0);
    } else {
      // TODO(asset): tileset_forest.png — solid fill placeholder in use.
      // Forest is a darker, cooler green so the zones read at a glance.
      this.add
        .rectangle(0, forestY, WORLD_WIDTH, forestHeight, 0x2d4a2d)
        .setOrigin(0, 0)
        .setDepth(0);
    }

    if (this.textures.exists('tileset_fence')) {
      this.add
        .tileSprite(0, forestY - TILE_SIZE / 2, WORLD_WIDTH, TILE_SIZE, 'tileset_fence')
        .setOrigin(0, 0)
        .setDepth(1);
    } else {
      // TODO(asset): tileset_fence.png — colored boundary line in use.
      // A clearly visible 10px fence line marks the safe-zone boundary.
      this.add
        .rectangle(0, forestY, WORLD_WIDTH, 10, 0xc0904f)
        .setOrigin(0, 0.5)
        .setDepth(1);
    }

    // Fence gate at the garden⇄forest crossing — decorative marker that swings
    // open while the player is in the forest and closes back in the garden
    // (see animateGate, driven by player:zoneChanged).
    if (this.textures.exists('fence_gate')) {
      this.gateSprite = this.add
        .sprite(WORLD_WIDTH / 2, forestY, 'fence_gate', 0)
        .setOrigin(0.5, 0.5)
        .setScale(GATE_SCALE)
        .setDepth(2);
    }

    this.add
      .text(WORLD_WIDTH / 2, GARDEN_ZONE_HEIGHT / 2, 'GARDEN', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '120px',
        fontStyle: 'bold',
        color: '#4f7344'
      })
      .setOrigin(0.5)
      .setAlpha(0.25)
      .setDepth(0);
    this.add
      .text(WORLD_WIDTH / 2, forestY + forestHeight / 2, 'FOREST', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '120px',
        fontStyle: 'bold',
        color: '#24412a'
      })
      .setOrigin(0.5)
      .setAlpha(0.4)
      .setDepth(0);
  }

  setupBounds() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  spawnSlimes() {
    this.slimeGroup = this.physics.add.group();

    const spots = [
      { x: 620, y: 1120 },
      { x: 1580, y: 1320 },
      { x: 2580, y: 1160 },
      { x: 1040, y: 1900 },
      { x: 2240, y: 2040 }
    ];
    spots.forEach((p) => this.spawnSlime('green_slime', p.x, p.y));

    // New Game+ seeds the forest with extra green slimes from day 1 so the run
    // is visibly denser even before day-based scaling kicks in.
    if (this.newGamePlus) {
      const mult = this.gameData.newGamePlus.enemyDensityMult || 1;
      const extra = Math.round(spots.length * (mult - 1));
      for (let i = 0; i < extra; i++) this.spawnSlime('green_slime');
    }
  }

  // Spawn a single slime, optionally at a given position (random forest spot
  // otherwise). Registers it in both the physics group and the unified enemies
  // array. Used by the initial placement and by day-based dark-slime scaling.
  spawnSlime(type, x, y) {
    if (x === undefined || y === undefined) {
      const pos = this.randomForestPosition();
      x = pos.x;
      y = pos.y;
    }
    const slime = new Slime(this, x, y, type, this.gameData);
    if (type === 'dark_slime') {
      slime.setTint(DARK_SLIME_TINT);
      slime._baseTint = DARK_SLIME_TINT; // restored after each white hit-flash
    }
    this.slimeGroup.add(slime);
    this.enemies.push(slime);
    return slime;
  }

  // Normal calls (no args) place a skeleton at a random deep-forest spot. The
  // dev menu passes an explicit position to spawn one at the player.
  spawnSkeleton(devX, devY) {
    const margin = ENEMY_SPAWN_MARGIN;
    const deepMinY = Math.ceil(WORLD_HEIGHT * DEEP_FOREST_THRESHOLD);
    const devSpawn = devX !== undefined && devY !== undefined;
    const baseX = devSpawn ? devX : Phaser.Math.Between(margin, WORLD_WIDTH - margin);
    const baseY = devSpawn ? devY : Phaser.Math.Between(deepMinY, WORLD_HEIGHT - margin);

    // Three patrol waypoints fanned around the spawn point. Normal skeletons keep
    // their patrol in the deep forest; dev-placed ones may patrol the whole
    // forest band around where they were dropped.
    const minY = devSpawn ? GARDEN_ZONE_HEIGHT + margin : deepMinY;
    const clampX = (v) => Phaser.Math.Clamp(v, margin, WORLD_WIDTH - margin);
    const clampY = (v) => Phaser.Math.Clamp(v, minY, WORLD_HEIGHT - margin);
    const s = SKELETON_PATROL_SPREAD;
    const waypoints = [
      { x: clampX(baseX - s), y: clampY(baseY) },
      { x: clampX(baseX + s), y: clampY(baseY - s / 2) },
      { x: clampX(baseX), y: clampY(baseY + s / 2) }
    ];

    const skeleton = new Skeleton(this, baseX, baseY, waypoints, this.gameData);
    this.skeletonGroup.add(skeleton);
    this.enemies.push(skeleton);
    return skeleton;
  }

  randomForestPosition() {
    const margin = ENEMY_SPAWN_MARGIN;
    return {
      x: Phaser.Math.Between(margin, WORLD_WIDTH - margin),
      y: Phaser.Math.Between(GARDEN_ZONE_HEIGHT + margin, WORLD_HEIGHT - margin)
    };
  }

  // --- Zone boundary (Sprint 7) ---------------------------------------------
  // An invisible static wall along the garden/forest line. Enemies collide
  // with it; the player does not, so it's a hard barrier only for slimes and
  // skeletons. Their per-frame confineToForest() clamp remains as a safety net.
  createZoneBoundary() {
    const wall = this.add.rectangle(
      WORLD_WIDTH / 2,
      GARDEN_ZONE_HEIGHT + 8,
      WORLD_WIDTH,
      16,
      0x000000,
      0
    );
    wall.setVisible(false);
    this.physics.add.existing(wall, true); // static body
    this.zoneWall = wall;
    this.physics.add.collider(this.slimeGroup, wall);
    this.physics.add.collider(this.skeletonGroup, wall);
  }

  // --- Plant bundles (Sprint 7) ---------------------------------------------
  // Player overlap: credit the bank directly (bundles skip the grow cycle).
  collectBundle(bundle) {
    if (!bundle || bundle.collected || bundle.collecting) return;
    // Magnet arc (Sprint 9): the bundle flies to the player, then banks on arrival.
    bundle.collectWithArc(this.player, () => {
      const pt = bundle.plantType;
      this.plantBank[pt] = (this.plantBank[pt] || 0) + 1;
      EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
      bundle.collect(); // emits bundle:collected, then self-destructs
    });
  }

  onBundleCollected({ plantType, position }) {
    const plant = this.gameData.plants[plantType];
    const name = plant ? plant.name : plantType;
    EventBus.emit('ui:floatText', {
      x: position.x,
      y: position.y - 10,
      text: `+1 ${name}`,
      color: '#8AB87E'
    });
    if (plant) this.particleSystem.seedCollect(position, plant.color);
  }

  // --- Seeds ----------------------------------------------------------------

  registerSeed(seed) {
    this.seeds.push(seed);
  }

  // Drop a seed from the tracked list when it's destroyed for good (death-drop
  // despawn, daily-special pickup). World seeds respawn in place and are never
  // destroyed mid-run, so they stay registered.
  unregisterSeed(seed) {
    const i = this.seeds.indexOf(seed);
    if (i > -1) this.seeds.splice(i, 1);
  }

  spawnSeeds() {
    // Geographic grouping per design — each entry is a fixed world position and
    // the zone reason it lives there.
    const placements = [
      // red_mushroom ×3 — deep forest, near dark tree clusters (center-left, low)
      ['red_mushroom', 820, 1980],
      ['red_mushroom', 1050, 2180],
      ['red_mushroom', 640, 2080],
      // blue_flower ×2 — water/stream area, forest bottom-left
      ['blue_flower', 340, 2250],
      ['blue_flower', 560, 2360],
      // golden_wheat ×3 — open clearing, spread out, lower tree density (mid)
      ['golden_wheat', 1820, 1480],
      ['golden_wheat', 2120, 1640],
      ['golden_wheat', 2440, 1460],
      // green_herb ×2 — near forest entrance, just past the garden gate (shallow)
      ['green_herb', 1280, 920],
      ['green_herb', 1920, 980],
      // glowshroom ×2 — deepest forest, far from the garden gate (bottom-right)
      ['glowshroom', 2900, 2250],
      ['glowshroom', 2680, 2360],
      // sunflower ×3 — open meadow patches, mid-forest
      ['sunflower', 2240, 1880],
      ['sunflower', 720, 1500],
      ['sunflower', 1600, 1720]
    ];
    placements.forEach(([type, x, y]) => new Seed(this, x, y, type, this.gameData));
  }

  updateSeeds() {
    let candidate = null;
    let candidateDist = Infinity;
    const collectRange = this.getHarvestRange();

    for (const seed of this.seeds) {
      if (!seed.active || seed.collected || seed.collecting) continue;
      seed.updateProximity(this.player);
      if (!seed.collectible) continue;

      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        seed.x,
        seed.y
      );
      if (d > collectRange) continue;

      if (this.player.hasEmptySlot()) {
        this.beginSeedCollect(seed);
      } else if (d < candidateDist) {
        candidateDist = d;
        candidate = seed;
      }
    }

    // Drop a snooze once the player walks off the seed they cancelled on.
    if (this._swapSnoozedSeed) {
      const s = this._swapSnoozedSeed;
      const sd = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y);
      if (!s.active || s.collected || sd > collectRange) this._swapSnoozedSeed = null;
    }
    if (candidate && candidate === this._swapSnoozedSeed) candidate = null;

    this.handleSwapPicker(candidate);
  }

  // Magnet collect (Sprint 9): arc the seed onto the player, then add it to
  // inventory on arrival. The add is deferred to arrival so the seed:collected
  // particles + sfx fire where the seed lands. If the slot was claimed by another
  // arriving seed in the same window, re-arm the seed instead of dropping it.
  beginSeedCollect(seed) {
    seed.collectWithArc(this.player, () => {
      if (!this.player.addSeed(seed.plantType)) {
        seed.cancelArc();
        return;
      }
      const recovered = seed.isDespawning;
      const wasDaily = seed.isDailySpecial;
      seed.collect();
      EventBus.emit('seed:collected', {
        plantType: seed.plantType,
        position: { x: seed.x, y: seed.y }
      });
      if (recovered) EventBus.emit('seed:recovered', { plantType: seed.plantType });
      if (wasDaily) this.markDailySeedCollected();
    });
  }

  // Full inventory near a collectible seed → show the swap picker (Sprint 7,
  // replacing the old FIFO auto-drop). The player chooses which slot to drop.
  handleSwapPicker(candidate) {
    if (this._swapPickerOpen) {
      const s = this._swapCandidate;
      if (!s || !s.active || s.collected) {
        this.closeSwapPicker(true);
        return;
      }
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y);
      if (d > SWAP_TIMEOUT_DIST) this.closeSwapPicker(true); // walked away → cancel
      return;
    }

    if (candidate) {
      this._swapCandidate = candidate;
      this._swapPickerOpen = true;
      EventBus.emit('inventory:swapRequested', {
        slots: [...this.player.seedSlots],
        newPlantType: candidate.plantType
      });
    }
  }

  // dropSlotIndex chosen by the player in UIScene.
  executeSwap(dropSlotIndex) {
    const seed = this._swapCandidate;
    this._swapPickerOpen = false;
    if (!seed || !seed.active || seed.collected) {
      this._swapCandidate = null;
      return;
    }
    const slots = this.player.seedSlots;
    if (dropSlotIndex < 0 || dropSlotIndex >= slots.length || slots[dropSlotIndex] === null) {
      this._swapCandidate = null;
      return;
    }
    const recovered = seed.isDespawning;
    const wasDaily = seed.isDailySpecial;
    const dropped = this.player.dropSeed(dropSlotIndex); // chosen seed lands at the player's feet
    this.player.addSeed(seed.plantType); // fills the freed slot
    seed.collect();
    EventBus.emit('seed:collected', {
      plantType: seed.plantType,
      position: { x: seed.x, y: seed.y }
    });
    if (recovered) EventBus.emit('seed:recovered', { plantType: seed.plantType });
    if (wasDaily) this.markDailySeedCollected();
    this._swapCandidate = null;
    // Don't immediately re-prompt a swap for the seed we just dropped at our feet.
    this._swapSnoozedSeed = dropped;
  }

  // Player pressed Cancel in the picker — snooze this seed so it doesn't
  // immediately reopen, and leave the new seed uncollected.
  onSwapCancelled() {
    this._swapSnoozedSeed = this._swapCandidate;
    this._swapCandidate = null;
    this._swapPickerOpen = false;
  }

  // Close the picker from the GameScene side (timeout / seed gone). When
  // `snooze` is set the seed is remembered so it doesn't instantly reopen.
  closeSwapPicker(snooze) {
    if (snooze) this._swapSnoozedSeed = this._swapCandidate;
    this._swapCandidate = null;
    this._swapPickerOpen = false;
    EventBus.emit('inventory:swapClosed', {});
  }

  // --- Garden beds & structures ---------------------------------------------

  spawnGardenBeds() {
    this.beds = [];
    const savedBeds = (this.saveData && this.saveData.gardenBeds) || [];
    // At least the original 4 beds; more if a satchel save grew the garden.
    const count = Math.max(4, savedBeds.length);
    for (let i = 0; i < count; i++) {
      const pos = this.bedPosition(i);
      const bed = new GardenBed(this, pos.x, pos.y, i, this.gameData);
      if (savedBeds[i]) bed.restore(savedBeds[i]);
      this.beds.push(bed);
    }
  }

  // Beds fill a row left-to-right, wrapping to a new row every BEDS_PER_ROW.
  // Index 0–3 reproduce the original Sprint 2 positions exactly.
  bedPosition(i) {
    const col = i % BEDS_PER_ROW;
    const row = Math.floor(i / BEDS_PER_ROW);
    return { x: BED_BASE_X + col * BED_COL_GAP, y: BED_BASE_Y + row * BED_ROW_GAP };
  }

  addGardenBed() {
    const i = this.beds.length;
    const pos = this.bedPosition(i);
    this.beds.push(new GardenBed(this, pos.x, pos.y, i, this.gameData));
  }

  spawnGardenStructures() {
    // Interactive-structure labels are hidden until the player is close (Sprint 8
    // polish) — registered here and toggled by updateStructureLabels().
    this._structureLabels = [];

    // Well — fill the watering can here. Real Sprout Lands well sprite when the
    // art is present (Sprint 10), else the Sprint 2 placeholder rectangle.
    if (this.textures.exists('obj_well')) {
      this.well = this.add.image(1050, 360, 'obj_well').setScale(2).setDepth(2);
    } else {
      this.well = this.add
        .rectangle(1050, 360, 50, 50, 0x3b6ea5)
        .setStrokeStyle(3, 0x244a6e)
        .setDepth(2);
    }
    this.addStructureLabel(1050, 360, 1050, 320, 'WELL', '#ABC4DE');

    // Sleep bed — advance the day. Uses a bed slice from the Sprout Lands
    // Basic_Furniture sheet when present; the crop region is a best fit and can be
    // nudged (x/y/w/h below) if it lands off the bed.
    if (this.textures.exists('furniture_sheet')) {
      const furnTex = this.textures.get('furniture_sheet');
      if (!furnTex.has('bed')) furnTex.add('bed', 0, 0, 48, 64, 48);
      this.sleepObject = this.add
        .image(2150, 360, 'furniture_sheet', 'bed')
        .setDisplaySize(96, 72)
        .setDepth(2);
    } else {
      this.sleepObject = this.add
        .rectangle(2150, 360, 72, 48, 0x8a5a3a)
        .setStrokeStyle(3, 0x5a3a22)
        .setDepth(2);
    }
    this.addStructureLabel(2150, 360, 2150, 318, 'SLEEP  [F]', '#EDD49A');

    // Workshop chest — open the upgrade overlay. Real chest sprite (48x48 sheet
    // with open frames) when present; the Sprint 9 open animation frame-swaps
    // instead of the scaleY tween in that case.
    this._chestIsSprite = this.textures.exists('obj_chest');
    if (this._chestIsSprite) {
      this.chest = this.add
        .sprite(CHEST_X, CHEST_Y, 'obj_chest', CHEST_CLOSED_FRAME)
        .setScale(1.5)
        .setDepth(2);
    } else {
      this.chest = this.add
        .rectangle(CHEST_X, CHEST_Y, 64, 48, 0x6e4a22)
        .setStrokeStyle(3, 0xd4a83f)
        .setDepth(2);
    }
    this.addStructureLabel(CHEST_X, CHEST_Y, CHEST_X, CHEST_Y - 38, 'WORKSHOP  [F]', '#EDD49A');

    // Signpost — open the achievement log. Placed near the chest but well
    // outside its interaction radius so the two never overlap.
    const SIGN_X = 1480;
    const SIGN_Y = 560;
    if (this.textures.exists('signs')) {
      // Sprout Lands sign board (frame 0), scaled up from its 16px source.
      this.signpost = this.add.sprite(SIGN_X, SIGN_Y, 'signs', 0).setScale(3).setDepth(2);
    } else {
      this.add.rectangle(SIGN_X, SIGN_Y + 14, 8, 40, 0x6e4a22).setDepth(2); // post
      this.signpost = this.add
        .rectangle(SIGN_X, SIGN_Y - 8, 48, 30, 0x8a6a3a)
        .setStrokeStyle(2, 0x5a3a22)
        .setDepth(2);
    }
    this.addStructureLabel(SIGN_X, SIGN_Y, SIGN_X, SIGN_Y - 36, 'LOG  [F]', '#EDD49A');

    // Field Notes book (Sprint 11) — opens the Seed Dictionary. Distinct blue
    // book on a stand, set apart from the signpost and the bed grid.
    const BOOK_X = 1340;
    const BOOK_Y = 560;
    this.add.rectangle(BOOK_X, BOOK_Y + 14, 8, 36, 0x6e4a22).setDepth(2); // stand
    this.book = this.add
      .rectangle(BOOK_X, BOOK_Y - 8, 30, 22, 0x395a7a)
      .setStrokeStyle(2, 0xabc4de)
      .setDepth(2);
    this.addStructureLabel(BOOK_X, BOOK_Y, BOOK_X, BOOK_Y - 34, 'FIELD NOTES  [F]', '#ABC4DE');
  }

  // Register a structure label (hidden by default; revealed within
  // PROXIMITY_LABEL_DIST of the structure at (sx, sy)).
  addStructureLabel(sx, sy, lx, ly, text, color) {
    const t = this.add
      .text(lx, ly, text, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '14px',
        color,
        backgroundColor: 'rgba(20,18,16,0.7)',
        padding: { x: 4, y: 2 }
      })
      .setOrigin(0.5, 1)
      .setDepth(20)
      .setVisible(false);
    this._structureLabels.push({ t, sx, sy });
  }

  updateStructureLabels() {
    if (!this._structureLabels) return;
    for (const { t, sx, sy } of this._structureLabels) {
      const near =
        Phaser.Math.Distance.Between(this.player.x, this.player.y, sx, sy) <=
        PROXIMITY_LABEL_DIST;
      if (t.visible !== near) t.setVisible(near);
    }
  }

  // --- Contextual F prompt (Sprint 9) ---------------------------------------
  // Each frame, find the single nearest interactable in range and push a fully
  // resolved prompt to the HUD. Nearest wins; informational states (no [F])
  // render greyed. Events are deduped so the HUD only updates on change.
  updateInteractPrompt() {
    const p = this.player;
    let best = null;
    let bestDist = Infinity;

    const consider = (obj, range, build) => {
      if (!obj) return;
      const d = Phaser.Math.Distance.Between(p.x, p.y, obj.x, obj.y);
      if (d > range || d >= bestDist) return;
      const info = build();
      if (info) {
        best = info;
        bestDist = d;
      }
    };

    consider(this.chest, INTERACT_RANGE, () => ({ text: '[F] Open Workshop', actionable: true }));
    consider(this.signpost, INTERACT_RANGE, () => ({ text: '[F] View achievements', actionable: true }));
    consider(this.sleepObject, INTERACT_RANGE, () => ({
      text: `[F] Sleep — advance to Day ${this.daySystem.dayNumber + 1}`,
      actionable: true
    }));
    consider(this.well, INTERACT_RANGE, () => this.wellPrompt());
    consider(this.book, INTERACT_RANGE, () => ({ text: '[F] Read Field Notes', actionable: true }));

    const bed = this.nearestBed(INTERACT_RANGE);
    if (bed) consider(bed, INTERACT_RANGE, () => this.bedPrompt(bed));

    const wd = this.nearestWorldDetail(INTERACT_RANGE);
    if (wd) consider(wd, INTERACT_RANGE, () => ({ text: '[F] Examine', actionable: true }));

    if (best) {
      if (best.text !== this._lastPromptText) {
        this._lastPromptText = best.text;
        EventBus.emit('interact:nearObject', { text: best.text, actionable: best.actionable });
      }
    } else if (this._lastPromptText !== null) {
      this._lastPromptText = null;
      EventBus.emit('interact:leftObject', {});
    }
  }

  wellPrompt() {
    if (this.player.waterCharges < this.player.waterCapacity) {
      return { text: '[F] Fill watering can', actionable: true };
    }
    return { text: 'Watering can full ✓', actionable: false };
  }

  bedPrompt(bed) {
    if (bed.isReady()) {
      return { text: `[F] Harvest ${this.plantName(bed.plantType)}`, actionable: true };
    }
    if (bed.isEmpty()) {
      const idx = this.player.getOldestSeed();
      if (idx === -1) return { text: 'Need a seed to plant', actionable: false };
      return { text: `[F] Plant ${this.plantName(this.player.seedSlots[idx])}`, actionable: true };
    }
    // Growing / planted.
    const days = Math.ceil(bed.daysRemaining);
    const dayWord = days === 1 ? 'day' : 'days';
    if (bed.watered) return { text: 'Watered today ✓', actionable: false };
    if (this.player.waterCharges > 0) {
      return { text: `[F] Water — ${days} ${dayWord} left`, actionable: true };
    }
    return { text: `${days} ${dayWord} remaining`, actionable: false };
  }

  plantName(plantType) {
    const plant = this.gameData.plants[plantType];
    return plant ? plant.name : plantType;
  }

  // --- Decorative props (Sprint 8) ------------------------------------------
  // Static, non-interactive decor scattered across both zones. Drawn above the
  // ground/fence (depth 2) but below seeds, enemies and the player. No-op until
  // props_decor.png is present (BootScene only loads files that exist on disk).
  spawnProps() {
    if (!this.textures.exists('props_decor')) return;
    const FRAMES = [0, 1, 2, 3, 4, 5]; // row 0 of the sheet — small mushrooms
    const SCALE = 2;
    const frameAt = (i) => FRAMES[i % FRAMES.length];

    // Garden decor — positions kept clear of beds, well, sleep, chest, signpost
    // and the player's spawn point.
    const gardenSpots = [
      [250, 180], [420, 520], [700, 250], [900, 620], [180, 660],
      [2500, 200], [2750, 480], [2950, 660], [2400, 640], [320, 400]
    ];
    gardenSpots.forEach(([x, y], i) => {
      this.add.image(x, y, 'props_decor', frameAt(i)).setScale(SCALE).setDepth(2);
    });

    // Forest decor (Sprint 10 enrichment) — denser scatter across the whole
    // forest band. Skip any spot within 40px of a seed spawn.
    const forestSpots = [
      // shallow forest, near the gate
      [1100, 1100], [1500, 1200], [2000, 1150], [2600, 1050], [450, 1300],
      // mid forest
      [900, 1700], [1300, 1450], [2300, 1300], [2800, 1500], [500, 1900],
      [1900, 1600], [2450, 1700], [700, 1600], [1600, 1900], [2150, 1450],
      // deep forest
      [1700, 2000], [2150, 2150], [2550, 1900], [1000, 2350], [1400, 2250],
      [600, 2200], [2750, 2100], [1850, 2300], [2400, 2300]
    ];
    forestSpots.forEach(([x, y], i) => {
      const tooClose = this.seeds.some(
        (s) => Phaser.Math.Distance.Between(x, y, s.x, s.y) < 40
      );
      if (tooClose) return;
      this.add.image(x, y, 'props_decor', frameAt(i + 3)).setScale(SCALE).setDepth(2);
    });

    // Mushroom clusters as a geographic hint near the glowshroom seed spawns
    // (deep forest, bottom-right). Tight rings of the small-mushroom frames.
    const glowshroomZones = [[2900, 2250], [2680, 2360]];
    glowshroomZones.forEach(([cx, cy]) => {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const mx = cx + Math.cos(a) * 70;
        const my = cy + Math.sin(a) * 55;
        const tooClose = this.seeds.some(
          (s) => Phaser.Math.Distance.Between(mx, my, s.x, s.y) < 40
        );
        if (tooClose) continue;
        this.add.image(mx, my, 'props_decor', frameAt(i)).setScale(SCALE).setDepth(2);
      }
    });
  }

  // --- Forest ambience (Sprint 10) ------------------------------------------
  // Sparse drifting motes over the forest, using the Mystic Woods dust particle
  // sheet. Pure atmosphere — barely noticeable. No-op if the sheet is absent.
  // (No far/parallax background art shipped in the packs, so 3A is skipped.)
  createForestAmbience() {
    if (!this.textures.exists('fx_dust')) return;
    this.add.particles(0, 0, 'fx_dust', {
      frame: [0, 1, 2, 3],
      x: { min: 0, max: WORLD_WIDTH },
      y: GARDEN_ZONE_HEIGHT,
      speedY: { min: 15, max: 35 },
      speedX: { min: -15, max: 15 },
      angle: { min: 0, max: 360 },
      rotate: { min: 0, max: 360 },
      scale: { min: 0.6, max: 1.2 },
      alpha: { start: 0.6, end: 0 },
      lifespan: { min: 4000, max: 7000 },
      frequency: 700, // ~one mote at a time — very sparse
      quantity: 1
    }).setDepth(8);
  }

  // --- Interaction (F key) --------------------------------------------------

  within(obj, range) {
    return (
      Phaser.Math.Distance.Between(this.player.x, this.player.y, obj.x, obj.y) <
      range
    );
  }

  nearestBed(range) {
    let best = null;
    let bestDist = range;
    for (const bed of this.beds) {
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        bed.x,
        bed.y
      );
      if (d < bestDist) {
        bestDist = d;
        best = bed;
      }
    }
    return best;
  }

  handleInteract() {
    // Priority: chest > sleep > well > garden bed > seed swap. Objects are
    // spatially separated so only one is ever in range, but ordering keeps it
    // deterministic.
    if (this.chest && this.within(this.chest, INTERACT_RANGE)) {
      this.openUpgrade();
      return;
    }
    if (this.signpost && this.within(this.signpost, INTERACT_RANGE)) {
      this.openSignpost();
      return;
    }
    if (this.book && this.within(this.book, INTERACT_RANGE)) {
      this.openSeedDict();
      return;
    }
    if (this.sleepObject && this.within(this.sleepObject, INTERACT_RANGE)) {
      this.sleep();
      return;
    }
    if (this.well && this.within(this.well, INTERACT_RANGE)) {
      this.getWater();
      return;
    }
    const bed = this.nearestBed(INTERACT_RANGE);
    if (bed && this.interactBed(bed)) return;

    // Lowest priority: examine a forest world-detail object (Sprint 11).
    const detail = this.nearestWorldDetail(INTERACT_RANGE);
    if (detail) this.openWorldDetail(detail);
  }

  interactBed(bed) {
    if (bed.isReady()) {
      bed.harvest();
      return true;
    }
    if (bed.isEmpty()) {
      const idx = this.player.getOldestSeed();
      if (idx === -1) return false;
      const plantType = this.player.removeSeedAt(idx);
      bed.plant(plantType);
      return true;
    }
    if (bed.isGrowing() && this.player.waterCharges > 0) {
      this.waterBedsFrom(bed);
      this.player.useWater(); // spend one charge (multi-bed soak still costs one)
      return true;
    }
    return false;
  }

  // Water the targeted bed, plus extra growing beds up to the can's bedsPerUse
  // (Sprint 4 watering-can upgrade — golden can soaks the whole garden). The
  // can tier rides along so each bed rolls the Sprint 9 acceleration odds.
  waterBedsFrom(primary) {
    const canTier = this.player.getWateringCanTier();
    const bonus = this._weatherAccelBonus; // Bright Sun adds accelerate chance
    const perUse = this.player.wateringCan.bedsPerUse || 1;
    primary.water(canTier, bonus);
    let watered = 1;
    if (perUse > 1) {
      for (const bed of this.beds) {
        if (watered >= perUse) break;
        if (bed !== primary && bed.isGrowing() && !bed.watered) {
          bed.water(canTier, bonus);
          watered++;
        }
      }
    }
  }

  getWater() {
    if (this.player.waterCharges >= this.player.waterCapacity) return;
    this.player.fillWater();
  }

  // --- Weather (Sprint 11) --------------------------------------------------

  onWeatherChanged({ weather }) {
    this.applyWeatherEffects(weather);
    // UIScene owns the wake-up toast + persistent HUD icon.
  }

  // Reset the day-scoped modifiers, then set the one this weather drives. The
  // cloudy growth penalty is applied at the next night (see onDayAdvanced) so
  // it is intentionally not toggled here.
  applyWeatherEffects(weather) {
    this.weatherDetectMult = 1;
    this.weatherRespawnMult = 1;
    this._weatherAccelBonus = 0;
    if (!weather) return;
    switch (weather.effect) {
      case 'growthPenalty':
        this._pendingGrowthPenalty = true;
        break;
      case 'freeWater':
        this.applyFreeWater();
        break;
      case 'growthBonus':
        this._weatherAccelBonus = weather.value;
        break;
      case 'enemyDetectMult':
        this.weatherDetectMult = weather.value;
        break;
      case 'respawnMult':
        this.weatherRespawnMult = weather.value;
        break;
      default:
        break;
    }
  }

  // Rain: every growing bed gets watered overnight for free (still rolls the
  // Sprint 9 accelerate/double checks).
  applyFreeWater() {
    if (!this.beds) return;
    const canTier = this.player.getWateringCanTier();
    this.beds.forEach((bed) => {
      if (bed.isGrowing() && !bed.watered) bed.water(canTier, this._weatherAccelBonus);
    });
  }

  // --- World details (Sprint 11) --------------------------------------------

  createWorldDetails() {
    this.worldDetails = [];
    // Fixed forest placements, each ≥100px from seed spawns and off the paths.
    const defs = [
      {
        x: 1350, y: 1000, frame: 0,
        title: 'An Old Marker',
        text: "A weathered post, half-rotted into the soil. Something is carved into the wood — initials, maybe, or a tally. It's been here longer than the overgrowth."
      },
      {
        x: 380, y: 2120, frame: 1,
        title: 'Stacked Stones',
        text: 'Seven flat stones balanced deliberately beside the stream. Someone took care with this. The moss on the bottom stone is years old.'
      },
      {
        x: 1000, y: 2350, frame: 2,
        title: 'A Fallen Giant',
        text: 'The tree came down in a storm — the root ball still half-raised from the earth, trailing soil like a torn hem. New saplings already grow from the trunk.'
      },
      {
        x: 2600, y: 2050, frame: 3,
        title: 'Something Buried',
        text: "A flat stone lies flush with the ground, deliberate in a way natural stones aren't. Whatever was placed here was placed with intention."
      },
      {
        x: 2780, y: 2180, frame: 4,
        title: 'A Rusted Can',
        text: 'A watering can, orange with rust, wedged between two roots. The spout still points at a patch of earth where nothing grows anymore.'
      }
    ];
    defs.forEach((d) => {
      this.worldDetails.push(
        new WorldDetail(this, d.x, d.y, {
          sprite: 'props_decor',
          frame: d.frame,
          scale: 2,
          range: 56,
          title: d.title,
          text: d.text
        })
      );
    });
  }

  nearestWorldDetail(range) {
    if (!this.worldDetails) return null;
    let best = null;
    let bestDist = range;
    for (const d of this.worldDetails) {
      const dist = d.distanceTo(this.player);
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  // Non-modal popup — the world keeps running; UIScene auto-closes it after 6s
  // or on Esc, then emits worlddetail:closed.
  openWorldDetail(detail) {
    if (this._worldDetailOpen) return;
    this._worldDetailOpen = true;
    EventBus.emit('worlddetail:opened', {
      title: detail.config.title,
      text: detail.config.text
    });
  }

  // --- Rock formations (Sprint 11) ------------------------------------------
  // Static collider clusters that create cover geometry. Generated rock texture
  // (no confidently-sliceable rock sprite in the packs — see CREDITS TODO).
  createRockFormations() {
    if (!this.textures.exists('px_rock')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x6b6660, 1);
      g.fillRoundedRect(1, 5, 26, 21, 8);
      g.fillStyle(0x847d74, 1);
      g.fillRoundedRect(5, 2, 15, 12, 6);
      g.lineStyle(2, 0x47443f, 1);
      g.strokeRoundedRect(1, 5, 26, 21, 8);
      g.generateTexture('px_rock', 28, 28);
      g.destroy();
    }

    this.rockGroup = this.physics.add.staticGroup();
    const formations = [
      { x: 800, y: GARDEN_ZONE_HEIGHT + 400, count: 3 },
      { x: 2400, y: GARDEN_ZONE_HEIGHT + 800, count: 4 },
      { x: 1200, y: GARDEN_ZONE_HEIGHT + 1200, count: 3 },
      { x: 2800, y: GARDEN_ZONE_HEIGHT + 600, count: 5 }
    ];
    formations.forEach(({ x, y, count }) => {
      for (let i = 0; i < count; i++) {
        const rx = x + (Math.random() - 0.5) * 120;
        const ry = y + (Math.random() - 0.5) * 80;
        // Keep rocks off seed spawns so nothing becomes uncollectible.
        const tooClose = this.seeds.some(
          (s) => Phaser.Math.Distance.Between(rx, ry, s.x, s.y) < 60
        );
        if (tooClose) continue;
        const rock = this.rockGroup.create(rx, ry, 'px_rock');
        rock.setScale(1.6).setDepth(3);
        rock.refreshBody();
      }
    });

    // Player and both enemy groups route around rocks (chase geometry).
    this.physics.add.collider(this.player, this.rockGroup);
    this.physics.add.collider(this.slimeGroup, this.rockGroup);
    this.physics.add.collider(this.skeletonGroup, this.rockGroup);
  }

  // --- Daily special seed (Sprint 11) ---------------------------------------

  maybeSpawnDailySeed() {
    const today = new Date().toDateString();
    if (this._dailySeedCollected === today) return; // already claimed today
    this.spawnDailySpecialSeed();
  }

  spawnDailySpecialSeed() {
    const dateStr = new Date().toDateString();
    const hash = dateStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const x = 400 + (hash % (WORLD_WIDTH - 800));
    const y = GARDEN_ZONE_HEIGHT + 600 + (hash % (WORLD_HEIGHT - GARDEN_ZONE_HEIGHT - 800));
    const rarePlants = ['glowshroom', 'green_herb', 'glowshroom', 'green_herb', 'blue_flower'];
    const plantType = rarePlants[hash % rarePlants.length];

    const seed = new Seed(this, x, y, plantType, this.gameData);
    seed.setScale(SEED_SCALE * 1.4); // 1.4x bigger than a normal seed so the daily gift stands out
    seed.isDailySpecial = true;
    seed.nameTagOverride = "✨ Today's Gift";
    this._dailySeed = seed;

    // Pulsing glow so it reads as special at a distance.
    this.tweens.add({
      targets: seed,
      alpha: 0.6,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  markDailySeedCollected() {
    this._dailySeedCollected = new Date().toDateString();
    this.saveData.dailySeedCollected = this._dailySeedCollected;
    this._dailySeed = null;
    this.autoSave();
  }

  // First forest entry each day teases the special seed (once per day).
  maybeDailySeedToast() {
    const today = new Date().toDateString();
    if (this._dailySeedToastShown === today) return;
    if (this._dailySeedCollected === today) return;
    if (!this._dailySeed || !this._dailySeed.active) return;
    this._dailySeedToastShown = today;
    this.saveData.dailySeedToastShown = today;
    EventBus.emit('ui:notice', {
      text: '✨ A special seed has appeared somewhere in the forest today.'
    });
    this.autoSave();
  }

  // --- Seed dictionary (Sprint 11) ------------------------------------------

  discoverPlant(plantType) {
    if (!plantType || this.discoveredPlants.includes(plantType)) return;
    this.discoveredPlants.push(plantType);
    EventBus.emit('dictionary:newEntry', { plantType });
    this.autoSave();
  }

  openSeedDict() {
    if (this._dictionaryOpen) return;
    this._dictionaryOpen = true;
    this.player.setVelocity(0, 0);
    if (this._swapPickerOpen) this.closeSwapPicker(false);
    this.scene.launch('SeedDictScene');
    this.scene.bringToTop('SeedDictScene');
  }

  sleep() {
    if (this._sleeping) return;
    this._sleeping = true;

    this.player.setVelocity(0, 0);
    GameState.transition('PAUSED'); // halts the update loop
    this.physics.pause(); // freeze all bodies during the fade
    if (this._swapPickerOpen) this.closeSwapPicker(false);

    this.cameras.main.fadeOut(SLEEP_FADE_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.daySystem.advanceDay(); // dayNumber++, refill timer, emit day:advanced
      this.player.healToFull(); // emits player:healed → UIScene updates
      // player:slept triggers onPlayerSlept → ammo refill + auto-save to the slot.
      EventBus.emit('player:slept', { dayNumber: this.daySystem.dayNumber });

      GameState.transition('PLAYING');
      this.physics.resume();
      // Timer stays paused until the player re-enters the forest.
      this.daySystem.setTimerActive(false);

      this.cameras.main.fadeIn(SLEEP_FADE_MS, 0, 0, 0);
      this._sleeping = false;
    });
  }

  // --- Audio ----------------------------------------------------------------

  // Effective music volume = master × music (from save settings).
  musicVol() {
    return (this.audioSettings.masterVolume ?? 1) * (this.audioSettings.musicVolume ?? 0.5);
  }

  setupMusic() {
    this.bgm = {};
    this.currentBgmKey = null;

    ['bgm_garden', 'bgm_forest'].forEach((key) => {
      if (this.cache.audio.exists(key)) {
        this.bgm[key] = this.sound.add(key, { loop: true, volume: 0 });
      }
    });

    if (this.bgm.bgm_garden) {
      this.bgm.bgm_garden.play();
      this.tweens.add({ targets: this.bgm.bgm_garden, volume: this.musicVol(), duration: 800 });
      this.currentBgmKey = 'bgm_garden';
    } else {
      console.log('[audio] bgm_garden not placed — garden music skipped');
    }
  }

  crossfadeTo(key) {
    const target = this.bgm[key];
    if (!target) {
      console.log(`[audio] ${key} not placed — music crossfade skipped`);
      return;
    }
    Object.entries(this.bgm).forEach(([k, snd]) => {
      if (k !== key && snd.isPlaying) {
        this.tweens.add({
          targets: snd,
          volume: 0,
          duration: 800,
          onComplete: () => snd.stop()
        });
      }
    });
    if (!target.isPlaying) target.play();
    this.tweens.add({ targets: target, volume: this.musicVol(), duration: 800 });
    this.currentBgmKey = key;
  }

  toggleMute() {
    this.audioSettings.muted = !this.audioSettings.muted;
    this.sound.mute = this.audioSettings.muted;
    EventBus.emit('audio:muteChanged', { muted: this.audioSettings.muted });
    this.autoSave();
  }

  // --- EventBus reactions ---------------------------------------------------

  subscribe(event, handler) {
    EventBus.on(event, handler);
    this._busHandlers.push([event, handler]);
  }

  onZoneChanged({ zone }) {
    this.currentZone = zone;
    this.applyDayTint();
    this.animateGate(zone);
    // The gate chime is played by AudioSystem on 'player:zoneChanged'.
    this.crossfadeTo(zone === 'forest' ? 'bgm_forest' : 'bgm_garden');
    // Timer counts only in the forest, and never restarts once already expired.
    this.daySystem.setTimerActive(zone === 'forest' && this.daySystem.timerRemaining > 0);
    // First forest entry of the day teases the daily special seed.
    if (zone === 'forest') this.maybeDailySeedToast();
    // Auto-save whenever the player reaches the safety of the garden.
    if (zone === 'garden') this.autoSave();
  }

  onPlayerSlept() {
    this.player.restoreAmmo(); // refill ranged ammo each new day
    this.autoSave();
  }

  // Swing the boundary gate: edge-on (narrow) while in the forest, full width
  // (closed) back in the garden. No-op until the fence_gate art is present.
  animateGate(zone) {
    if (!this.gateSprite) return;
    this.tweens.killTweensOf(this.gateSprite);
    this.tweens.add({
      targets: this.gateSprite,
      scaleX: zone === 'forest' ? GATE_SCALE * 0.2 : GATE_SCALE,
      duration: 200,
      ease: 'Quad.easeOut'
    });
  }

  onTimerExpired() {
    if (this._postTimerApplied) return;
    this._postTimerApplied = true;
    const { postTimerSpeedMult, postTimerDamageMult } = this.gameData.daySystem;
    // Only slimes carry the day-timer buff (skeletons skip applyPostTimer).
    this.enemies.forEach((e) => {
      if (e.applyPostTimer) e.applyPostTimer(postTimerSpeedMult, postTimerDamageMult);
    });
  }

  onDayAdvanced(d) {
    // A fresh day clears the post-timer slime buffs.
    if (this._postTimerApplied) {
      this.enemies.forEach((e) => {
        if (e.resetPostTimer) e.resetPostTimer();
      });
      this._postTimerApplied = false;
    }
    // Cloudy weather (selected the previous morning) negates the night's growth:
    // beds have already ticked -1 above (GardenBed listens first), so add 1 back.
    if (this._pendingGrowthPenalty) {
      this._pendingGrowthPenalty = false;
      this.beds.forEach((bed) => {
        if (bed.isGrowing()) {
          bed.daysRemaining += 1;
          bed.refreshDaysText();
        }
      });
    }
    this.handleEnemyScaling(d ? d.dayNumber : this.daySystem.dayNumber);
    this.applyDayTint(); // deepen the atmosphere a touch with the new day
  }

  // Atmosphere wash that intensifies with the day count. Garden trends warm
  // amber; forest trends cool blue-grey and a little stronger, so the deeper
  // into a run the more the forest reads as threatening.
  applyDayTint() {
    if (!this.dayTint) return;
    const day = this.daySystem ? this.daySystem.dayNumber : 1;
    if (this.currentZone === 'garden') {
      const a = Math.min(day * 0.008, 0.06);
      this.dayTint.setFillStyle(0xffb866).setAlpha(a);
    } else {
      const a = Math.min(day * 0.01, 0.08);
      this.dayTint.setFillStyle(0x4a5a82).setAlpha(a);
    }
  }

  // Day-based enemy scaling: dark slimes ramp in from day 3 (one more every two
  // days, capped); a single skeleton patrols the deep forest from day 5 on.
  handleEnemyScaling(dayNumber) {
    const scaling = this.gameData.enemies.scaling;
    // New Game+ multiplies dark-slime density and raises the cap proportionally.
    const mult = this.newGamePlus ? this.gameData.newGamePlus.enemyDensityMult || 1 : 1;

    if (dayNumber >= scaling.startDay_darkSlime) {
      const cap = Math.ceil(MAX_DARK_SLIMES * mult);
      const base = Math.floor((dayNumber - scaling.startDay_darkSlime) / 2) + 1;
      const wantCount = Math.min(cap, Math.floor(base * mult));
      const have = this.enemies.filter((e) => e.slimeType === 'dark_slime').length;
      for (let i = 0; i < wantCount - have; i++) {
        this.spawnSlime('dark_slime');
      }
    }

    if (dayNumber >= scaling.startDay_skeleton) {
      if (!this.enemies.some((e) => e instanceof Skeleton)) {
        this.spawnSkeleton();
      }
    }
  }

  onPlantHarvested({ plantType, position, yield: harvestYield = 1 }) {
    const amount = harvestYield || 1; // double-harvested beds yield 2 (Sprint 9)
    if (this.plantBank[plantType] === undefined) this.plantBank[plantType] = 0;
    this.plantBank[plantType] += amount;
    if (this.plantsGrownEver[plantType] === undefined) this.plantsGrownEver[plantType] = 0;
    this.plantsGrownEver[plantType] += amount;
    if (!this.runStats.firstPlantGrown) this.runStats.firstPlantGrown = plantType; // run summary
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
    if (position) this.particleSystem.harvestBurst(position);
    this.checkDemoWin();
  }

  onSeedCollected({ plantType, position }) {
    // Run-summary + dictionary tracking happen regardless of particle position.
    this.runStats.seedsCollected++;
    this.discoverPlant(plantType);
    if (!position) return;
    const plant = this.gameData.plants[plantType];
    this.particleSystem.seedCollect(position, plant ? plant.color : '#ffffff');
  }

  onUpgradePurchased(d) {
    this.runStats.upgradesPurchased++;
    this.autoSave();
    const plant = d && this.gameData.plants[d.plantType];
    this.particleSystem.upgradeBurst({ x: CHEST_X, y: CHEST_Y }, plant ? plant.color : '#EDD49A');
  }

  // Demo win: grow at least one of every plant type. Fires once, then persists
  // so loading the save again never re-triggers it.
  checkDemoWin() {
    if (this._demoWinTriggered) return;
    // Guard (Sprint 9): the demo win can only ever resolve at the moment of a
    // garden harvest. Forest bundle pickups credit the bank but never the
    // grown-ever tally, and this guard makes the zone requirement explicit.
    if (this.player.currentZone !== 'garden') return;
    const allGrown = Object.keys(this.gameData.plants).every(
      (pt) => (this.plantsGrownEver[pt] || 0) >= DEMO_WIN_PER_PLANT
    );
    if (!allGrown) return;
    this._demoWinTriggered = true;
    this.saveData.demoWinTriggered = true;
    this.autoSave();
    EventBus.emit('win:demo', {});
  }

  // Full win: every plant's stat track AND gear track maxed out.
  checkFullWin() {
    if (this._fullWinTriggered) return;
    const allMaxed = Object.entries(this.gameData.upgrades).every(([pt, tree]) => {
      const statMaxed = this.upgradeLevels[pt].stat >= tree.stat.levels;
      const gearMaxed = this.upgradeLevels[pt].gear >= tree.gear.tiers.length - 1;
      return statMaxed && gearMaxed;
    });
    if (!allMaxed) return;
    this._fullWinTriggered = true;
    EventBus.emit('win:full', {});
  }

  onPlayerDied() {
    if (this._respawning) return;
    this._respawning = true;
    this.runStats.deaths++; // run summary

    this.particleSystem.deathBurst(this.player.x, this.player.y);

    // Drop every carried seed at the death position with a recovery timer — the
    // plant bank is untouched, so only seeds in hand are at risk.
    this.player.seedSlots.forEach((plantType, i) => {
      if (!plantType) return;
      const sx = this.player.x + (Math.random() - 0.5) * DEATH_DROP_SCATTER;
      const sy = this.player.y + (Math.random() - 0.5) * DEATH_DROP_SCATTER;
      const seed = new Seed(this, sx, sy, plantType, this.gameData);
      seed.setDespawnTimer(SEED_RECOVERY_MS);
      this.player.seedSlots[i] = null;
    });
    EventBus.emit('inventory:changed', { slots: [...this.player.seedSlots] });

    // Death costs a day (Fix): advance like a forced sleep — increments the day,
    // ticks garden-bed growth, and resets the day timer. day:advanced is what
    // UIScene reads to update the day counter after respawn.
    this.daySystem.advanceDay();

    // Respawn sequence: fade out, teleport to the garden centre, fade back in.
    this.cameras.main.fadeOut(RESPAWN_FADE_MS);
    this.time.delayedCall(RESPAWN_DELAY_MS, () => {
      this.player.respawn(WORLD_WIDTH / 2, GARDEN_ZONE_HEIGHT / 2);
      this.cameras.main.fadeIn(RESPAWN_FADE_MS);
      this._respawning = false;
    });
  }

  onPlayerDamaged(d) {
    // Only react to applied-damage notifications (which carry currentHP), not
    // the raw per-frame damage requests slimes emit on overlap.
    if (d.currentHP === undefined) return;
    this.cameras.main.shake(SHAKE_DURATION_MS, SHAKE_INTENSITY);
  }

  onEnemyDied({ type, position }) {
    this.runStats.enemiesDefeated++;
    if (this.runStats.killsByType[type] !== undefined) this.runStats.killsByType[type]++;
    const color = ENEMY_DEATH_COLORS[type] || '#ffffff';
    this.particleSystem.showDeathBurst(position.x, position.y, color);
    this.scheduleGreenSlimeRespawn();
  }

  // Keep the forest populated. Green slimes only spawn once at world setup, so
  // without this they thin out and never return as the player clears them. After
  // any enemy dies, top green slimes back up to the day-scaled target after a
  // delay. Dark slimes and skeletons have their own day-based scaling.
  scheduleGreenSlimeRespawn() {
    const respawnMs = this.gameData.enemies.scaling.greenSlimeRespawnMs;
    this.time.delayedCall(respawnMs, () => {
      if (!this.enemies) return;
      const greens = this.enemies.filter((e) => e.slimeType === 'green_slime').length;
      if (greens < this.getTargetGreenSlimeCount()) this.spawnSlime('green_slime');
    });
  }

  // Base green-slime count plus a slow per-day ramp, capped, so deeper runs stay
  // dense without overwhelming early days.
  getTargetGreenSlimeCount() {
    const s = this.gameData.enemies.scaling;
    return Math.min(
      s.greenSlimeBaseCount + Math.floor(this.daySystem.dayNumber * s.greenSlimePerDay),
      s.greenSlimeMaxCount
    );
  }

  // --- Upgrade economy (Sprint 4) -------------------------------------------

  openUpgrade() {
    if (this._upgradeOpen) return;
    this._upgradeOpen = true;
    this.player.setVelocity(0, 0);
    if (this._swapPickerOpen) this.closeSwapPicker(false);
    EventBus.emit('upgrade:opened', {});
    // Play the chest lid-open tween, then launch the workshop overlay.
    this.animateChestOpen(() => this.scene.launch('UpgradeScene'));
  }

  // Lid opens before the overlay appears. Real chest sprite → swap to the open
  // frame with a small pop; placeholder rectangle → the Sprint 9 scaleY squash.
  animateChestOpen(done) {
    if (!this.chest) {
      done();
      return;
    }
    if (this._chestIsSprite) {
      this.chest.setFrame(CHEST_OPEN_FRAME);
      this.tweens.add({
        targets: this.chest,
        scaleX: 1.65,
        scaleY: 1.65,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => this.time.delayedCall(120, done)
      });
    } else {
      this.tweens.add({
        targets: this.chest,
        scaleY: 0.85,
        duration: 120,
        ease: 'Quad.easeOut',
        onComplete: () => this.time.delayedCall(200, done)
      });
    }
  }

  onUpgradeClosed() {
    this._upgradeOpen = false;
    if (!this.chest) return;
    // Lid closes: reset to the closed frame, or reverse the squash tween.
    if (this._chestIsSprite) {
      this.chest.setScale(1.5);
      this.chest.setFrame(CHEST_CLOSED_FRAME);
    } else {
      this.tweens.add({ targets: this.chest, scaleY: 1, duration: 150, ease: 'Quad.easeOut' });
    }
  }

  // --- Win overlay & New Game+ (Sprint 5) -----------------------------------

  // Launch the WinScene overlay over a frozen GameScene. scene.stop/launch are
  // queued by Phaser to the next step, so any in-progress UpgradeScene callback
  // (full win fires mid-purchase) finishes safely before teardown.
  openWin(winType) {
    if (this._winOpen) return;
    this._winOpen = true;
    if (this._upgradeOpen) {
      this.scene.stop('UpgradeScene');
      this._upgradeOpen = false;
    }
    this.player.setVelocity(0, 0);
    if (this._swapPickerOpen) this.closeSwapPicker(false);
    this.physics.pause();
    this.scene.launch('WinScene', {
      winType,
      daysSurvived: this.daySystem.dayNumber,
      enemiesDefeated: this.runStats.enemiesDefeated,
      upgradesPurchased: this.runStats.upgradesPurchased,
      plantsGrown: { ...this.plantsGrownEver },
      // Sprint 11 run summary fields.
      killsByType: { ...this.runStats.killsByType },
      seedsCollected: this.runStats.seedsCollected,
      deaths: this.runStats.deaths,
      firstPlantGrown: this.runStats.firstPlantGrown,
      achievementsUnlocked: this.achievementSystem ? this.achievementSystem.unlockedIds.size : 0
    });
    this.scene.bringToTop('WinScene');
  }

  // 'Continue Playing' from a demo win — resume the same run.
  closeWin() {
    this._winOpen = false;
    this.physics.resume();
  }

  onNewGamePlusActivated() {
    this.newGamePlus = true;
    this.saveData.newGamePlus = true;
    EventBus.emit('ngplus:status', { active: true });
    // Bump the current day's enemy density right away.
    this.handleEnemyScaling(this.daySystem.dayNumber);
    this.autoSave();
  }

  // --- Signpost / achievement log (Sprint 6) --------------------------------

  openSignpost() {
    if (this._signpostOpen) return;
    this._signpostOpen = true;
    this.player.setVelocity(0, 0);
    if (this._swapPickerOpen) this.closeSwapPicker(false);
    EventBus.emit('signpost:opened', {});
    this.scene.launch('SignpostScene');
    this.scene.bringToTop('SignpostScene');
  }

  onSignpostClosed() {
    this._signpostOpen = false;
  }

  // Called by UpgradeScene. Validates affordability, deducts the cost, applies
  // the effect to the player, bumps the saved level, and broadcasts the change.
  purchaseUpgrade(plantType, track) {
    const def = this.gameData.upgrades[plantType];
    const lv = this.upgradeLevels[plantType];

    if (track === 'stat') {
      if (lv.stat >= def.stat.levels) return { ok: false };
      const cost = def.stat.costs[lv.stat];
      if (this.plantBank[plantType] < cost) return { ok: false };
      this.plantBank[plantType] -= cost;
      lv.stat += 1;
      this.applyStatEffect(plantType, lv.stat);
      this.player.recalculateStats();
      if (def.stat.statKey === 'timerBonus') {
        this.daySystem.setTimerBonus(this.player.statBonuses.timerBonus);
      }
      EventBus.emit('upgrade:purchased', { plantType, track, newLevel: lv.stat, cost });
      EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
      this.checkFullWin();
      return { ok: true, newLevel: lv.stat, cost };
    }

    const nextIndex = lv.gear + 1;
    if (nextIndex >= def.gear.tiers.length) return { ok: false };
    const cost = def.gear.tiers[nextIndex].cost;
    if (this.plantBank[plantType] < cost) return { ok: false };
    this.plantBank[plantType] -= cost;
    lv.gear = nextIndex;
    this.applyGearEffect(plantType, nextIndex);
    if (GEAR_SLOT_BY_PLANT[plantType] === 'satchel') this.addGardenBed();
    EventBus.emit('upgrade:purchased', { plantType, track, newLevel: nextIndex, cost });
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
    this.checkFullWin();
    return { ok: true, newLevel: nextIndex, cost };
  }

  // Replay all saved upgrade levels onto the player (called once on load).
  applyAllUpgrades() {
    Object.keys(this.upgradeLevels).forEach((plantType) => {
      const lv = this.upgradeLevels[plantType];
      if (lv.stat > 0) this.applyStatEffect(plantType, lv.stat);
      if (lv.gear >= 0) this.applyGearEffect(plantType, lv.gear);
    });
    this.applyWellUpgrade();
    this.player.recalculateStats();
    this.daySystem.setTimerBonus(this.player.statBonuses.timerBonus);
  }

  // --- Well upgrade track (Sprint 9) ----------------------------------------
  // A standalone track (not tied to a plant tree): better well = more water
  // charges per trip. Paid for in blue flowers — the life/water resource.

  applyWellUpgrade() {
    const tiers = this.gameData.well_upgrades.tiers;
    const idx = Phaser.Math.Clamp(this.wellLevel, 0, tiers.length - 1);
    this.player.setWaterCapacity(tiers[idx].capacity);
  }

  purchaseWellUpgrade() {
    const tiers = this.gameData.well_upgrades.tiers;
    const nextIndex = this.wellLevel + 1;
    if (nextIndex >= tiers.length) return { ok: false };
    const tier = tiers[nextIndex];
    const currency = tier.currency;
    const cost = tier.cost;
    if ((this.plantBank[currency] || 0) < cost) return { ok: false };
    this.plantBank[currency] -= cost;
    this.wellLevel = nextIndex;
    this.applyWellUpgrade();
    // upgrade:purchased drives runStats + auto-save + particle burst via onUpgradePurchased.
    EventBus.emit('upgrade:purchased', { plantType: currency, track: 'well', newLevel: nextIndex, cost });
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
    return { ok: true, newLevel: nextIndex, cost };
  }

  applyStatEffect(plantType, level) {
    const stat = this.gameData.upgrades[plantType].stat;
    // Recompute from base each time (level * perLevelBonus) to avoid drift.
    this.player.statBonuses[stat.statKey] = stat.perLevelBonus * level;
  }

  applyGearEffect(plantType, tierIndex) {
    const tier = this.gameData.upgrades[plantType].gear.tiers[tierIndex];
    switch (GEAR_SLOT_BY_PLANT[plantType]) {
      case 'weapon':
        this.player.equipWeapon(tier);
        break;
      case 'armor':
        this.player.equipArmor(tier);
        break;
      case 'boots':
        this.player.equipBoots(tier);
        break;
      case 'satchel':
        this.player.equipSatchel(tier);
        break;
      case 'ranged':
        this.player.equipRanged(tier);
        break;
      case 'wateringCan':
        this.player.equipWateringCan(tier);
        break;
      default:
        break;
    }
  }

  // --- Save (Sprint 4) ------------------------------------------------------

  buildCurrentState() {
    return {
      dayNumber: this.daySystem.dayNumber,
      totalPlaytime: Math.floor(this._playtimeMs / 1000),
      bank: { ...this.plantBank },
      upgrades: JSON.parse(JSON.stringify(this.upgradeLevels)),
      equippedGear: { ...this.player.equippedGear },
      seedSlots: this.player.seedSlots.length,
      gardenBeds: this.beds.map((b) => b.serialize()),
      plantsGrownEver: { ...this.plantsGrownEver },
      wellLevel: this.wellLevel,
      // Sprint 11 retention state.
      todayWeather: this.daySystem && this.daySystem.todayWeather ? this.daySystem.todayWeather.id : null,
      dailySeedCollected: this._dailySeedCollected,
      dailySeedToastShown: this._dailySeedToastShown,
      discoveredPlants: [...this.discoveredPlants],
      newGamePlus: this.newGamePlus,
      demoWinTriggered: this._demoWinTriggered,
      settings: { ...this.audioSettings },
      ...(this.achievementSystem ? this.achievementSystem.serialize() : {})
    };
  }

  autoSave() {
    SaveSystem.save(this.currentSlot, this.buildCurrentState());
  }

  // --- Projectiles (Sprint 4 ranged) ----------------------------------------

  spawnProjectilePool() {
    this.projectileGroup = this.physics.add.group();
    this.projectiles = [];
    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
      const p = new Projectile(this);
      this.projectileGroup.add(p);
      this.projectiles.push(p);
    }
    this.physics.add.overlap(this.projectileGroup, this.slimeGroup, (proj, enemy) =>
      proj.hit(enemy)
    );
    this.physics.add.overlap(this.projectileGroup, this.skeletonGroup, (proj, enemy) =>
      proj.hit(enemy)
    );
  }

  firePooledProjectile({ x, y, facing, damage, range, speed }) {
    const p = this.projectiles.find((pr) => !pr.active);
    if (!p) return; // pool exhausted — drop the shot
    p.fire(x, y, facing, damage, range, speed);
  }

  getHarvestRange() {
    // Base pickup radius widened by the sunflower Harvest Range stat.
    return SEED_COLLECT_RANGE * (1 + this.player.statBonuses.harvestRange);
  }

  // --- Developer cheats (Sprint 4.5 dev tools) ------------------------------
  //
  // Executors for the dev cheat menu. The DevMenuScene only emits `dev:*`
  // intents; GameScene (the state owner) performs the mutation here and
  // re-broadcasts the canonical events so the HUD stays in sync. All of this is
  // only wired up when isDevModeActive() — see create().

  setupDevHandlers() {
    this.subscribe('dev:fillBank', () => this.devFillBank());
    this.subscribe('dev:addBank', (d) => this.devAddBank(d));
    this.subscribe('dev:day', (d) => this.devDay(d));
    this.subscribe('dev:unlockGear', () => this.devUnlockAllGear());
    this.subscribe('dev:maxStats', () => this.devMaxAllStats());
    this.subscribe('dev:nextTier', (d) => this.devNextTier(d));
    this.subscribe('dev:fullHeal', () => this.player.healToFull());
    this.subscribe('dev:restoreAmmo', () => this.player.restoreAmmo());
    this.subscribe('dev:spawnEnemy', (d) => this.devSpawnEnemy(d));
    this.subscribe('dev:clearEnemies', () => this.devClearEnemies());
    this.subscribe('dev:clearSave', () => this.devClearSave());
    this.subscribe('dev:forceSave', () => this.devForceSave());
  }

  devFillBank() {
    Object.keys(this.plantBank).forEach((k) => {
      this.plantBank[k] = 20;
    });
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
  }

  devAddBank({ plantType, amount }) {
    if (this.plantBank[plantType] === undefined) this.plantBank[plantType] = 0;
    this.plantBank[plantType] += amount;
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
  }

  devDay({ delta }) {
    if (delta > 0) {
      // Forward: advance for real so bed growth, enemy scaling and bank events fire.
      for (let i = 0; i < delta; i++) this.daySystem.advanceDay();
    } else if (delta < 0) {
      // Backward: counter + timer only — do not reverse growth or un-spawn enemies.
      this.daySystem.dayNumber = Math.max(1, this.daySystem.dayNumber + delta);
      this.daySystem.resetTimer();
      EventBus.emit('day:dayChanged', { day: this.daySystem.dayNumber });
    }
  }

  devUnlockAllGear() {
    Object.keys(this.gameData.upgrades).forEach((pt) => {
      const tiers = this.gameData.upgrades[pt].gear.tiers;
      const lastIndex = tiers.length - 1;
      const oldIndex = this.upgradeLevels[pt].gear;
      if (oldIndex >= lastIndex) return;
      this.upgradeLevels[pt].gear = lastIndex;
      this.applyGearEffect(pt, lastIndex);
      // Each satchel tier also adds a garden bed (mirrors live purchases).
      if (GEAR_SLOT_BY_PLANT[pt] === 'satchel') {
        for (let i = oldIndex; i < lastIndex; i++) this.addGardenBed();
      }
    });
    this.player.recalculateStats();
    this.syncHud();
  }

  devMaxAllStats() {
    Object.keys(this.gameData.upgrades).forEach((pt) => {
      const levels = this.gameData.upgrades[pt].stat.levels;
      this.upgradeLevels[pt].stat = levels;
      this.applyStatEffect(pt, levels);
    });
    this.player.recalculateStats();
    this.daySystem.setTimerBonus(this.player.statBonuses.timerBonus);
    this.syncHud();
  }

  devNextTier({ plantType }) {
    const tiers = this.gameData.upgrades[plantType].gear.tiers;
    const lv = this.upgradeLevels[plantType];
    const next = lv.gear + 1;
    if (next >= tiers.length) return;
    lv.gear = next;
    this.applyGearEffect(plantType, next);
    if (GEAR_SLOT_BY_PLANT[plantType] === 'satchel') this.addGardenBed();
    this.player.recalculateStats();
    this.syncHud();
  }

  devSpawnEnemy({ type }) {
    const x = this.player.x;
    const y = this.player.y;
    if (type === 'skeleton') this.spawnSkeleton(x, y);
    else this.spawnSlime(type, x, y);
  }

  devClearEnemies() {
    // Instant removal — no death fade, drops, or events.
    this.enemies.forEach((e) => {
      e.isDead = true;
      if (e.body) e.body.enable = false;
      e.destroy();
    });
    this.enemies = [];
  }

  devClearSave() {
    SaveSystem.clear(this.currentSlot);
    console.log(`[dev] cleared save slot ${this.currentSlot}`);
  }

  devForceSave() {
    this.autoSave();
    console.log(`[dev] force-saved slot ${this.currentSlot}`);
  }

  // --- Main loop ------------------------------------------------------------

  update(time, delta) {
    if (!GameState.is('PLAYING')) return;
    // Freeze the world (but keep rendering) while a modal overlay (workshop, win,
    // achievement log, or seed dictionary) is open. The world-detail popup is
    // non-modal, so it deliberately does NOT freeze the world.
    if (this._upgradeOpen || this._winOpen || this._signpostOpen || this._dictionaryOpen) return;

    const dt = delta / 1000;
    this._playtimeMs += delta;

    this.player.update(dt);
    this.enemies.forEach((e) => e.update(dt, this.player));
    this.daySystem.update(delta);
    this.updateSeeds();
    this.updateStructureLabels();
    this.updateInteractPrompt();

    if (Phaser.Input.Keyboard.JustDown(this.fKey)) {
      this.handleInteract();
    }
  }

  shutdown() {
    this._busHandlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._busHandlers = [];
    if (this.bgm) {
      Object.values(this.bgm).forEach((snd) => snd.stop());
    }
  }
}
