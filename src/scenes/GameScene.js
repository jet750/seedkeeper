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
import MobileDetect from '../core/MobileDetect.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GARDEN_ZONE_HEIGHT,
  GARDEN_X,
  GARDEN_Y,
  GARDEN_WIDTH,
  GARDEN_HEIGHT,
  GARDEN_LEFT,
  GARDEN_RIGHT,
  GARDEN_TOP,
  GARDEN_BOTTOM,
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  FONT_FAMILY,
  TILE_SIZE,
  USE_TILED_WORLD,
  TILED_WORLD_KEY,
  isDevModeActive
} from '../core/Constants.js';
import WorldZoneSystem, { RIVER_WIDTH, CREEK_WIDTH } from '../systems/WorldZoneSystem.js';
import { tilesetKey } from '../world/tilesetImages.js';
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
import TutorialSystem from '../systems/TutorialSystem.js';
import SaveSystem from '../core/SaveSystem.js';
import entitiesData from '../data/entities.json';
import economyData from '../data/economy.json';
import DynamicNature from '../world/DynamicNature.js';

const INTERACT_RANGE = 48; // px — F-key reach for beds, well, sleep
const SEED_COLLECT_RANGE = 26; // px — player must be this close to pick up a seed
const DEMO_WIN_PER_PLANT = 10; // grow this many of EVERY plant type to trigger the demo win
const PROXIMITY_LABEL_DIST = 80; // px — interactive-structure labels reveal within this range
const SLEEP_FADE_MS = 500;
const SWAP_TIMEOUT_DIST = 80; // px — walking this far from a seed cancels the swap picker

// --- Combat & enemy spawning (Sprint 3) ---
// (Dark slime tint moved to data-driven per-level tints in Sprint 5.)
const MAX_DARK_SLIMES = 4;
const ENEMY_SPAWN_MARGIN = 80; // keep spawns off the world edges
const SKELETON_PATROL_SPREAD = 220; // px between a skeleton's patrol waypoints
const DEATH_DROP_SCATTER = 40; // spread of seeds dropped on player death
const SEED_RECOVERY_MS = 30000; // recovery window before death-dropped seeds vanish
const GATE_SCALE = 2; // closed-gate draw scale at the zone boundary (Sprint 10b)
const FENCE_SCALE = 1.6; // Sprout Lands fence/gate sprite scale (16px source) — Sprint 10d
const RESPAWN_FADE_MS = 500;
const RESPAWN_DELAY_MS = 1500;

// Screenshake profiles (Sprint 13) — different impacts feel different. duration
// in ms, intensity as a fraction of viewport. Selected via shake(profileName).
const SHAKE_PROFILES = {
  player_hit: { duration: 250, intensity: 0.004 },
  player_death: { duration: 500, intensity: 0.01 },
  sword_hit: { duration: 120, intensity: 0.003 },
  dagger_hit: { duration: 80, intensity: 0.002 },
  hands_hit: { duration: 60, intensity: 0.001 },
  skeleton_hit: { duration: 180, intensity: 0.005 },
  day_timer_expire: { duration: 400, intensity: 0.006 },
  bundle_collect: { duration: 80, intensity: 0.002 },
  upgrade_purchase: { duration: 150, intensity: 0.003 }
};
const ENEMY_DEATH_COLORS = {
  green_slime: '#8AB87E',
  dark_slime: '#8833cc',
  skeleton: '#E8E2D0'
};

// Player-power heuristic (Sprint 5): a 1-5 read of how far the player has
// invested across the six stat trees and four gear slots, used to color enemy
// level markers (green safe / yellow risky / red dangerous). Tunable weights.
const PLAYER_POWER = { statWeight: 1, gearWeight: 2 };

// Home anchor for the procedural enemy-level gradient (further from home = higher
// level). Garden centre — the LDtk world will instead set per-zone levels.
const ENEMY_HOME = { x: GARDEN_X + GARDEN_WIDTH / 2, y: GARDEN_Y + GARDEN_HEIGHT / 2 };

// --- Upgrades, save & projectiles (Sprint 4) ---
// Equip slots filled by the coin economy (economy.json gear catalog). v2 moved
// gear off the plant trees, so there is no longer a plant→slot mapping.
const GEAR_SLOTS = ['weapon', 'armor', 'boots', 'ranged'];
// Save-field name for each coin-funded capacity tree (economy.json capacity keys
// → save tier counters). Independent of each other and of the stat trees.
const CAPACITY_TIER_FIELD = {
  seedBag: 'seedBagTier',
  gardenBeds: 'gardenBedTier',
  watering: 'wateringTier'
};
// v3 (Sprint 6/3d): one entry per growable plant. Mirrors SaveSystem.freshBank();
// harvest/grant paths guard missing keys with `|| 0`, but seeding the full set
// keeps plantBank/plantsGrownEver shapes stable for the bank HUD and win checks.
const DEFAULT_BANK = {
  carrots: 0, purple_carrot: 0, white_carrots: 0,
  cauliflower: 0, purple_cauliflower: 0, red_lettuce: 0,
  corn: 0, sunflower: 0, wheat: 0,
  tomato: 0, eggplant: 0, beanstalk: 0,
  pumpkin: 0, cucumber: 0, bok_choy: 0,
  blue_flower_2: 0, red_berry: 0, pineapple: 0,
  watermelon: 0, blue_melon: 0, green_melon: 0
};
const PROJECTILE_POOL_SIZE = 10;
// Garden bed grid layout (row-wraps as garden-bed tiers add beds). Anchored to the
// centered garden homestead: the 4-bed top row is centred on the garden's x-axis
// (BED_BASE_X + 1.5*COL_GAP == garden centre 3200) and sits in the upper third.
// Garden-interior placements are authored relative to GARDEN_TOP so the whole
// homestead follows the garden anchor — Sprint 9 re-centred the garden (GARDEN_TOP
// 200 → 2800) and these offsets keep every structure in its original layout.
const BED_BASE_X = 2960;
const BED_BASE_Y = GARDEN_TOP + 120; // was 320 (GARDEN_TOP 200 + 120)
const BED_COL_GAP = 160;
const BED_ROW_GAP = 150;
const BEDS_PER_ROW = 4;
// Workshop chest — lower-right of the garden interior.
const CHEST_X = 3340;
const CHEST_Y = GARDEN_TOP + 660; // was 860
// Market stall (Sprint 3) — opens the marketplace on F-interact. Single config
// point: move this when the world layout changes; nothing else hardcodes its tile.
const MARKET_X = 3340;
const MARKET_Y = GARDEN_TOP + 420; // was 620
// obj_chest.png is a 48x48 sheet: row 0 is a closed→open progression.
const CHEST_CLOSED_FRAME = 0;
const CHEST_OPEN_FRAME = 4;
// Upgrade-station art (Sprint 3-polish): the station prefers the workbench image
// (work_station, 32x32) over the old chest sprite. Scaled to ~72px so it keeps
// the chest's former footprint at the same garden spot.
const WORKBENCH_SCALE = 2.25;

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
    this.economyData = economyData; // coin catalogs: gear, capacity, sellPrices
    // Carve whole-tree sub-frames out of the Sprout Lands tree sheet (Sprint 10d)
    // so trees render as real art instead of vector shapes. Safe no-op if the
    // sheet didn't load (production may not emit every tileset).
    this.registerArtFrames();
    // Organic biome + river layout (Sprint 10c revised). Pure data — built first
    // so the world background, river, trees, and zone-based spawns can all sample
    // the same instance.
    this.worldZoneSystem = new WorldZoneSystem();
    this.currentZone = 'garden';
    this._respawning = false;
    this._postTimerApplied = false;
    this._sleeping = false;
    this._swapCandidate = null;
    this._swapPickerOpen = false;
    this._swapSnoozedSeed = null;
    this._upgradeOpen = false;
    this._marketOpen = false; // Sprint 3 — marketplace overlay open
    this._winOpen = false;
    this._signpostOpen = false;
    this._lastPromptText = null; // contextual F-prompt dedupe (Sprint 9)
    this._dictionaryOpen = false;
    this._worldDetailOpen = false;
    this._plantPickerOpen = false; // Sprint 10c — planting seed picker open
    this._plantPickerBed = null; // bed the open picker is planting into
    this._playerMovedAccum = 0; // throttle accumulator for minimap player:moved
    this._paused = false; // Sprint 12 — pause menu open
    // Sprint 12 first-run tutorial trigger latches (once-per-run derivations).
    this._nearGateEmitted = false;
    this._firstEnemyContactEmitted = false;
    this._firstFillEmitted = false;
    this._busHandlers = [];

    // --- Mobile profile (Sprint Mobile) ---
    // Cached once so the per-frame AI throttle never re-runs UA detection.
    // screenShakeEnabled is honoured by shake(); the throttle fields drive the
    // every-Nth-frame enemy update in update(). All inert on desktop.
    this._mobile = MobileDetect.isMobile();
    this.screenShakeEnabled = true;
    this.slimeUpdateInterval = 1;
    this.slimeUpdateFrame = 0;

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
      footstepVolume: 0.25,
      muted: false,
      ...(this.saveData.settings || {})
    };

    // --- Persistent state restored from the save slot ---
    this.plantBank = { ...DEFAULT_BANK, ...(this.saveData.bank || {}) };
    this.upgradeLevels = JSON.parse(JSON.stringify(this.saveData.upgrades));
    this.plantsGrownEver = { ...DEFAULT_BANK, ...(this.saveData.plantsGrownEver || {}) };
    // Dual economy (v2): banked coins + the three coin-funded capacity tiers.
    this.coins = this.saveData.coins || 0;
    this.seedBagTier = this.saveData.seedBagTier || 0;
    this.gardenBedTier = this.saveData.gardenBedTier || 0;
    this.wateringTier = this.saveData.wateringTier || 0;
    // Sprint 11 retention state.
    this.discoveredPlants = [...(this.saveData.discoveredPlants || [])];
    this._dailySeedCollected = this.saveData.dailySeedCollected || null;
    this._dailySeedToastShown = this.saveData.dailySeedToastShown || null;
    this._playtimeMs = (this.saveData.totalPlaytime || 0) * 1000;
    // Sprint 12 — first-run hints already shown in this slot (mutated by TutorialSystem).
    this.tutorialsSeen = [...(this.saveData.tutorialsSeen || [])];

    // Single source of truth for all active enemies (slimes + skeletons). The
    // CombatSystem and enemy-scaling logic both read this array.
    this.enemies = [];

    this.ensurePlaceholderTextures();
    this.buildWorld();
    this.setupBounds();

    // --- Player ---
    this.player = new Player(
      this,
      GARDEN_X + GARDEN_WIDTH / 2,
      GARDEN_Y + GARDEN_HEIGHT / 2,
      this.gameData
    );

    // --- Camera ---
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    // Closer view on the player (Sprint 10c fix) — was 2.0; 2.5 still leaves
    // enough lead time to react to enemies approaching at the camera edge.
    this.cameras.main.setZoom(2.5);
    // Menu → game transition: reveal the world with a smooth fade-in (Sprint 12).
    this.cameras.main.fadeIn(700, 0, 0, 0);

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
    this.recomputePlayerPower(); // seed the player-power read before enemies spawn (Sprint 5)
    this.spawnSlimes();
    this.physics.add.collider(this.slimeGroup, this.slimeGroup);
    this.physics.add.overlap(
      this.player,
      this.slimeGroup,
      (player, slime) => this.onEnemyTouch(slime),
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
      (player, skeleton) => this.onEnemyTouch(skeleton),
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

    // --- Garden fence (centered homestead) — 4-sided fence with gate gaps that
    // blocks the player (except at the gates) and keeps enemies out ---
    this.createGardenFence();

    // Tiled-world solid-layer colliders (Sprint 9) — player + enemy groups now
    // exist. No-op on the procedural world.
    this.wireTiledWorldCollision();

    // --- Sprint 2 world objects ---
    this.seeds = [];
    this.spawnSeeds();
    this.spawnGardenBeds();
    this.createBedSoil(); // Sprint 10d — tilled soil under the beds (needs beds)
    this.spawnGardenStructures();
    this.spawnProps();
    this.scatterTilesetProps(); // Sprint 10d — themed mushrooms/flowers near seeds
    this.createForestAmbience();
    this.createGardenAmbience();

    // --- Sprint 11 world systems ---
    this.createRockFormations(); // physics-collider cover geometry

    // --- Sprint 10c organic world structure ---
    // Built here (after the player, enemy groups and seeds exist) so colliders
    // wire immediately and tree placement can avoid burying seeds. Skipped on the
    // Tiled world (Sprint 9) — it supplies its own water and tree layers and their
    // collision; running these would double up the river and trees.
    if (!this._tiledWorldActive) {
      this.createRiverSystem(); // winding river + creeks + bridges + collision
      this.createOrganicTrees(); // clustered tree barriers with navigable gaps
    }

    this.createWorldDetails(); // examinable storytelling objects
    this.maybeSpawnDailySeed(); // once-a-day glowing gift

    // --- Living-world nature cycling (world-v1) — additive, static-safe ---
    // No-op until the engine loads a Tiled world map with a `nature_dynamic`
    // object layer (see src/world/DynamicNature.js). Never touches gameplay.
    this.dynamicNature = new DynamicNature(this).init();

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

    // --- First-run tutorial (Sprint 12) — pure EventBus; shows each hint once
    // per slot, tracked in this.tutorialsSeen (persisted via save:requested). ---
    this.tutorialSystem = new TutorialSystem(
      () => this.daySystem.dayNumber,
      this.tutorialsSeen
    );

    // --- Apply saved upgrades to the freshly-built player ---
    this.applyAllUpgrades();

    // Populate the enemy density appropriate to the loaded day (no-op on day 1).
    this.handleEnemyScaling(this.daySystem.dayNumber);

    // --- Audio ---
    this.setupMusic();

    // --- Interaction input ---
    this.fKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    // M now toggles the HUD minimap (handled in UIScene, Sprint 10c). Mute moved
    // to the Settings overlay so the two no longer fight over the same key.
    // Esc opens the pause menu during normal play (Sprint 12). Guarded so it
    // never fights an open overlay or the sleep fade — those own Esc themselves.
    this.input.keyboard.on('keydown-ESC', () => this.tryOpenPause());

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
    this.subscribe('market:closed', () => this.onMarketClosed());
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

    // --- Planting picker (Sprint 10c) ---
    this.subscribe('bed:plantConfirmed', (d) => this.onPlantConfirmed(d));
    this.subscribe('bed:plantCancelled', () => this.onPlantPickerCancelled());

    // --- Pause menu (Sprint 12) ---
    this.subscribe('pause:resume', () => this.onPauseResume());

    // --- Mobile touch actions (Sprint Mobile) ---
    // The interact button routes through the same handler as the F key; the
    // mobile pause button reuses the Esc pause flow. Inert on desktop (nothing
    // emits these). Registered via subscribe() so shutdown() detaches them.
    this.subscribe('touch:interact', () => this.handleInteract());
    this.subscribe('game:pauseRequested', () => this.tryOpenPause());

    // --- Screenshake on melee impact (Sprint 13) ---
    this.subscribe('combat:meleeLanded', (d) => this.onMeleeLanded(d));

    // --- Weather + retention (Sprint 11) ---
    this.subscribe('weather:changed', (d) => this.onWeatherChanged(d));
    this.subscribe('dictionary:closed', () => { this._dictionaryOpen = false; });
    this.subscribe('worlddetail:closed', () => { this._worldDetailOpen = false; });

    // --- HUD scene ---
    this.scene.launch('UIScene', { dayNumber: this.daySystem.dayNumber });
    // Push the full restored HUD state once UIScene has booted and subscribed,
    // then fire the first-run tutorial's 'game:started' trigger (movement hint).
    this.time.delayedCall(0, () => {
      this.syncHud();
      EventBus.emit('game:started', {});
      // One-time notice when a pre-v2 save was wiped to a fresh v2 default.
      if (this.saveData && this.saveData._wasReset) {
        EventBus.emit('ui:notice', { text: 'Save reset for the new update' });
      }
    });

    // --- Developer cheat menu (parallel scene; inert unless dev mode active) ---
    this.scene.launch('DevMenuScene');
    if (isDevModeActive()) {
      this.setupDevHandlers();
      // FPS monitor — dev builds only; absent from the production build (Sprint 13).
      this._fpsText = this.add
        .text(12, 96, '', { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#00ff00' })
        .setScrollFactor(0)
        .setDepth(1000);
    }

    // Lighten the per-frame load on phones (AI throttle, fewer particles, calmer
    // ambience). No-op on desktop. Runs after the particle system + garden
    // ambience exist so it can tune them.
    this.applyMobileOptimizations();

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
    EventBus.emit('coins:changed', { coins: this.coins, delta: 0 });
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
    // Re-announce dash availability after the HUD/touch layer is live (the equip
    // during applyAllUpgrades fired before UIScene existed) so the mobile dash
    // button appears on a loaded save that already owns dash boots.
    if (this.player.dashEnabled) EventBus.emit('dash:enabled', {});
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
    // Seed the minimap dot at the player's current position (Sprint 10c).
    EventBus.emit('player:moved', { x: this.player.x, y: this.player.y });
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
    // Sprint 9: prefer the hand-built Tiled world (world_v1). When it loads it
    // replaces the procedural background, river and tree clusters; the procedural
    // generator below is retained as the fallback if the map is absent or fails.
    this._tiledWorldActive = false;
    if (USE_TILED_WORLD && this.cache.tilemap.exists(TILED_WORLD_KEY)) {
      this._tiledWorldActive = this.createTiledWorld();
    }
    if (this._tiledWorldActive) return;

    // --- Procedural fallback (Sprint 10c) -------------------------------------
    // Organic biome map — irregular zones sampled from the WorldZoneSystem. The
    // 4-sided garden fence (visual + colliders) is built later by
    // createGardenFence(), once the player and enemy groups exist.
    this.createOrganicBackground();
    // Real grass/soil tiles laid over the sampled colour map (Sprint 10d). The
    // colour map stays underneath as a safe base so nothing gaps if a tileset is
    // missing; tiles sit on top where they loaded.
    this.createGroundTiles();

    // Faint zone labels for at-a-glance orientation in the bigger world. Placed
    // over a representative point of each organic zone (not a band edge).
    this.addZoneLabel('GARDEN', 400, '#4f7344', 0.25);
    this.addZoneLabel('MEADOW', 1000, '#3d6b28', 0.30);
    this.addZoneLabel('FOREST', 1380, '#24412a', 0.35);
    this.addZoneLabel('DEEP WOODS', 2120, '#16280c', 0.45);
  }

  // --- Hand-built Tiled world (Sprint 9) ------------------------------------
  // Builds world_v1: its ten tile layers render as a backdrop (negative depths so
  // the player, enemies, beds, fence and props all sit on top), with collision on
  // the solid layers and a walkable cut through the water where bridges cross.
  // Tileset images load in BootScene under ts_<name> keys; a missing one is skipped
  // (its tiles render blank) rather than throwing. Returns true on success so
  // buildWorld() can fall back to the procedural world otherwise.
  createTiledWorld() {
    let map;
    try {
      map = this.make.tilemap({ key: TILED_WORLD_KEY });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[world] tiled map failed to build; procedural fallback:', err && err.message);
      return false;
    }
    if (!map || !map.layers || !map.layers.length) return false;
    this.tiledMap = map;

    // Add every embedded tileset, keyed ts_<name-with-underscores>. The texture must
    // be loaded (BootScene); guard so a missing image skips just that tileset.
    const tilesets = [];
    const missingTilesets = [];
    for (const ts of map.tilesets) {
      const key = tilesetKey(ts.name);
      if (!this.textures.exists(key)) {
        missingTilesets.push(`${ts.name} -> ${key}`);
        continue;
      }
      const added = map.addTilesetImage(ts.name, key, TILE_SIZE, TILE_SIZE);
      if (added) tilesets.push(added);
    }
    this._tiledMissingTilesets = missingTilesets;
    if (missingTilesets.length) {
      // eslint-disable-next-line no-console
      console.warn('[world] tileset images not loaded (tiles render blank):', missingTilesets.join(', '));
    }
    if (!tilesets.length) return false; // nothing to draw — use the procedural world

    // Back-to-front backdrop. All depths < 0 so every gameplay object sits on top.
    const LAYER_DEPTH = {
      ground: -20, water: -19, paths_main: -18, paths_spur: -17, bridges: -16,
      props_ground: -15, fences: -14, structures: -13, props_water: -12, props_trees: -11
    };
    this.tiledLayers = {};
    for (const ld of map.layers) {
      const layer = map.createLayer(ld.name, tilesets, 0, 0);
      if (!layer) continue;
      layer.setDepth(LAYER_DEPTH[ld.name] != null ? LAYER_DEPTH[ld.name] : -10);
      this.tiledLayers[ld.name] = layer;
    }

    // Solid layers: water, trees, fences, structures and water props block movement.
    // Player/enemy colliders are wired later (wireTiledWorldCollision) once the
    // player and enemy groups exist.
    const SOLID = ['water', 'props_trees', 'fences', 'structures', 'props_water'];
    this.tiledSolidLayers = [];
    for (const name of SOLID) {
      const layer = this.tiledLayers[name];
      if (!layer) continue;
      layer.setCollisionByExclusion([-1]);
      this.tiledSolidLayers.push(layer);
    }
    // Bridges are walkable: clear water collision under every bridge tile.
    const water = this.tiledLayers.water;
    const bridges = this.tiledLayers.bridges;
    if (water && bridges) {
      water.forEachTile((t) => {
        if (t.index === -1) return;
        const b = bridges.getTileAt(t.x, t.y);
        if (b && b.index !== -1) t.resetCollision();
      });
    }

    // World + camera bounds to the map's true pixel size (6400x6400).
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    return true;
  }

  // Wire player + enemy colliders against the Tiled solid layers. Called from
  // create() after the player and both enemy groups exist. No-op on the
  // procedural world (tiledSolidLayers is unset).
  wireTiledWorldCollision() {
    if (!this._tiledWorldActive || !this.tiledSolidLayers) return;
    for (const layer of this.tiledSolidLayers) {
      this.physics.add.collider(this.player, layer);
      this.physics.add.collider(this.slimeGroup, layer);
      this.physics.add.collider(this.skeletonGroup, layer);
    }
  }

  // A single faint, centered biome name drawn into the ground layer.
  addZoneLabel(text, y, color, alpha) {
    this.add
      .text(WORLD_WIDTH / 2, y, text, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '120px',
        fontStyle: 'bold',
        color
      })
      .setOrigin(0.5)
      .setAlpha(alpha)
      .setDepth(0);
  }

  // --- Organic world background (Sprint 10c revised) ------------------------
  // A pixel-sampled biome map: the forest is sampled on a coarse grid and each
  // cell filled with its zone colour, giving soft, irregular borders. Drawn into
  // a single Graphics (one GameObject) rather than thousands of rectangles. The
  // garden is now a centered square drawn on top; the river is rendered separately.
  createOrganicBackground() {
    const SAMPLE = 64;
    const g = this.add.graphics().setDepth(0);

    // Base world background behind everything — forest green.
    g.fillStyle(0x3a6a20, 1);
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Forest — sample each cell's zone across the whole world (the forest now
    // wraps around the garden on all sides, not just below it).
    for (let x = 0; x < WORLD_WIDTH; x += SAMPLE) {
      for (let y = 0; y < WORLD_HEIGHT; y += SAMPLE) {
        const zone = this.worldZoneSystem.getZoneAt(x + SAMPLE / 2, y + SAMPLE / 2);
        g.fillStyle(this.worldZoneSystem.getZoneColor(zone), 1);
        g.fillRect(x, y, SAMPLE, SAMPLE);
      }
    }

    // Garden — solid safe-zone square in the center, drawn over the forest.
    g.fillStyle(this.worldZoneSystem.getZoneColor('garden'), 1);
    g.fillRect(GARDEN_X, GARDEN_Y, GARDEN_WIDTH, GARDEN_HEIGHT);
    // Sprint 10d lays real grass/soil tiles over this in createGroundTiles(); the
    // sampled colour map remains as the fallback base beneath them.
  }

  // --- Tileset art frames (Sprint 10d) --------------------------------------
  // The Sprout Lands tree sheet packs whole trees larger than one 16px tile, so
  // slice named sub-frames (measured from the sheet) instead of using a 16x16
  // grid. Guarded: a no-op when the sheet isn't loaded.
  registerArtFrames() {
    if (this.textures.exists('trees')) {
      const tex = this.textures.get('trees');
      const add = (name, x, y, w, h) => {
        if (!tex.has(name)) tex.add(name, 0, x, y, w, h);
      };
      // Top row holds six 32x48 small trees; a 64x64 hero tree sits lower-right.
      add('tree_small_a', 0, 0, 32, 48); // plain green
      add('tree_small_b', 32, 0, 32, 48); // plain green, fuller
      add('tree_fruit', 64, 0, 32, 48); // fruited variant for the meadow border
      add('tree_big', 128, 48, 64, 64); // the big canopy — deep-forest landmark
    }
  }

  // Plain grass-fill frame on every ground sheet (they share an 11x7 layout; the
  // clean fill tile lives in the lower-left). Picked by eye from the sheets.
  GROUND_FILL_FRAME() {
    return 55;
  }

  // Real ground tiles over the colour map: bright grass in the garden, darker
  // grass across the forest, soil under the bed grid, and darker pockets over the
  // big deep-forest zones. Every layer is guarded so a missing sheet just leaves
  // the colour map showing — never a broken tile.
  createGroundTiles() {
    const FILL = this.GROUND_FILL_FRAME();

    // Forest floor — darker grass across the whole world (drawn after the colour
    // map, so on top), then the garden's brighter grass over its square.
    if (this.textures.exists('dark_grass_tiles')) {
      this.add
        .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'dark_grass_tiles', FILL)
        .setOrigin(0, 0)
        .setDepth(0);

      // Darker pockets over the larger deep-forest zones so the danger zone reads
      // as a deeper wood. Rectangular but the dense tree clusters hide the edges.
      this.worldZoneSystem.zones.deep_forest
        .filter((p) => p.r >= 350)
        .forEach((p) => {
          this.add
            .tileSprite(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, 'dark_grass_tiles', FILL)
            .setOrigin(0, 0)
            .setTint(0x6f8a66)
            .setDepth(0);
        });
    }

    if (this.textures.exists('grass_tiles')) {
      this.add
        .tileSprite(GARDEN_X, GARDEN_Y, GARDEN_WIDTH, GARDEN_HEIGHT, 'grass_tiles', FILL)
        .setOrigin(0, 0)
        .setDepth(1);
    }
  }

  // Small tilled-soil squares framing each garden bed so they read as worked
  // earth, without paving the whole garden in dirt. Called after the beds exist;
  // each bed draws its own darker soil square on top (depth 2). No-op without art.
  createBedSoil() {
    if (!this.textures.exists('soil_tiles') || !this.beds) return;
    this.beds.forEach((bed) => this.addBedSoil(bed));
  }

  // The tan/beige tilled-soil frame under a single bed — the bordered look the
  // starting beds have. addGardenBed() calls this for capacity-tree spawns too so
  // newly bought beds are visually identical to the starting four (Sprint 3-polish:
  // spawned beds previously appeared as a bare dirt square with no frame). No-op
  // without the soil art (the prod build may not emit every tileset).
  addBedSoil(bed) {
    if (!this.textures.exists('soil_tiles')) return;
    this.add
      .tileSprite(bed.x, bed.y, 76, 76, 'soil_tiles', this.GROUND_FILL_FRAME())
      .setOrigin(0.5, 0.5)
      .setDepth(1);
  }

  // --- River system (Sprint 10c revised) ------------------------------------
  // Renders the winding main river + the two creeks it forks into, lays the
  // bridge planks at the three crossings, then builds the collision band that
  // blocks the water everywhere except the bridge gaps.
  createRiverSystem() {
    this.renderRiver();
    this.createRiverCollision();
  }

  // Water is drawn as overlapping circles stepped along each channel, all into a
  // single Graphics so a curved band reads smoothly. Bridges sit on top.
  renderRiver() {
    // Real animated water tiles when the sheet is present (Sprint 10d); else the
    // painterly blue channel. The base circles always draw underneath so the
    // curved band reads smoothly between the straight tile segments.
    const hasWater = this.textures.exists('water_tiles');
    const g = this.add.graphics().setDepth(1);
    const drawChannel = (path, width, color) => {
      g.fillStyle(color, 1);
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10);
        for (let t = 0; t <= steps; t++) {
          const px = Phaser.Math.Linear(a.x, b.x, t / steps);
          const py = Phaser.Math.Linear(a.y, b.y, t / steps);
          g.fillCircle(px, py, width / 2);
        }
      }
    };
    // Pale teal base under the tiles so seams blend; the old blue when art is off.
    const mainColor = hasWater ? 0x7ec6c0 : 0x2255aa;
    const creekColor = hasWater ? 0x8ed2cc : 0x3366bb;
    drawChannel(this.worldZoneSystem.mainRiverPath, RIVER_WIDTH, mainColor);
    drawChannel(this.worldZoneSystem.leftCreekPath, CREEK_WIDTH, creekColor);
    drawChannel(this.worldZoneSystem.rightCreekPath, CREEK_WIDTH, creekColor);

    if (hasWater) this.createRiverWaterTiles();

    // Bridge planks at each crossing — a brown deck with plank detail lines,
    // angled along the path so it sits naturally over the curving water.
    this.worldZoneSystem.bridges.forEach((bridge) => {
      this.add
        .rectangle(bridge.x, bridge.y, bridge.length, 44, 0x8b6914)
        .setStrokeStyle(2, 0x5a3a10)
        .setAngle(bridge.angle)
        .setDepth(2);
      const planks = this.add.graphics().setDepth(2);
      planks.lineStyle(2, 0x6b4a10, 1);
      const n = Math.floor(bridge.length / 14);
      for (let i = 1; i < n; i++) {
        const lx = -bridge.length / 2 + i * 14;
        planks.lineBetween(lx, -20, lx, 20);
      }
      planks.setPosition(bridge.x, bridge.y).setAngle(bridge.angle);
    });
  }

  // Animated water tiles (Sprint 10d): one tileSprite per river segment, sized and
  // angled to the segment so the Sprout Lands water texture tiles along the curve.
  // A single 4-frame cycle (~4fps) drives the ripple for all of them, and a slow
  // tilePosition drift makes it flow — ~20 objects total, one timer, cheap.
  createRiverWaterTiles() {
    this.waterTiles = [];
    const place = (path, width) => {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1) continue;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const tile = this.add
          .tileSprite(mx, my, len + width, width, 'water_tiles', 0)
          .setOrigin(0.5, 0.5)
          .setRotation(angle)
          .setDepth(1);
        this.waterTiles.push(tile);
      }
    };
    this.worldZoneSystem.channels.forEach(({ path, width }) => place(path, width));

    // Ripple frame cycle (0→3) shared by every tile.
    this._waterFrame = 0;
    this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        this._waterFrame = (this._waterFrame + 1) % 4;
        for (const t of this.waterTiles) t.setFrame(this._waterFrame);
      }
    });
  }

  // Collision band: a run of small static blockers stepped along each channel,
  // skipping the bridge gaps so the only way across is over a bridge. Small AABB
  // blocks follow the curve where one rotated body could not (arcade bodies stay
  // axis-aligned regardless of the GameObject's angle).
  createRiverCollision() {
    this.riverColliders = this.physics.add.staticGroup();

    const addBlockers = (path, width) => {
      const block = Math.max(28, width * 0.8); // a touch narrower than the water
      const stepLen = block * 0.7; // overlap so the band has no gaps
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(segLen / stepLen));
        for (let t = 0; t <= steps; t++) {
          const px = Phaser.Math.Linear(a.x, b.x, t / steps);
          const py = Phaser.Math.Linear(a.y, b.y, t / steps);
          if (this.worldZoneSystem.isOnBridge(px, py)) continue; // leave the crossing open
          const body = this.add.rectangle(px, py, block, block, 0x000000, 0);
          body.setVisible(false);
          this.physics.add.existing(body, true);
          this.riverColliders.add(body);
        }
      }
    };

    this.worldZoneSystem.channels.forEach(({ path, width }) => addBlockers(path, width));

    this.physics.add.collider(this.player, this.riverColliders);
    this.physics.add.collider(this.slimeGroup, this.riverColliders);
    this.physics.add.collider(this.skeletonGroup, this.riverColliders);
  }

  // --- Organic tree clusters (Sprint 10c revised) ---------------------------
  // Trees scatter in clusters (centre, radius, density) rather than rows. Meadow-
  // border clusters are sparse + decorative; mid-forest clusters are denser
  // barriers; the deep-forest pockets are densest. sqrt() radius sampling spreads
  // trees evenly to the cluster edge, and random placement keeps clusters
  // passable rather than solid walls. Visuals batch into one Graphics; only
  // collidable trees get a (small) static body.
  createOrganicTrees() {
    this.treeColliders = this.physics.add.staticGroup();
    const g = this.add.graphics().setDepth(3);
    // Use real tree art when the sheet + carved frames are present (Sprint 10d),
    // else fall back to the vector canopy drawn into `g`.
    this._treeSprites = this.textures.exists('trees') && this.textures.get('trees').has('tree_big');

    const CLUSTERS = [
      // Meadow-border clusters — sparse, decorative (no collision).
      { x: 300, y: 1050, r: 150, density: 0.3, collide: false },
      { x: 2800, y: 950, r: 120, density: 0.3, collide: false },
      { x: 1100, y: 1200, r: 100, density: 0.25, collide: false },
      // Mid-forest barriers — denser, with collision.
      { x: 600, y: 1350, r: 180, density: 0.5, collide: true },
      { x: 1300, y: 1400, r: 160, density: 0.45, collide: true },
      { x: 2000, y: 1350, r: 170, density: 0.5, collide: true },
      { x: 2600, y: 1420, r: 150, density: 0.45, collide: true },
      // Deep-forest pockets — densest.
      { x: 500, y: 2050, r: 300, density: 0.6, collide: true },
      { x: 1600, y: 2150, r: 280, density: 0.55, collide: true },
      { x: 2700, y: 2050, r: 300, density: 0.6, collide: true },
      // Scattered individuals bridging the clusters.
      { x: 900, y: 1650, r: 80, density: 0.4, collide: true },
      { x: 1950, y: 1680, r: 80, density: 0.4, collide: true },
      { x: 1200, y: 1950, r: 100, density: 0.45, collide: true },
      { x: 2150, y: 1950, r: 100, density: 0.45, collide: true }
    ];

    const PER_CLUSTER_CAP = 60; // bound the densest pockets for physics sanity
    CLUSTERS.forEach((cluster) => {
      const raw = Math.floor((Math.PI * cluster.r * cluster.r * cluster.density) / 2600);
      const count = Math.min(raw, PER_CLUSTER_CAP);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * cluster.r; // uniform area fill
        const tx = cluster.x + Math.cos(angle) * dist;
        const ty = cluster.y + Math.sin(angle) * dist;

        if (tx < 20 || tx > WORLD_WIDTH - 20) continue;
        if (ty < GARDEN_ZONE_HEIGHT + 50 || ty > WORLD_HEIGHT - 20) continue; // never in the garden
        if (this.worldZoneSystem.isNearRiver(tx, ty, 24)) continue; // not in the water
        if (this.worldZoneSystem.isOnBridge(tx, ty)) continue; // keep crossings clear
        // Never bury a seed under a trunk.
        const onSeed = this.seeds.some(
          (s) => Phaser.Math.Distance.Between(tx, ty, s.x, s.y) < 50
        );
        if (onSeed) continue;

        this.placeTree(g, tx, ty);
        if (cluster.collide) {
          // Physics trunk narrower than the visual so the player can squeeze the
          // edges — only the trunk core is solid.
          const trunk = this.add.rectangle(tx, ty + 6, 14, 12, 0x000000, 0);
          trunk.setVisible(false);
          this.physics.add.existing(trunk, true);
          this.treeColliders.add(trunk);
        }
      }
    });

    this.physics.add.collider(this.player, this.treeColliders);
    this.physics.add.collider(this.slimeGroup, this.treeColliders);
    this.physics.add.collider(this.skeletonGroup, this.treeColliders);
  }

  // Place one tree at (x, y): a real tree sprite when art is loaded (frame + size
  // chosen by biome so the deep forest gets the big canopy and the meadow gets
  // small/fruited trees), else the vector canopy. Sprites are depth-sorted by Y so
  // nearer trees overlap farther ones, and all sit below the player (depth 10).
  placeTree(g, x, y) {
    if (!this._treeSprites) {
      this.drawTree(g, x, y);
      return;
    }
    const zone = this.worldZoneSystem.getZoneAt(x, y);
    let frame;
    let scale;
    if (zone === 'deep_forest') {
      frame = 'tree_big';
      scale = 0.9 + Math.random() * 0.25;
    } else if (zone === 'meadow') {
      frame = Math.random() < 0.5 ? 'tree_fruit' : 'tree_small_a';
      scale = 1.0 + Math.random() * 0.2;
    } else {
      frame = Math.random() < 0.5 ? 'tree_small_a' : 'tree_small_b';
      scale = 1.2 + Math.random() * 0.3;
    }
    this.add
      .image(x, y, 'trees', frame)
      .setOrigin(0.5, 0.85) // root the trunk near (x, y) where the collider sits
      .setScale(scale)
      .setDepth(3 + (y / WORLD_HEIGHT) * 3);
  }

  // Draw one tree (trunk + canopy) into the shared Graphics with slight size and
  // shade variation so a cluster doesn't look stamped.
  drawTree(g, x, y) {
    const h = 26 + Math.random() * 14;
    const canopyR = 15 + Math.random() * 9;
    g.fillStyle(0x1a4a0a, 1);
    g.fillRect(x - 4, y - h / 2, 8, h);
    g.fillStyle(Math.random() < 0.5 ? 0x2a6a1a : 0x246016, 1);
    g.fillCircle(x, y - h / 2, canopyR);
  }

  setupBounds() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  spawnSlimes() {
    this.slimeGroup = this.physics.add.group();
    // Reuse pool for dark-slime split children (Sprint 4) — mirrors the
    // projectile pool so on-death splits never churn allocations.
    this.splitSlimePool = [];

    // Green slimes roam the meadow + mid-forest (Sprint 10c revised) — placed via
    // the organic zone system so they never start in the water or deep forest.
    const initialGreens = 5;
    for (let i = 0; i < initialGreens; i++) {
      const pos = this.getSpawnPositionInZone(['meadow', 'mid_forest']);
      this.spawnSlime('green_slime', pos.x, pos.y);
    }

    // New Game+ seeds the forest with extra green slimes from day 1 so the run
    // is visibly denser even before day-based scaling kicks in.
    if (this.newGamePlus) {
      const mult = this.gameData.newGamePlus.enemyDensityMult || 1;
      const extra = Math.round(initialGreens * (mult - 1));
      for (let i = 0; i < extra; i++) this.spawnSlime('green_slime');
    }
  }

  // Spawn a single slime, optionally at a given position (random forest spot
  // otherwise). Registers it in both the physics group and the unified enemies
  // array. Used by the initial placement and by day-based dark-slime scaling.
  spawnSlime(type, x, y) {
    if (x === undefined || y === undefined) {
      // Spawn (and respawn) each slime type in its biome band (Sprint 10c).
      const pos =
        type === 'dark_slime'
          ? this.randomDarkSlimePosition()
          : this.randomGreenSlimePosition();
      x = pos.x;
      y = pos.y;
    }
    // Level (Sprint 5) drives stats + the per-level body tint (dark slimes get
    // their purple identity from levelTint, so no manual tint is needed here).
    const level = this.computeEnemyLevel(x, y);
    const slime = new Slime(this, x, y, type, this.gameData, { level });
    this.slimeGroup.add(slime);
    this.enemies.push(slime);
    return slime;
  }

  // Dark slime fracture (Sprint 4): on death, spawn smaller pooled slimes at the
  // death spot. Children are drawn from splitSlimePool (or built once and added),
  // carry halved HP + reduced damage, never split again, and the total active
  // slime count is capped so a chain can't snowball on mobile.
  spawnDarkSlimeSplit(x, y, parentLevel) {
    const cfg = this.gameData.enemies.dark_slime.split;
    if (!cfg) return;
    const cap = this.gameData.enemies.scaling.maxActiveSlimes || 16;
    // Children inherit the parent's level; high-level dark slimes shed more pieces
    // (Sprint 5), still bounded by the total-slime cap from Sprint 4.
    const level = Phaser.Math.Clamp(Math.round(parentLevel || 1), 1, 5);
    const count = cfg.splitCountByLevel ? cfg.splitCountByLevel[level - 1] : cfg.count;
    const scatter = 14;
    const opts = {
      canSplit: false,
      pooled: true,
      isSplitChild: true,
      hpFactor: cfg.hpFactor,
      damageFactor: cfg.damageFactor,
      scaleFactor: cfg.scaleFactor,
      level
    };
    for (let i = 0; i < count; i++) {
      const activeSlimes = this.enemies.filter(
        (e) => e.slimeType === 'green_slime' || e.slimeType === 'dark_slime'
      ).length;
      if (activeSlimes >= cap) break; // cap reached — stop fracturing
      const cx = x + (Math.random() - 0.5) * scatter * 2;
      const cy = y + (Math.random() - 0.5) * scatter * 2;
      let slime = this.splitSlimePool.pop();
      if (slime) {
        // Reused: it never left slimeGroup (mirrors the projectile pool), so just
        // reactivate it in place, re-derived at the inherited level.
        slime.resetForReuse(cx, cy, level);
      } else {
        slime = new Slime(this, cx, cy, 'dark_slime', this.gameData, opts);
        this.slimeGroup.add(slime);
      }
      this.enemies.push(slime);
    }
  }

  // Park a dead split slime for reuse — kept in slimeGroup but inactive (disabled
  // body skips overlaps) and out of the active enemies array (already spliced out
  // by the slime's death). Mirrors the projectile pool's toggle-don't-remove idiom.
  releaseSplitSlime(slime) {
    slime.setActive(false);
    slime.setVisible(false);
    if (slime.body) slime.body.enable = false;
    this.splitSlimePool.push(slime);
  }

  // Normal calls (no args) place a skeleton at a random deep-forest spot. The
  // dev menu passes an explicit position to spawn one at the player.
  spawnSkeleton(devX, devY) {
    const margin = ENEMY_SPAWN_MARGIN;
    const devSpawn = devX !== undefined && devY !== undefined;
    // Normal skeletons spawn inside a deep-forest pocket (Sprint 10c revised);
    // the dev menu drops one at an explicit position.
    let baseX;
    let baseY;
    if (devSpawn) {
      baseX = devX;
      baseY = devY;
    } else {
      const pos = this.getSpawnPositionInZone(['deep_forest']);
      baseX = pos.x;
      baseY = pos.y;
    }

    // Three patrol waypoints fanned around the spawn point. Waypoints clamp to the
    // forest band (below the garden) so they stay near the zone-query spawn point;
    // the old deepMinY (0.7*WORLD_HEIGHT) clamp pushed them far south of the actual
    // deep_forest zone (~y2000), making skeletons immediately walk away (Sprint 6/3d).
    const minY = GARDEN_ZONE_HEIGHT + margin;
    const clampX = (v) => Phaser.Math.Clamp(v, margin, WORLD_WIDTH - margin);
    const clampY = (v) => Phaser.Math.Clamp(v, minY, WORLD_HEIGHT - margin);
    const s = SKELETON_PATROL_SPREAD;
    const waypoints = [
      { x: clampX(baseX - s), y: clampY(baseY) },
      { x: clampX(baseX + s), y: clampY(baseY - s / 2) },
      { x: clampX(baseX), y: clampY(baseY + s / 2) }
    ];

    // Variant by danger (Sprint 7): the leveling gradient is distance-from-home,
    // so high-level spawns are the far/outer perimeter → mega; nearer/lower → the
    // smaller standard skeleton. The Skeleton clamps level into its variant band.
    const level = this.computeEnemyLevel(baseX, baseY);
    const variant = level >= 4 ? 'mega' : 'standard';
    const skeleton = new Skeleton(this, baseX, baseY, waypoints, this.gameData, { level, variant });
    this.skeletonGroup.add(skeleton);
    this.enemies.push(skeleton);
    return skeleton;
  }

  randomForestPosition() {
    const margin = ENEMY_SPAWN_MARGIN;
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = Phaser.Math.Between(margin, WORLD_WIDTH - margin);
      const y = Phaser.Math.Between(GARDEN_ZONE_HEIGHT + margin, WORLD_HEIGHT - margin);
      if (!this.isInGarden(x, y)) return { x, y };
    }
    return { x: margin, y: WORLD_HEIGHT - margin };
  }

  // True when (x, y) falls inside the garden homestead (plus a small margin) — used
  // to keep enemy spawns out of the safe centred garden (Sprint 9). The garden moved
  // from the top band to the world centre, so spawn gating can no longer rely on the
  // legacy GARDEN_ZONE_HEIGHT top-strip test alone.
  isInGarden(x, y) {
    const m = 48;
    return (
      x >= GARDEN_LEFT - m && x <= GARDEN_RIGHT + m &&
      y >= GARDEN_TOP - m && y <= GARDEN_BOTTOM + m
    );
  }

  // Green slimes roam the meadow + mid-forest (Sprint 10c revised).
  randomGreenSlimePosition() {
    return this.getSpawnPositionInZone(['meadow', 'mid_forest']);
  }

  // Dark slimes roam the mid + deep forest — the dangerous lower map (Sprint 10c).
  randomDarkSlimePosition() {
    return this.getSpawnPositionInZone(['mid_forest', 'deep_forest']);
  }

  // Reject-sample a forest point until it lands in one of `zoneNames` and clear of
  // the river (Sprint 10c revised). Falls back to a safe mid-map point if no valid
  // spot turns up, so spawning never returns undefined.
  getSpawnPositionInZone(zoneNames) {
    const margin = ENEMY_SPAWN_MARGIN;
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Phaser.Math.Between(margin, WORLD_WIDTH - margin);
      const y = Phaser.Math.Between(GARDEN_ZONE_HEIGHT + margin, WORLD_HEIGHT - margin);
      if (this.worldZoneSystem.isNearRiver(x, y)) continue;
      if (this.isInGarden(x, y)) continue; // never inside the safe centred garden (Sprint 9)
      if (zoneNames.includes(this.worldZoneSystem.getZoneAt(x, y))) return { x, y };
    }
    return { x: WORLD_WIDTH / 2, y: GARDEN_ZONE_HEIGHT + 400 };
  }

  // --- Zone boundary (Sprint 7) ---------------------------------------------
  // The garden homestead fence: a solid wooden fence on all four sides of the
  // centered garden square, each side broken by an 80px gate gap in its middle.
  // The fence has both a visual (brown planks) and static physics colliders. The
  // player collides with the solid runs but can walk out through any of the four
  // gates; enemies collide too, and their confineToForest() clamp seals the gaps
  // so they can never follow the player inside.
  createGardenFence() {
    const FENCE_COLOR = 0xc0904f;
    const THICK = 10; // fence/plank thickness (visual + body)
    const GAP = 80; // gate gap width, centred on each side
    this.gardenFences = this.physics.add.staticGroup();
    // Real fence sprites (Sprint 10d) when the sheet loaded, else brown planks.
    const useSprites = this.textures.exists('fences');

    const segment = (x, y, w, h) => {
      if (useSprites) this.drawFenceRun(x, y, w, h);
      else this.add.rectangle(x, y, w, h, FENCE_COLOR).setDepth(4); // visual
      const body = this.add.rectangle(x, y, w, h, 0x000000, 0).setVisible(false);
      this.physics.add.existing(body, true); // static collider
      this.gardenFences.add(body);
    };

    // Top & bottom: two horizontal runs flanking the centred gate gap.
    const runH = (GARDEN_WIDTH - GAP) / 2; // length of each flank
    [GARDEN_TOP, GARDEN_BOTTOM].forEach((y) => {
      segment(GARDEN_LEFT + runH / 2, y, runH, THICK);
      segment(GARDEN_RIGHT - runH / 2, y, runH, THICK);
    });

    // Left & right: two vertical runs flanking the centred gate gap.
    const runV = (GARDEN_HEIGHT - GAP) / 2;
    [GARDEN_LEFT, GARDEN_RIGHT].forEach((x) => {
      segment(x, GARDEN_TOP + runV / 2, THICK, runV);
      segment(x, GARDEN_BOTTOM - runV / 2, THICK, runV);
    });

    if (useSprites) {
      // Corner posts at the four garden corners tie the runs together.
      [
        [GARDEN_LEFT, GARDEN_TOP],
        [GARDEN_RIGHT, GARDEN_TOP],
        [GARDEN_LEFT, GARDEN_BOTTOM],
        [GARDEN_RIGHT, GARDEN_BOTTOM]
      ].forEach(([x, y]) => this.add.image(x, y, 'fences', 0).setScale(FENCE_SCALE).setDepth(4));
    }

    this.createGardenGates();

    this.physics.add.collider(this.player, this.gardenFences);
    this.physics.add.collider(this.slimeGroup, this.gardenFences);
    this.physics.add.collider(this.skeletonGroup, this.gardenFences);
  }

  // Lay fence-post sprites along one fence run (Sprint 10d). Horizontal runs tile
  // the rail frames (left-end 1, middle 2, right-end 3); vertical runs stack the
  // post frame (8). The collider body is created separately by the caller.
  drawFenceRun(x, y, w, h) {
    const TILE = 16;
    if (w >= h) {
      const left = x - w / 2;
      const n = Math.max(1, Math.round(w / TILE));
      for (let i = 0; i < n; i++) {
        const frame = i === 0 ? 1 : i === n - 1 ? 3 : 2;
        this.add
          .image(left + i * TILE + TILE / 2, y, 'fences', frame)
          .setScale(FENCE_SCALE)
          .setDepth(4);
      }
    } else {
      const top = y - h / 2;
      const n = Math.max(1, Math.round(h / TILE));
      for (let i = 0; i < n; i++) {
        this.add
          .image(x, top + i * TILE + TILE / 2, 'fences', 8)
          .setScale(FENCE_SCALE)
          .setDepth(4);
      }
    }
  }

  // Animated gate sprites in each of the four gate gaps (Sprint 10d). A closed
  // gate sits in each opening and swings open when the player is near it, closing
  // again once they move off — a small life-in-the-world touch. No-op without art.
  createGardenGates() {
    this.gateSprites = [];
    if (!this.textures.exists('fence_gates')) return;

    if (!this.anims.exists('gate_open')) {
      this.anims.create({
        key: 'gate_open',
        frames: this.anims.generateFrameNumbers('fence_gates', { start: 0, end: 6 }),
        frameRate: 12,
        repeat: 0
      });
      this.anims.create({
        key: 'gate_close',
        frames: this.anims.generateFrameNumbers('fence_gates', { start: 6, end: 0 }),
        frameRate: 12,
        repeat: 0
      });
    }

    const cx = GARDEN_LEFT + GARDEN_WIDTH / 2;
    const cy = GARDEN_TOP + GARDEN_HEIGHT / 2;
    [
      { x: cx, y: GARDEN_TOP },
      { x: cx, y: GARDEN_BOTTOM },
      { x: GARDEN_LEFT, y: cy },
      { x: GARDEN_RIGHT, y: cy }
    ].forEach((p) => {
      const gate = this.add
        .sprite(p.x, p.y, 'fence_gates', 0)
        .setScale(FENCE_SCALE)
        .setDepth(5);
      gate._open = false;
      this.gateSprites.push(gate);
    });
  }

  // Open gates the player is standing near, close the rest (Sprint 10d). Cheap —
  // four distance checks per frame, and the animation only fires on state change.
  updateGates() {
    if (!this.gateSprites || this.gateSprites.length === 0) return;
    const OPEN_DIST = 70;
    for (const gate of this.gateSprites) {
      const near =
        Phaser.Math.Distance.Between(this.player.x, this.player.y, gate.x, gate.y) < OPEN_DIST;
      if (near && !gate._open) {
        gate._open = true;
        gate.play('gate_open');
      } else if (!near && gate._open) {
        gate._open = false;
        gate.play('gate_close');
      }
    }
  }

  // Enemy body overlap. First-ever contact fires the attack tutorial hint once
  // (Sprint 12); the enemy then requests damage as usual (Player owns i-frames).
  onEnemyTouch(enemy) {
    if (!this._firstEnemyContactEmitted) {
      this._firstEnemyContactEmitted = true;
      EventBus.emit('tutorial:enemyContact', {});
    }
    if (enemy && enemy.touchPlayer) enemy.touchPlayer();
  }

  // --- Pause menu (Sprint 12) -----------------------------------------------

  // Esc during normal play opens the pause overlay. Guarded against every modal
  // state and the sleep fade so it never double-handles an Esc those already own.
  tryOpenPause() {
    if (!GameState.is('PLAYING')) return;
    if (this._sleeping || this._paused) return;
    if (
      this._upgradeOpen ||
      this._marketOpen ||
      this._winOpen ||
      this._signpostOpen ||
      this._dictionaryOpen ||
      this._worldDetailOpen ||
      this._swapPickerOpen ||
      this._plantPickerOpen
    ) {
      return;
    }
    this._paused = true;
    this.player.setVelocity(0, 0);
    GameState.transition('PAUSED'); // PLAYING → PAUSED
    this.physics.pause();
    this.scene.launch('PauseScene', {
      dayNumber: this.daySystem.dayNumber,
      zone: this.currentZone
    });
    this.scene.bringToTop('PauseScene');
  }

  onPauseResume() {
    if (!this._paused) return;
    this._paused = false;
    if (GameState.is('PAUSED')) {
      GameState.transition('PLAYING');
      this.physics.resume();
    }
  }

  // First-day-only nudge toward the gate: fires once when the player gets close
  // to the garden/forest crossing (Sprint 12 tutorial).
  checkNearGate() {
    if (this.daySystem.dayNumber !== 1) {
      this._nearGateEmitted = true; // past day 1 the hint is irrelevant — stop checking
      return;
    }
    const d = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      WORLD_WIDTH / 2,
      GARDEN_ZONE_HEIGHT
    );
    if (d < 80) {
      this._nearGateEmitted = true;
      EventBus.emit('tutorial:nearGate', {});
    }
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
    this.shake('bundle_collect');
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
    // Seeds sit in their organic biome (Sprint 10c revised). Meadow pockets are
    // easy entrance seeds; mid-forest is moderate risk; the best seeds (glowshroom)
    // live deep in the three forest pockets, reachable only across the bridges.
    const placements = [
      // MEADOW POCKETS — easy reach (speed + defense trees, 1-day grow).
      ['carrots', 700, 1050],
      ['cauliflower', 2500, 950],
      ['sunflower', 1500, 1100],
      ['white_carrots', 400, 1280],
      ['red_lettuce', 2750, 1350],
      // MID FOREST — moderate risk (attack / crit / harvest trees, 2-day grow).
      ['tomato', 600, 1400],
      ['corn', 2000, 1380],
      ['pumpkin', 1400, 1450],
      ['wheat', 250, 1480],
      ['cucumber', 2950, 1460],
      ['eggplant', 1100, 1350],
      ['bok_choy', 2200, 1400],
      // DEEP FOREST POCKETS — high risk, best seeds (magic tree, 3-day grow).
      ['blue_flower_2', 450, 2050], // left pocket
      ['red_berry', 1650, 2150], // center pocket
      ['pineapple', 2750, 2000], // right pocket
      ['beanstalk', 1200, 1900],
      ['eggplant', 2100, 1950]
    ];
    placements.forEach(([type, x, y]) => {
      const pos = this.clearOfRiver(x, y);
      // eslint-disable-next-line no-new
      new Seed(this, pos.x, pos.y, type, this.gameData);
    });
  }

  // Nudge a point off the water so a seed never strands mid-river. Returns the
  // original point when already clear, else the nearest clear point found by
  // searching outward rings (favouring vertical moves toward the seed's biome).
  clearOfRiver(x, y) {
    if (!this.worldZoneSystem.isNearRiver(x, y, 16)) return { x, y };
    const dirs = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
      [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]
    ];
    for (let radius = 40; radius <= 200; radius += 40) {
      for (const [dx, dy] of dirs) {
        const nx = Phaser.Math.Clamp(x + dx * radius, 40, WORLD_WIDTH - 40);
        const ny = Phaser.Math.Clamp(y + dy * radius, GARDEN_ZONE_HEIGHT + 40, WORLD_HEIGHT - 40);
        if (!this.worldZoneSystem.isNearRiver(nx, ny, 16)) return { x: nx, y: ny };
      }
    }
    return { x, y };
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
    const bed = new GardenBed(this, pos.x, pos.y, i, this.gameData);
    this.beds.push(bed);
    this.addBedSoil(bed); // give spawned beds the same tilled-soil frame as the starters
  }

  spawnGardenStructures() {
    // Interactive-structure labels are hidden until the player is close (Sprint 8
    // polish) — registered here and toggled by updateStructureLabels().
    this._structureLabels = [];

    // Well — fill the watering can here. Real Sprout Lands well sprite when the
    // art is present (Sprint 10), else the Sprint 2 placeholder rectangle.
    // Garden-interior Y coords are GARDEN_TOP-relative so they followed the
    // Sprint 9 re-centre (the +280 / +660 offsets reproduce the old y=480 / y=860).
    const WELL_Y = GARDEN_TOP + 280; // was 480
    if (this.textures.exists('obj_well')) {
      this.well = this.add.image(2880, WELL_Y, 'obj_well').setScale(2).setDepth(2);
    } else {
      this.well = this.add
        .rectangle(2880, WELL_Y, 50, 50, 0x3b6ea5)
        .setStrokeStyle(3, 0x244a6e)
        .setDepth(2);
    }
    this.addStructureLabel(2880, WELL_Y, 2880, WELL_Y - 40, 'WELL', '#ABC4DE');

    // Sleep bed — advance the day. Uses a bed slice from the Sprout Lands
    // Basic_Furniture sheet when present; the crop region is a best fit and can be
    // nudged (x/y/w/h below) if it lands off the bed.
    const SLEEP_Y = GARDEN_TOP + 280; // was 480
    if (this.textures.exists('furniture_sheet')) {
      const furnTex = this.textures.get('furniture_sheet');
      if (!furnTex.has('bed')) furnTex.add('bed', 0, 0, 48, 64, 48);
      this.sleepObject = this.add
        .image(3520, SLEEP_Y, 'furniture_sheet', 'bed')
        .setDisplaySize(96, 72)
        .setDepth(2);
    } else {
      this.sleepObject = this.add
        .rectangle(3520, SLEEP_Y, 72, 48, 0x8a5a3a)
        .setStrokeStyle(3, 0x5a3a22)
        .setDepth(2);
    }
    this.addStructureLabel(3520, SLEEP_Y, 3520, SLEEP_Y - 42, 'SLEEP  [F]', '#EDD49A');

    // Workshop station — open the upgrade overlay. Prefers the workbench art
    // (Sprint 3-polish), then the chest sheet (48x48, open frames), then a
    // placeholder rect. The open animation is per-visual: the workbench/chest pop,
    // the placeholder does the Sprint 9 scaleY squash. `this.chest` stays the
    // handle every interaction path already uses, whichever art is shown.
    this._stationIsWorkbench = this.textures.exists('work_station');
    this._chestIsSprite = !this._stationIsWorkbench && this.textures.exists('obj_chest');
    if (this._stationIsWorkbench) {
      this.chest = this.add
        .image(CHEST_X, CHEST_Y, 'work_station')
        .setScale(WORKBENCH_SCALE)
        .setDepth(2);
    } else if (this._chestIsSprite) {
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
    const SIGN_X = 3120;
    const SIGN_Y = GARDEN_TOP + 660; // was 860
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
    const BOOK_X = 3000;
    const BOOK_Y = GARDEN_TOP + 660; // was 860
    this.add.rectangle(BOOK_X, BOOK_Y + 14, 8, 36, 0x6e4a22).setDepth(2); // stand
    this.book = this.add
      .rectangle(BOOK_X, BOOK_Y - 8, 30, 22, 0x395a7a)
      .setStrokeStyle(2, 0xabc4de)
      .setDepth(2);
    this.addStructureLabel(BOOK_X, BOOK_Y, BOOK_X, BOOK_Y - 34, 'FIELD NOTES  [F]', '#ABC4DE');

    // Market stall (Sprint 3) — opens the marketplace (sell plants / buy gear +
    // capacity). Placeholder ember-toned stall until a real shop sprite lands;
    // placement is the MARKET_X/MARKET_Y config point.
    this.add.rectangle(MARKET_X, MARKET_Y + 16, 64, 10, 0x6e4a22).setDepth(2); // counter base
    this.market = this.add
      .rectangle(MARKET_X, MARKET_Y - 8, 60, 40, 0xc96b42)
      .setStrokeStyle(3, 0xe5b69a)
      .setDepth(2);
    this.add
      .rectangle(MARKET_X, MARKET_Y - 30, 72, 12, 0x8a3a22)
      .setStrokeStyle(2, 0x5a2a18)
      .setDepth(2); // awning
    this.addStructureLabel(MARKET_X, MARKET_Y, MARKET_X, MARKET_Y - 44, 'MARKET  [F]', '#E5B69A');

    // Solid garden props get a small static collider so the player routes around
    // them (Sprint 10c). Interaction stays distance-based, so this never blocks
    // the [F] prompt — only the body of the object is impassable.
    this.addPropCollision(this.signpost, 10, 20);
    this.addPropCollision(this.book, 24, 16);
    this.addPropCollision(this.market, 56, 24);
  }

  // Give a static prop a narrow collider and route the player around it.
  addPropCollision(obj, w, h) {
    if (!obj) return;
    this.physics.add.existing(obj, true); // static body
    obj.body.setSize(w, h);
    if (this.player) this.physics.add.collider(this.player, obj);
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
    consider(this.market, INTERACT_RANGE, () => ({ text: '[F] Open Market', actionable: true }));
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
      if (this.distinctSeedCount() >= 2) {
        return { text: '[F] Choose a seed to plant', actionable: true };
      }
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
    // (deep forest, across the river). Tight rings of the small-mushroom frames.
    const glowshroomZones = [[700, 1700], [2500, 1800]];
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

  // --- Tileset prop scatter (Sprint 10d) ------------------------------------
  // Themed mushrooms / flowers from the Sprout Lands props sheet, clustered around
  // each seed spawn so a biome's seed reads at a glance (red mushrooms by the red-
  // mushroom seed, blue flowers by the blue-flower seed, etc.), plus a few rocks.
  // Frames verified by eye against the sheet (row 0 mushrooms, row 1 stones, row 2
  // bushes, row 3 flowers incl. the yellow sunflower at 38, row 4 blue/purple).
  scatterTilesetProps() {
    if (!this.textures.exists('mushrooms_flowers') || !this.seeds) return;
    // v3 (Sprint 6/3d): keyed to the new catalog by dominant colour (decorative
    // hint near each seed; the mushrooms/flowers/stones sheet has no crop art, so
    // these are approximate — unmapped plants simply get no scatter). Flagged.
    const FRAME_BY_PLANT = {
      tomato: 0, red_berry: 0, red_lettuce: 0, pumpkin: 0, // red/orange → red mushroom
      eggplant: 4, // purple → purple mushroom
      sunflower: 38, corn: 38, pineapple: 38, wheat: 38, // yellow/gold → sunflower
      beanstalk: 24, cucumber: 24, bok_choy: 24, cauliflower: 24, // green → bush tuft
      blue_flower_2: 52 // blue → blue flower
    };
    const ROCK_FRAMES = [13, 14, 15];

    this.seeds.forEach((seed) => {
      const frame = FRAME_BY_PLANT[seed.plantType];
      if (frame === undefined) return;
      const count = 2 + Math.floor(Math.random() * 2); // 2–3 per seed
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 34 + Math.random() * 26;
        const px = seed.x + Math.cos(angle) * dist;
        const py = seed.y + Math.sin(angle) * dist;
        if (this.worldZoneSystem.isNearRiver(px, py, 12)) continue;
        if (py < GARDEN_ZONE_HEIGHT) continue; // keep decor out of the garden
        this.add.image(px, py, 'mushrooms_flowers', frame).setScale(1.6).setDepth(2);
      }
    });

    // A sparse rock scatter through the mid/deep forest for ground texture.
    for (let i = 0; i < 22; i++) {
      const px = Phaser.Math.Between(ENEMY_SPAWN_MARGIN, WORLD_WIDTH - ENEMY_SPAWN_MARGIN);
      const py = Phaser.Math.Between(GARDEN_ZONE_HEIGHT + 200, WORLD_HEIGHT - 200);
      if (this.worldZoneSystem.isNearRiver(px, py, 16)) continue;
      const onSeed = this.seeds.some((s) => Phaser.Math.Distance.Between(px, py, s.x, s.y) < 50);
      if (onSeed) continue;
      const frame = ROCK_FRAMES[Math.floor(Math.random() * ROCK_FRAMES.length)];
      this.add.image(px, py, 'mushrooms_flowers', frame).setScale(1.4).setDepth(2);
    }
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

  // --- Garden ambience (Sprint 13) ------------------------------------------
  // Warm pollen/dust motes drifting up through the safe zone so the garden feels
  // inhabited. Reuses the dust sheet when present, else a tiny generated pixel.
  createGardenAmbience() {
    let texKey = 'fx_dust';
    let frameCfg = { frame: [0, 1, 2, 3] };
    if (!this.textures.exists('fx_dust')) {
      if (!this.textures.exists('px_pollen')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 2, 2);
        g.generateTexture('px_pollen', 2, 2);
        g.destroy();
      }
      texKey = 'px_pollen';
      frameCfg = {};
    }
    this.gardenAmbient = this.add.particles(0, 0, texKey, {
      ...frameCfg,
      x: { min: GARDEN_X, max: GARDEN_X + GARDEN_WIDTH },
      y: { min: GARDEN_Y, max: GARDEN_Y + GARDEN_HEIGHT },
      speedY: { min: -20, max: -8 },
      speedX: { min: -5, max: 5 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.3, end: 0 },
      lifespan: { min: 3000, max: 6000 },
      frequency: 1200,
      quantity: 1,
      tint: [0xffffaa, 0xaaffaa, 0xffddaa] // warm pollen colours
    }).setDepth(6);
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
    // The planting picker owns input while open — F does nothing until the
    // player chooses a seed or cancels (Sprint 10c). Likewise a modal overlay
    // (workshop / market) owns input until dismissed (matters on mobile, where
    // the touch interact button can still fire while the world loop is frozen).
    if (this._plantPickerOpen || this._upgradeOpen || this._marketOpen) return;
    // Priority: chest > sleep > well > garden bed > seed swap. Objects are
    // spatially separated so only one is ever in range, but ordering keeps it
    // deterministic.
    if (this.chest && this.within(this.chest, INTERACT_RANGE)) {
      this.openUpgrade();
      return;
    }
    if (this.market && this.within(this.market, INTERACT_RANGE)) {
      this.openMarket();
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
      if (idx === -1) return false; // no seeds — prompt already shows "Need a seed"
      // Two or more DIFFERENT seed types → let the player choose (and compare
      // grow times) via the picker. One type (even if several) plants directly.
      if (this.distinctSeedCount() >= 2) {
        this.openPlantPicker(bed);
        return true;
      }
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

  // --- Planting picker (Sprint 10c) -----------------------------------------
  // With 2+ different seeds, F over an empty bed opens a centered picker so the
  // player can compare grow times and choose. UIScene draws it; GameScene owns
  // the bed and performs the plant on confirmation.

  distinctSeedCount() {
    const types = new Set(this.player.seedSlots.filter((s) => s !== null));
    return types.size;
  }

  openPlantPicker(bed) {
    if (this._plantPickerOpen) return;
    this._plantPickerOpen = true;
    this._plantPickerBed = bed;
    this.player.setVelocity(0, 0);
    EventBus.emit('bed:plantPrompt', {
      bedIndex: bed.bedIndex,
      slots: [...this.player.seedSlots],
      hasGoldenCan: this.player.equippedGear.wateringCan === 'golden_can'
    });
  }

  // UIScene confirmed a choice — plant the chosen slot into the bed.
  onPlantConfirmed({ bedIndex, plantType, slotIndex }) {
    this._plantPickerOpen = false;
    this._plantPickerBed = null;
    const bed = this.beds[bedIndex];
    if (!bed || !bed.isEmpty()) return; // bed changed under us — abort safely
    // Re-validate the slot still holds the chosen type (inventory may have
    // shifted); fall back to the first matching slot.
    let idx = slotIndex;
    if (this.player.seedSlots[idx] !== plantType) {
      idx = this.player.seedSlots.indexOf(plantType);
      if (idx === -1) return;
    }
    const pt = this.player.removeSeedAt(idx);
    bed.plant(pt);
  }

  // UIScene cancelled (Esc / Cancel) — just clear our open state.
  onPlantPickerCancelled() {
    this._plantPickerOpen = false;
    this._plantPickerBed = null;
  }

  // Walked away from the bed with the picker open → close it without planting.
  updatePlantPicker() {
    if (!this._plantPickerOpen) return;
    const bed = this._plantPickerBed;
    if (!bed) return;
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, bed.x, bed.y);
    if (d > SWAP_TIMEOUT_DIST) {
      this._plantPickerOpen = false;
      this._plantPickerBed = null;
      EventBus.emit('bed:plantPromptClose', {}); // tell UIScene to dismiss
    }
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
        hasCollision: true, // a post — solid, walk around it
        title: 'An Old Marker',
        text: "A weathered post, half-rotted into the soil. Something is carved into the wood — initials, maybe, or a tally. It's been here longer than the overgrowth."
      },
      {
        x: 380, y: 2120, frame: 1,
        hasCollision: true, // stacked stones — solid
        title: 'Stacked Stones',
        text: 'Seven flat stones balanced deliberately beside the stream. Someone took care with this. The moss on the bottom stone is years old.'
      },
      {
        x: 1000, y: 2350, frame: 2,
        hasCollision: true, // a fallen trunk — solid
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
          hasCollision: !!d.hasCollision,
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
      // Scattered meadow rocks (Sprint 10c) — cover geometry in the entrance band.
      { x: 600, y: GARDEN_ZONE_HEIGHT + 150, count: 3 },
      { x: 2600, y: GARDEN_ZONE_HEIGHT + 250, count: 3 },
      // Mid + deep forest formations.
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
    // High-value crops for the daily gift (v3 Sprint 6/3d): the magic tree plus a
    // sell-only melon, weighted toward the magic crops.
    const rarePlants = ['blue_flower_2', 'red_berry', 'pineapple', 'blue_flower_2', 'watermelon'];
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

      // Hold on black for a beat (Sprint 12) so the morning doesn't snap back too
      // fast, then fade in and wash a warm "opening your eyes" flash over it.
      this.time.delayedCall(300, () => {
        this.cameras.main.fadeIn(SLEEP_FADE_MS, 0, 0, 0);
        this.cameras.main.once('camerafadeincomplete', () => this.screenFlash(0xfff1d6, 0.2, 400));
        this._sleeping = false;
      });
    });
  }

  // Screen-fixed colour wash that fades out — used for the gate-crossing flash,
  // the morning-light wake flash, and the death vignette pulse (Sprint 12). Sits
  // above the world but below the parallel HUD scene.
  screenFlash(color, alpha, duration) {
    const f = this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, color, alpha)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(60);
    this.tweens.add({
      targets: f,
      alpha: 0,
      duration,
      onComplete: () => f.destroy()
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

  // Applied live by the Settings overlay (Sprint 12). Mutates the same settings
  // object AudioSystem holds (so SFX volume tracks immediately), retunes the
  // current music bed, mirrors mute to the SoundManager, and persists the slot.
  applyAudioSettings(settings) {
    Object.assign(this.audioSettings, settings);
    this.sound.mute = !!this.audioSettings.muted;
    if (this.bgm && this.currentBgmKey && this.bgm[this.currentBgmKey]) {
      this.bgm[this.currentBgmKey].setVolume(this.musicVol());
    }
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
    // Brief screen-edge flash acknowledging the zone crossing (Sprint 12).
    this.screenFlash(0xffffff, 0.1, 200);
    // First-run tutorial: distinct triggers per direction (Sprint 12).
    EventBus.emit(zone === 'forest' ? 'tutorial:enteredForest' : 'tutorial:enteredGarden', {});
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
    // The forest just turned dangerous — the biggest shake of the day (Sprint 13).
    this.shake('day_timer_expire');
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

  // Spawn cadence only (Sprint 5): day gates which enemy TYPES are present and
  // tops them up to a fixed baseline population. Per-enemy difficulty is driven
  // solely by level (see computeEnemyLevel, which folds in a day bump) — there is
  // no day-based stat or count ramp, so only one scaling system is active.
  handleEnemyScaling(dayNumber) {
    const scaling = this.gameData.enemies.scaling;
    // New Game+ scales the baseline population (and split cap) proportionally.
    const mult = this.newGamePlus ? this.gameData.newGamePlus.enemyDensityMult || 1 : 1;

    if (dayNumber >= scaling.startDay_darkSlime) {
      const target = Math.ceil((scaling.darkSlimeBaseline || MAX_DARK_SLIMES) * mult);
      const have = this.enemies.filter((e) => e.slimeType === 'dark_slime').length;
      for (let i = 0; i < target - have; i++) this.spawnSlime('dark_slime');
    }

    if (dayNumber >= scaling.startDay_skeleton) {
      if (!this.enemies.some((e) => e instanceof Skeleton)) this.spawnSkeleton();
    }
  }

  // --- Enemy level + player-power read (Sprint 5) ----------------------------

  // The level (1-5) for an enemy spawning at (x, y). An authored zone level wins
  // when present; otherwise a procedural distance-from-home gradient. The current
  // day is folded in as a bump (single scaling system), plus a small per-guard
  // spread so a zone isn't perfectly uniform (Sprint 6 chest guards need variety).
  computeEnemyLevel(x, y) {
    const cfg = this.gameData.enemies.leveling;
    const zoneLevel = this.worldZoneSystem.getZoneLevelAt
      ? this.worldZoneSystem.getZoneLevelAt(x, y)
      : null;
    let base;
    if (zoneLevel != null) {
      base = zoneLevel;
    } else {
      const dist = Phaser.Math.Distance.Between(x, y, ENEMY_HOME.x, ENEMY_HOME.y);
      const t = Phaser.Math.Clamp(dist / cfg.distanceForMaxLevel, 0, 1);
      base = 1 + Math.floor(t * 5);
    }
    const day = this.daySystem ? this.daySystem.dayNumber : 1;
    const dayBump = cfg.dayLevelBumpEvery ? Math.floor((day - 1) / cfg.dayLevelBumpEvery) : 0;
    const spread = cfg.spread ? Phaser.Math.Between(-cfg.spread, cfg.spread) : 0;
    return Phaser.Math.Clamp(base + dayBump + spread, 1, 5);
  }

  // A 1-5 read of player power from invested stat-tree tiers + owned gear tiers.
  computePlayerPowerLevel() {
    let statSum = 0;
    let statMax = 0;
    Object.keys(this.gameData.upgrades).forEach((pt) => {
      statSum += (this.upgradeLevels[pt] && this.upgradeLevels[pt].stat) || 0;
      statMax += this.gameData.upgrades[pt].stat.levels;
    });
    let gearSum = 0;
    let gearMax = 0;
    GEAR_SLOTS.forEach((slot) => {
      gearSum += this.gearTierIndex(slot) + 1; // -1 (none) → 0
      gearMax += (this.economyData.gear[slot] || []).length;
    });
    const invest = statSum * PLAYER_POWER.statWeight + gearSum * PLAYER_POWER.gearWeight;
    const maxInvest = statMax * PLAYER_POWER.statWeight + gearMax * PLAYER_POWER.gearWeight;
    const frac = maxInvest > 0 ? invest / maxInvest : 0;
    return Phaser.Math.Clamp(1 + Math.floor(frac * 5), 1, 5);
  }

  // Recompute cached player power and refresh every enemy's danger marker, so the
  // same enemies shift from red toward yellow/green as the player grows.
  recomputePlayerPower() {
    this.playerPowerLevel = this.computePlayerPowerLevel();
    if (this.enemies) {
      this.enemies.forEach((e) => {
        if (e.refreshDangerColor) e.refreshDangerColor();
      });
    }
  }

  // Marker color rule (provisional, tunable): safe at/below player power, risky
  // one level above, dangerous two or more above.
  dangerColorForLevel(level) {
    const c = this.gameData.enemies.leveling.dangerColors;
    const p = this.playerPowerLevel || 1;
    if (level <= p) return c.safe;
    if (level === p + 1) return c.risky;
    return c.dangerous;
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
    // First time the satchel fills, nudge the player home to plant (Sprint 12).
    if (!this._firstFillEmitted && this.player.isFull()) {
      this._firstFillEmitted = true;
      EventBus.emit('tutorial:inventoryFull', {});
    }
    // The first-run seed arrow has served its purpose once a seed is in hand.
    if (!this._seedArrowDone) {
      this._seedArrowDone = true;
      if (this._seedArrow) {
        this._seedArrow.destroy();
        this._seedArrow = null;
      }
    }
    if (!position) return;
    const plant = this.gameData.plants[plantType];
    this.particleSystem.seedCollect(position, plant ? plant.color : '#ffffff');
  }

  onUpgradePurchased(d) {
    this.runStats.upgradesPurchased++;
    this.shake('upgrade_purchase');
    this.autoSave();
    this.recomputePlayerPower(); // stat tier changed → refresh enemy danger colors
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

  // Full win (v2): every plant's stat track maxed. Gear/capacity are coin-funded
  // convenience now, not part of the win condition.
  checkFullWin() {
    if (this._fullWinTriggered) return;
    const allMaxed = Object.entries(this.gameData.upgrades).every(
      ([pt, tree]) => this.upgradeLevels[pt].stat >= tree.stat.levels
    );
    if (!allMaxed) return;
    this._fullWinTriggered = true;
    EventBus.emit('win:full', {});
  }

  onPlayerDied() {
    if (this._respawning) return;
    this._respawning = true;
    this.runStats.deaths++; // run summary

    // Red vignette pulse + the heaviest shake the instant you fall — "that was
    // bad" communicated viscerally before the respawn fade starts (Sprint 12/13).
    this.shake('player_death');
    this.screenFlash(0x8a0000, 0.35, 500);
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
      this.player.respawn(GARDEN_X + GARDEN_WIDTH / 2, GARDEN_Y + GARDEN_HEIGHT / 2);
      this.cameras.main.fadeIn(RESPAWN_FADE_MS);
      this._respawning = false;
    });
  }

  onPlayerDamaged(d) {
    // Only react to applied-damage notifications (which carry currentHP), not
    // the raw per-frame damage requests slimes emit on overlap.
    if (d.currentHP === undefined) return;
    this.shake('player_hit');
  }

  // Screenshake by named profile (Sprint 13). Different impacts feel different.
  // --- Mobile performance profile (Sprint Mobile) ---------------------------
  // Throttle enemy AI to every Nth frame, halve particle counts, slow the garden
  // ambience, and respect prefers-reduced-motion for screenshake. Desktop returns
  // immediately and keeps full fidelity.
  applyMobileOptimizations() {
    if (!this._mobile) return;

    // Honour the OS "reduce motion" switch — kill screenshake when it's set.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.screenShakeEnabled = false;
    }

    // Halve combat/feedback particle counts.
    if (this.particleSystem) this.particleSystem.mobileMode = true;

    // Slow the warm garden pollen so it isn't constantly emitting on a mobile GPU.
    if (this.gardenAmbient && this.gardenAmbient.setFrequency) {
      this.gardenAmbient.setFrequency(3000);
    }

    // Update enemy AI every 3rd frame (physics still moves them every frame).
    this.slimeUpdateInterval = 3;
    this.slimeUpdateFrame = 0;
  }

  shake(profile) {
    if (!this.screenShakeEnabled) return;
    const p = SHAKE_PROFILES[profile];
    if (p) this.cameras.main.shake(p.duration, p.intensity);
  }

  // Melee blow connected — pick the shake profile by weapon, or the heavier
  // skeleton profile when a skeleton was among the targets (Sprint 13).
  onMeleeLanded({ weapon, hitSkeleton }) {
    if (hitSkeleton) {
      this.shake('skeleton_hit');
      return;
    }
    if (weapon === 'sword') this.shake('sword_hit');
    else if (weapon === 'dagger') this.shake('dagger_hit');
    else this.shake('hands_hit');
  }

  onEnemyDied({ type, position, light }) {
    this.runStats.enemiesDefeated++;
    if (this.runStats.killsByType[type] !== undefined) this.runStats.killsByType[type]++;
    // Per-type death flourish (Sprint 13) — particles emit from the enemy's spot.
    // `light` (Sprint 4) marks a small split-child death: skip the heavy burst +
    // screen flash so a multi-slime fight doesn't stack desaturate flashes.
    if (type === 'dark_slime' && !light) {
      this.particleSystem.darkSlimeBurst(position.x, position.y);
      this.screenFlash(0x000000, 0.15, 300); // brief desaturate flash for the bigger kill
    } else if (type === 'skeleton') {
      this.particleSystem.skeletonBones(position.x, position.y);
      this.shake('skeleton_hit'); // a final rattle
    } else {
      // Plain green slimes + light split-child deaths get the small splat.
      this.particleSystem.slimeSplat(position.x, position.y, ENEMY_DEATH_COLORS[type] || '#8AB87E');
    }
    this.scheduleGreenSlimeRespawn();
  }

  // Keep the forest populated. Green slimes only spawn once at world setup, so
  // without this they thin out and never return as the player clears them. After
  // any enemy dies, top green slimes back up to the day-scaled target after the
  // per-enemy respawn cooldown (Sprint 4: raised from 30s to 3 in-game minutes so
  // a cleared area stays clear long enough to matter). Dark slimes and skeletons
  // have their own day-based scaling.
  scheduleGreenSlimeRespawn() {
    const respawnMs = this.gameData.enemies.green_slime.respawnCooldownMs;
    this.time.delayedCall(respawnMs, () => {
      if (!this.enemies) return;
      const greens = this.enemies.filter((e) => e.slimeType === 'green_slime').length;
      if (greens < this.getTargetGreenSlimeCount()) this.spawnSlime('green_slime');
    });
  }

  // Base green-slime count plus a slow per-day ramp, capped, so deeper runs stay
  // dense without overwhelming early days.
  // Fixed baseline green population (Sprint 5): difficulty comes from per-enemy
  // level, not from spawning more green slimes as days pass.
  getTargetGreenSlimeCount() {
    return this.gameData.enemies.scaling.greenSlimeBaseCount;
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

  // Opens before the overlay appears. Workbench image → a self-restoring pop (the
  // yoyo returns it to its base scale); chest sprite → swap to the open frame with
  // a pop; placeholder rectangle → the Sprint 9 scaleY squash.
  animateChestOpen(done) {
    if (!this.chest) {
      done();
      return;
    }
    if (this._stationIsWorkbench) {
      this.tweens.add({
        targets: this.chest,
        scaleX: WORKBENCH_SCALE * 1.12,
        scaleY: WORKBENCH_SCALE * 1.12,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => this.time.delayedCall(120, done)
      });
    } else if (this._chestIsSprite) {
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

  // --- Marketplace (Sprint 3) -----------------------------------------------

  openMarket() {
    if (this._marketOpen) return;
    this._marketOpen = true;
    this.player.setVelocity(0, 0);
    if (this._swapPickerOpen) this.closeSwapPicker(false);
    EventBus.emit('market:opened', {});
    this.scene.launch('MarketplaceScene');
    // Render above the HUD scene (as every other overlay does) so no stray HUD
    // sprite — e.g. a lingering combo counter mid-screen — bleeds into the panel.
    this.scene.bringToTop('MarketplaceScene');
  }

  onMarketClosed() {
    this._marketOpen = false;
  }

  // Plant sell value scales with grow time (economy.json.sellPrices, keyed by
  // growthDays). Returns coins per unit.
  sellPrice(plantType) {
    const plant = this.gameData.plants[plantType];
    if (!plant) return 0;
    return this.economyData.sellPrices[String(plant.growthDays)] || 0;
  }

  // Sell up to `qty` of a plant for coins. Routes the payout through addCoins so
  // the HUD + save stay in sync; never sells more than the player owns.
  sellPlant(plantType, qty = 1) {
    const have = this.plantBank[plantType] || 0;
    const n = Math.min(qty, have);
    if (n <= 0) return { ok: false };
    const total = this.sellPrice(plantType) * n;
    this.plantBank[plantType] -= n;
    this.addCoins(total); // emits coins:changed + autoSave
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
    EventBus.emit('plant:sold', { plantType, qty: n, coins: total });
    return { ok: true, qty: n, coins: total };
  }

  onUpgradeClosed() {
    this._upgradeOpen = false;
    if (!this.chest) return;
    // Settle the station back to rest: workbench/chest reset their scale/frame, the
    // placeholder reverses its squash tween.
    if (this._stationIsWorkbench) {
      this.chest.setScale(WORKBENCH_SCALE); // safety — the open pop's yoyo already restored it
    } else if (this._chestIsSprite) {
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

  // Called by UpgradeScene (the workshop chest). v2: STAT upgrades only — plants
  // buy stat levels here; gear + capacity are coin-funded elsewhere. Validates
  // affordability, deducts plants, applies the effect, and broadcasts the change.
  purchaseUpgrade(plantType, track = 'stat') {
    if (track !== 'stat') return { ok: false };
    const def = this.gameData.upgrades[plantType];
    const lv = this.upgradeLevels[plantType];

    if (lv.stat >= def.stat.levels) return { ok: false };
    const cost = def.stat.costs[lv.stat];
    if (this.plantBank[plantType] < cost) return { ok: false };
    this.plantBank[plantType] -= cost;
    lv.stat += 1;
    this.applyStatEffect(plantType);
    this.player.recalculateStats();
    if (def.stat.statKey === 'timerBonus') {
      this.daySystem.setTimerBonus(this.player.statBonuses.timerBonus);
    }
    EventBus.emit('upgrade:purchased', { plantType, track: 'stat', newLevel: lv.stat, cost });
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
    this.checkFullWin();
    return { ok: true, newLevel: lv.stat, cost };
  }

  // Replay all saved progression onto the freshly-built player (once, on load):
  // plant-funded stat trees, then coin-funded gear + capacity.
  applyAllUpgrades() {
    Object.keys(this.upgradeLevels).forEach((plantType) => {
      const lv = this.upgradeLevels[plantType];
      if (lv.stat > 0) this.applyStatEffect(plantType);
    });
    this.applyEquippedGear();
    this.applySeedBagTier();
    this.applyGardenBedTier();
    this.applyWateringTier();
    this.player.recalculateStats();
    this.daySystem.setTimerBonus(this.player.statBonuses.timerBonus);
  }

  applyStatEffect(plantType) {
    // v3 (Sprint 6/3d): a stat tree is now fed by THREE plants that share one
    // statKey. Recompute the bonus by SUMMING every upgrade entry with the same
    // statKey, so contributions stack and no single plant's level overwrites the
    // others' (the old `= perLevelBonus * level` was last-write-wins and broke
    // with multiple plants per stat). Recompute-from-scratch keeps it idempotent.
    const statKey = this.gameData.upgrades[plantType].stat.statKey;
    let total = 0;
    Object.keys(this.gameData.upgrades).forEach((pt) => {
      const s = this.gameData.upgrades[pt].stat;
      if (s.statKey !== statKey) return;
      const lvl = (this.upgradeLevels[pt] && this.upgradeLevels[pt].stat) || 0;
      total += s.perLevelBonus * lvl;
    });
    this.player.statBonuses[statKey] = total;
  }

  // --- Coins (Sprint 2 dual economy) ----------------------------------------
  // SINGLE mutation path for banked coins. The cheat menu, the Sprint 3
  // marketplace (plant selling) and every gear/capacity purchase go through
  // addCoins/spendCoins — never write this.coins directly. A future sortie sprint
  // adds a "pending coins" layer (earned in the world, banked only on returning
  // home) that will sit alongside this path; keeping all banked writes here keeps
  // that refactor local. spendCoins refuses to overdraw (coins never go negative).

  addCoins(amount) {
    if (!amount) return this.coins;
    this.coins += amount;
    EventBus.emit('coins:changed', { coins: this.coins, delta: amount });
    this.autoSave();
    return this.coins;
  }

  spendCoins(amount) {
    if (amount <= 0 || this.coins < amount) return false;
    this.coins -= amount;
    EventBus.emit('coins:spent', { coins: this.coins, amount });
    EventBus.emit('coins:changed', { coins: this.coins, delta: -amount });
    this.autoSave();
    return true;
  }

  // --- Coin-funded gear -----------------------------------------------------
  // economy.json.gear[slot] is an ordered, strictly-better tier list. The index
  // of the equipped item is derived from equippedGear[slot]'s id (-1 = none).

  gearTierIndex(slot) {
    const id = this.player.equippedGear[slot];
    if (!id) return -1;
    return (this.economyData.gear[slot] || []).findIndex((g) => g.id === id);
  }

  // Apply a catalog tier's stats to the player for its slot (does not touch coins).
  equipGearTier(slot, tier) {
    switch (slot) {
      case 'weapon':
        this.player.equipWeapon(tier);
        break;
      case 'armor':
        this.player.equipArmor(tier);
        break;
      case 'boots':
        this.player.equipBoots(tier);
        break;
      case 'ranged':
        this.player.equipRanged(tier);
        break;
      default:
        break;
    }
    this.player.recalculateStats();
  }

  // Re-equip whatever the save had (called on load). Skips empty/unknown ids.
  applyEquippedGear() {
    const saved = (this.saveData && this.saveData.equippedGear) || {};
    GEAR_SLOTS.forEach((slot) => {
      const id = saved[slot];
      if (!id) return;
      const tier = (this.economyData.gear[slot] || []).find((g) => g.id === id);
      if (tier) this.equipGearTier(slot, tier);
    });
    this.recomputePlayerPower(); // restored gear on load → seed danger colors
  }

  // Buy the NEXT tier in a slot with coins. Used by the marketplace (Sprint 3);
  // the dev "grant all gear" cheat uses grantGearTier directly.
  purchaseGear(slot, tierId) {
    const list = this.economyData.gear[slot] || [];
    const idx = list.findIndex((g) => g.id === tierId);
    if (idx < 0) return { ok: false };
    if (idx !== this.gearTierIndex(slot) + 1) return { ok: false }; // must buy in order
    const tier = list[idx];
    if (!this.spendCoins(tier.price)) return { ok: false };
    this.grantGearTier(slot, tier);
    return { ok: true, slot, tierId: tier.id, price: tier.price };
  }

  // Equip a tier and broadcast it (no coin cost). Shared by purchases + cheats.
  grantGearTier(slot, tier) {
    this.equipGearTier(slot, tier);
    EventBus.emit('gear:purchased', { slot, tierId: tier.id, price: tier.price });
    EventBus.emit('gear:equipped', { slot, tierId: tier.id });
    this.autoSave();
    this.recomputePlayerPower(); // gear tier changed → refresh enemy danger colors
  }

  // --- Coin-funded capacity (three independent trees) -----------------------
  // economy.json.capacity[tree] = { base, tiers:[...] }; the bought tier count
  // lives on this[CAPACITY_TIER_FIELD[tree]] (seedBagTier/gardenBedTier/wateringTier).

  capacityValue(tree, key) {
    const def = this.economyData.capacity[tree];
    const tier = this[CAPACITY_TIER_FIELD[tree]] || 0;
    return tier > 0 ? def.tiers[tier - 1][key] : def.base;
  }

  applySeedBagTier() {
    this.player.resizeSeedSlots(this.capacityValue('seedBag', 'slots'));
  }

  applyGardenBedTier() {
    const target = this.capacityValue('gardenBeds', 'beds');
    while (this.beds.length < target) this.addGardenBed();
  }

  applyWateringTier() {
    this.player.setWaterCapacity(this.capacityValue('watering', 'capacity'));
  }

  // Buy the next tier of one capacity tree with coins. Used by the marketplace
  // (Sprint 3). seedBag → carry slots, gardenBeds → bed count, watering → charges.
  purchaseCapacity(tree) {
    const def = this.economyData.capacity[tree];
    const field = CAPACITY_TIER_FIELD[tree];
    if (!def || !field) return { ok: false };
    const nextTier = (this[field] || 0) + 1;
    if (nextTier > def.tiers.length) return { ok: false }; // already maxed
    const price = def.tiers[nextTier - 1].price;
    if (!this.spendCoins(price)) return { ok: false };
    this[field] = nextTier;
    if (tree === 'seedBag') this.applySeedBagTier();
    else if (tree === 'gardenBeds') this.applyGardenBedTier();
    else if (tree === 'watering') this.applyWateringTier();
    EventBus.emit('capacity:purchased', { tree, tier: nextTier, price });
    this.autoSave();
    return { ok: true, tree, tier: nextTier, price };
  }

  // --- Save (Sprint 4) ------------------------------------------------------

  buildCurrentState() {
    return {
      dayNumber: this.daySystem.dayNumber,
      totalPlaytime: Math.floor(this._playtimeMs / 1000),
      bank: { ...this.plantBank },
      coins: this.coins,
      upgrades: JSON.parse(JSON.stringify(this.upgradeLevels)),
      equippedGear: { ...this.player.equippedGear },
      seedBagTier: this.seedBagTier,
      gardenBedTier: this.gardenBedTier,
      wateringTier: this.wateringTier,
      gardenBeds: this.beds.map((b) => b.serialize()),
      plantsGrownEver: { ...this.plantsGrownEver },
      // Sprint 11 retention state.
      todayWeather: this.daySystem && this.daySystem.todayWeather ? this.daySystem.todayWeather.id : null,
      dailySeedCollected: this._dailySeedCollected,
      dailySeedToastShown: this._dailySeedToastShown,
      discoveredPlants: [...this.discoveredPlants],
      tutorialsSeen: [...this.tutorialsSeen],
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
    this.subscribe('dev:addCoins', (d) => this.devAddCoins(d));
    this.subscribe('dev:day', (d) => this.devDay(d));
    this.subscribe('dev:grantGear', () => this.devGrantAllGear());
    this.subscribe('dev:maxStats', () => this.devMaxAllStats());
    this.subscribe('dev:fullHeal', () => this.player.healToFull());
    this.subscribe('dev:restoreAmmo', () => this.player.restoreAmmo());
    this.subscribe('dev:spawnEnemy', (d) => this.devSpawnEnemy(d));
    this.subscribe('dev:clearEnemies', () => this.devClearEnemies());
    this.subscribe('dev:clearSave', () => this.devClearSave());
    this.subscribe('dev:forceSave', () => this.devForceSave());
    this.subscribe('dev:toggleSpeed', (d) => this.devToggleSpeed(d));
    this.subscribe('dev:toggleNoclip', (d) => this.devToggleNoclip(d));
    this.subscribe('dev:maxCapacity', () => this.devMaxCapacity());
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

  // Coins go through the single addCoins path so the HUD + save stay in sync.
  devAddCoins({ amount }) {
    this.addCoins(amount);
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

  // Equip the top tier of every gear slot via the coin-gear path (free in dev).
  devGrantAllGear() {
    GEAR_SLOTS.forEach((slot) => {
      const list = this.economyData.gear[slot] || [];
      if (!list.length) return;
      this.grantGearTier(slot, list[list.length - 1]);
    });
    this.syncHud();
  }

  devMaxAllStats() {
    // Set every level first, THEN recompute — applyStatEffect now sums across all
    // plants sharing a statKey, so all levels must be in place before recompute.
    Object.keys(this.gameData.upgrades).forEach((pt) => {
      this.upgradeLevels[pt].stat = this.gameData.upgrades[pt].stat.levels;
    });
    Object.keys(this.gameData.upgrades).forEach((pt) => this.applyStatEffect(pt));
    this.player.recalculateStats();
    this.daySystem.setTimerBonus(this.player.statBonuses.timerBonus);
    this.syncHud();
    this.recomputePlayerPower(); // maxed stats → refresh enemy danger colors
  }

  // Cheat: 2x player move speed (runtime only, never saved). Sprint 7.
  devToggleSpeed({ on } = {}) {
    this.player.devSpeedMult = on ? 2 : 1;
    this.player.recalculateStats();
  }

  // Cheat: no-clip — the player body collides with nothing (river, trees, fences,
  // world bounds) while active. Runtime only; toggle off to restore. Sprint 7.
  devToggleNoclip({ on } = {}) {
    this._noclip = !!on;
    const body = this.player && this.player.body;
    if (!body) return;
    body.checkCollision.none = !!on;
    this.player.setCollideWorldBounds(!on);
  }

  // Cheat: buy every capacity tree to its max tier (no coin cost). Sets the tier
  // directly and applies it, mirroring purchaseCapacity's effects + events so the
  // marketplace/HUD update. Sprint 7. Fills the gap left by "Grant All Gear".
  devMaxCapacity() {
    ['seedBag', 'gardenBeds', 'watering'].forEach((tree) => {
      const def = this.economyData.capacity[tree];
      const field = CAPACITY_TIER_FIELD[tree];
      if (!def || !field) return;
      this[field] = def.tiers.length; // max tier index
      if (tree === 'seedBag') this.applySeedBagTier();
      else if (tree === 'gardenBeds') this.applyGardenBedTier();
      else if (tree === 'watering') this.applyWateringTier();
      EventBus.emit('capacity:purchased', { tree, tier: this[field], price: 0 });
    });
    this.player.recalculateStats();
    this.syncHud();
    this.autoSave();
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
      if (e.levelMarker) {
        e.levelMarker.destroy();
        e.levelMarker = null;
      }
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
    if (this._fpsText) this._fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
    if (!GameState.is('PLAYING')) return;
    // Freeze the world (but keep rendering) while a modal overlay (workshop,
    // market, win, achievement log, or seed dictionary) is open. The world-detail
    // popup is non-modal, so it deliberately does NOT freeze the world.
    if (this._upgradeOpen || this._marketOpen || this._winOpen || this._signpostOpen || this._dictionaryOpen) return;

    const dt = delta / 1000;
    this._playtimeMs += delta;

    this.player.update(dt);
    // Mobile throttles enemy AI to every Nth frame (passing the scaled dt so
    // timers stay correct); desktop updates every enemy every frame.
    if (this._mobile && this.slimeUpdateInterval > 1) {
      this.slimeUpdateFrame = (this.slimeUpdateFrame + 1) % this.slimeUpdateInterval;
      if (this.slimeUpdateFrame === 0) {
        this.enemies.forEach((e) => e.update(dt * this.slimeUpdateInterval, this.player));
      }
    } else {
      this.enemies.forEach((e) => e.update(dt, this.player));
    }
    this.daySystem.update(delta);
    this.combatSystem.update(delta); // combo lapse timer (Sprint 13)
    this.updateSeeds();
    this.updateStructureLabels();
    this.updateInteractPrompt();
    this.updatePlantPicker();
    if (!this._nearGateEmitted) this.checkNearGate();
    this.updateSeedArrow(delta);
    this.updateMinimapBroadcast(delta);
    this.updateGates(); // Sprint 10d — swing garden gates open near the player

    // Sprint 10d — slow downstream drift so the river reads as flowing water.
    if (this.waterTiles) {
      for (const t of this.waterTiles) t.tilePositionX += delta * 0.004;
    }

    if (Phaser.Input.Keyboard.JustDown(this.fKey)) {
      this.handleInteract();
    }
  }

  // --- First-run seed arrow (Sprint 12) -------------------------------------
  // On the very first forest visit, if the player stands still for 5s without
  // collecting anything, a pulsing arrow points at the nearest seed. It vanishes
  // the moment they move. One-shot helper: disables itself once seeds are found.
  updateSeedArrow(delta) {
    if (this._seedArrowDone) return;
    // Only relevant on day 1, in the forest, before the first seed is collected.
    if (this.daySystem.dayNumber !== 1 || this.currentZone !== 'forest' || this.runStats.seedsCollected > 0) {
      this.hideSeedArrow();
      return;
    }
    const speed = this.player.body ? this.player.body.velocity.length() : 0;
    if (speed > 4) {
      this._stillMs = 0;
      this.hideSeedArrow();
      return;
    }
    this._stillMs = (this._stillMs || 0) + delta;
    if (this._stillMs < 5000) {
      this.hideSeedArrow();
      return;
    }
    // Point at the nearest collectible seed.
    let target = null;
    let best = Infinity;
    for (const s of this.seeds) {
      if (!s.active || s.collected || !s.collectible) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y);
      if (d < best) {
        best = d;
        target = s;
      }
    }
    if (!target) {
      this.hideSeedArrow();
      return;
    }
    if (!this._seedArrow) {
      this._seedArrow = this.add.triangle(0, 0, 0, -10, 12, 10, -12, 10, 0xffee88).setDepth(40);
      this.tweens.add({
        targets: this._seedArrow,
        scale: { from: 0.85, to: 1.2 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
    const ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    this._seedArrow.setPosition(this.player.x + Math.cos(ang) * 44, this.player.y + Math.sin(ang) * 44);
    this._seedArrow.setRotation(ang + Math.PI / 2);
    this._seedArrow.setVisible(true);
  }

  hideSeedArrow() {
    if (this._seedArrow) this._seedArrow.setVisible(false);
  }

  // Throttled player-position broadcast for the HUD minimap (Sprint 10c). Emitted
  // every 300ms rather than per frame — the dot only needs coarse updates.
  updateMinimapBroadcast(delta) {
    this._playerMovedAccum += delta;
    if (this._playerMovedAccum < 300) return;
    this._playerMovedAccum = 0;
    EventBus.emit('player:moved', { x: this.player.x, y: this.player.y });
  }

  shutdown() {
    this._busHandlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._busHandlers = [];
    if (this.tutorialSystem) this.tutorialSystem.cleanup();
    if (this.bgm) {
      Object.values(this.bgm).forEach((snd) => snd.stop());
    }
  }
}
