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
  TILE_SIZE
} from '../core/Constants.js';
import Player from '../entities/Player.js';
import Slime from '../entities/Slime.js';
import Skeleton from '../entities/Skeleton.js';
import Seed from '../entities/Seed.js';
import GardenBed from '../entities/GardenBed.js';
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
    this._busHandlers = [];

    // --- Win / New Game+ / run-stats state (Sprint 5) ---
    this.newGamePlus = !!this.saveData.newGamePlus;
    this._demoWinTriggered = !!this.saveData.demoWinTriggered;
    this._fullWinTriggered = false;
    this.runStats = { enemiesDefeated: 0, upgradesPurchased: 0 };
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

    // --- Day timer (extracted system) ---
    this.daySystem = new DaySystem(this, this.gameData);
    this.daySystem.dayNumber = this.saveData.dayNumber || 1;

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

    // --- HUD scene ---
    this.scene.launch('UIScene', { dayNumber: this.daySystem.dayNumber });
    // Push the full restored HUD state once UIScene has booted and subscribed.
    this.time.delayedCall(0, () => this.syncHud());

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
      this.add
        .tileSprite(0, forestY, WORLD_WIDTH, forestHeight, 'tileset_forest')
        .setOrigin(0, 0)
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

    this.add
      .text(WORLD_WIDTH / 2, GARDEN_ZONE_HEIGHT / 2, 'GARDEN', {
        fontFamily: '"Courier New", monospace',
        fontSize: '120px',
        fontStyle: 'bold',
        color: '#4f7344'
      })
      .setOrigin(0.5)
      .setAlpha(0.25)
      .setDepth(0);
    this.add
      .text(WORLD_WIDTH / 2, forestY + forestHeight / 2, 'FOREST', {
        fontFamily: '"Courier New", monospace',
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

  spawnSkeleton() {
    const margin = ENEMY_SPAWN_MARGIN;
    const deepMinY = Math.ceil(WORLD_HEIGHT * DEEP_FOREST_THRESHOLD);
    const baseX = Phaser.Math.Between(margin, WORLD_WIDTH - margin);
    const baseY = Phaser.Math.Between(deepMinY, WORLD_HEIGHT - margin);

    // Three patrol waypoints fanned around the spawn point, clamped to the deep
    // forest band and world bounds.
    const clampX = (v) => Phaser.Math.Clamp(v, margin, WORLD_WIDTH - margin);
    const clampY = (v) => Phaser.Math.Clamp(v, deepMinY, WORLD_HEIGHT - margin);
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
    if (!bundle || bundle.collected) return;
    const pt = bundle.plantType;
    this.plantBank[pt] = (this.plantBank[pt] || 0) + 1;
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
    bundle.collect(); // emits bundle:collected, then self-destructs
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
      if (!seed.active || seed.collected) continue;
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
        if (this.player.addSeed(seed.plantType)) {
          const recovered = seed.isDespawning;
          seed.collect();
          EventBus.emit('seed:collected', {
            plantType: seed.plantType,
            position: { x: seed.x, y: seed.y }
          });
          if (recovered) EventBus.emit('seed:recovered', { plantType: seed.plantType });
        }
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
    const dropped = this.player.dropSeed(dropSlotIndex); // chosen seed lands at the player's feet
    this.player.addSeed(seed.plantType); // fills the freed slot
    seed.collect();
    EventBus.emit('seed:collected', {
      plantType: seed.plantType,
      position: { x: seed.x, y: seed.y }
    });
    if (recovered) EventBus.emit('seed:recovered', { plantType: seed.plantType });
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
    // Well — fill the watering can here.
    this.well = this.add
      .rectangle(1050, 360, 50, 50, 0x3b6ea5)
      .setStrokeStyle(3, 0x244a6e)
      .setDepth(2);
    this.add
      .text(1050, 320, 'WELL', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#ABC4DE'
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    // Sleep bed — advance the day.
    this.sleepObject = this.add
      .rectangle(2150, 360, 72, 48, 0x8a5a3a)
      .setStrokeStyle(3, 0x5a3a22)
      .setDepth(2);
    this.add
      .text(2150, 318, 'SLEEP', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#EDD49A'
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    // Workshop chest — open the upgrade overlay.
    this.chest = this.add
      .rectangle(CHEST_X, CHEST_Y, 64, 48, 0x6e4a22)
      .setStrokeStyle(3, 0xd4a83f)
      .setDepth(2);
    this.add
      .text(CHEST_X, CHEST_Y - 38, 'WORKSHOP', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#EDD49A'
      })
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.add
      .text(CHEST_X, CHEST_Y + 34, '[F] Upgrades', {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: '#9B9389'
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    // Signpost — open the achievement log. Placed near the chest but well
    // outside its interaction radius so the two never overlap.
    const SIGN_X = 1480;
    const SIGN_Y = 560;
    this.add.rectangle(SIGN_X, SIGN_Y + 14, 8, 40, 0x6e4a22).setDepth(2); // post
    this.signpost = this.add
      .rectangle(SIGN_X, SIGN_Y - 8, 48, 30, 0x8a6a3a)
      .setStrokeStyle(2, 0x5a3a22)
      .setDepth(2);
    this.add
      .text(SIGN_X, SIGN_Y - 36, 'LOG', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#EDD49A'
      })
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.add
      .text(SIGN_X, SIGN_Y + 38, '[F] Achievements', {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: '#9B9389'
      })
      .setOrigin(0.5, 0)
      .setDepth(20);
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
    if (bed.isGrowing() && this.player.hasWater) {
      this.waterBedsFrom(bed);
      this.player.hasWater = false;
      EventBus.emit('player:usedWater', {});
      return true;
    }
    return false;
  }

  // Water the targeted bed, plus extra growing beds up to the can's bedsPerUse
  // (Sprint 4 watering-can upgrade — golden can soaks the whole garden).
  waterBedsFrom(primary) {
    const perUse = this.player.wateringCan.bedsPerUse || 1;
    primary.water();
    let watered = 1;
    if (perUse > 1) {
      for (const bed of this.beds) {
        if (watered >= perUse) break;
        if (bed !== primary && bed.isGrowing() && !bed.watered) {
          bed.water();
          watered++;
        }
      }
    }
  }

  getWater() {
    if (this.player.hasWater) return;
    this.player.hasWater = true;
    EventBus.emit('player:gotWater', {});
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
    // The gate chime is played by AudioSystem on 'player:zoneChanged'.
    this.crossfadeTo(zone === 'forest' ? 'bgm_forest' : 'bgm_garden');
    // Timer counts only in the forest, and never restarts once already expired.
    this.daySystem.setTimerActive(zone === 'forest' && this.daySystem.timerRemaining > 0);
    // Auto-save whenever the player reaches the safety of the garden.
    if (zone === 'garden') this.autoSave();
  }

  onPlayerSlept() {
    this.player.restoreAmmo(); // refill ranged ammo each new day
    this.autoSave();
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
    this.handleEnemyScaling(d ? d.dayNumber : this.daySystem.dayNumber);
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

  onPlantHarvested({ plantType, position }) {
    if (this.plantBank[plantType] === undefined) this.plantBank[plantType] = 0;
    this.plantBank[plantType]++;
    if (this.plantsGrownEver[plantType] === undefined) this.plantsGrownEver[plantType] = 0;
    this.plantsGrownEver[plantType]++;
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
    if (position) this.particleSystem.harvestBurst(position);
    this.checkDemoWin();
  }

  onSeedCollected({ plantType, position }) {
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
    const allGrown = Object.keys(this.gameData.plants).every(
      (pt) => (this.plantsGrownEver[pt] || 0) >= 1
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
    const color = ENEMY_DEATH_COLORS[type] || '#ffffff';
    this.particleSystem.showDeathBurst(position.x, position.y, color);
  }

  // --- Upgrade economy (Sprint 4) -------------------------------------------

  openUpgrade() {
    if (this._upgradeOpen) return;
    this._upgradeOpen = true;
    this.player.setVelocity(0, 0);
    if (this._swapPickerOpen) this.closeSwapPicker(false);
    EventBus.emit('upgrade:opened', {});
    this.scene.launch('UpgradeScene');
  }

  onUpgradeClosed() {
    this._upgradeOpen = false;
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
      plantsGrown: { ...this.plantsGrownEver }
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
    this.player.recalculateStats();
    this.daySystem.setTimerBonus(this.player.statBonuses.timerBonus);
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

  // --- Main loop ------------------------------------------------------------

  update(time, delta) {
    if (!GameState.is('PLAYING')) return;
    // Freeze the world (but keep rendering) while an overlay (workshop, win, or
    // achievement log) is open.
    if (this._upgradeOpen || this._winOpen || this._signpostOpen) return;

    const dt = delta / 1000;
    this._playtimeMs += delta;

    this.player.update(dt);
    this.enemies.forEach((e) => e.update(dt, this.player));
    this.daySystem.update(delta);
    this.updateSeeds();

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
