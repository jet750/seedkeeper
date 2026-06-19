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
import Seed from '../entities/Seed.js';
import GardenBed from '../entities/GardenBed.js';
import DaySystem from '../systems/DaySystem.js';
import entitiesData from '../data/entities.json';

const INTERACT_RANGE = 48; // px — F-key reach for beds, well, sleep
const SEED_COLLECT_RANGE = 26; // px — player must be this close to pick up a seed
const SLEEP_FADE_MS = 500;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.gameData = entitiesData;
    this.currentZone = 'garden';
    this._gameOverScheduled = false;
    this._postTimerApplied = false;
    this._sleeping = false;
    this._swapCandidate = null;
    this._busHandlers = [];

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

    // --- Sprint 2 world objects ---
    this.seeds = [];
    this.spawnSeeds();
    this.spawnGardenBeds();
    this.spawnGardenStructures();

    // --- Plant bank ---
    this.plantBank = {
      red_mushroom: 0,
      blue_flower: 0,
      golden_wheat: 0,
      green_herb: 0,
      glowshroom: 0,
      sunflower: 0
    };

    // --- Day timer (extracted system) ---
    this.daySystem = new DaySystem(this, this.gameData);

    // --- Audio ---
    this.setupMusic();

    // --- Interaction input ---
    this.fKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.swapPrompt = this.add
      .text(0, 0, '[F] Swap', {
        fontFamily: '"Courier New", monospace',
        fontSize: '15px',
        color: '#EDD49A',
        backgroundColor: 'rgba(20,18,16,0.8)',
        padding: { x: 5, y: 3 }
      })
      .setOrigin(0.5, 1)
      .setDepth(25)
      .setVisible(false);

    // --- EventBus wiring ---
    this.subscribe('player:zoneChanged', (d) => this.onZoneChanged(d));
    this.subscribe('player:died', () => this.onPlayerDied());
    this.subscribe('day:timerExpired', () => this.onTimerExpired());
    this.subscribe('day:advanced', () => this.onDayAdvanced());
    this.subscribe('plant:harvested', (d) => this.onPlantHarvested(d));

    // --- HUD scene ---
    this.scene.launch('UIScene', { dayNumber: this.daySystem.dayNumber });
    this.time.delayedCall(0, () =>
      EventBus.emit('day:dayChanged', { day: this.daySystem.dayNumber })
    );

    this.events.once('shutdown', this.shutdown, this);
    this.events.once('destroy', this.shutdown, this);
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
  }

  // --- World construction ---------------------------------------------------

  buildWorld() {
    const forestY = GARDEN_ZONE_HEIGHT;
    const forestHeight = WORLD_HEIGHT - GARDEN_ZONE_HEIGHT;

    if (this.textures.exists('tileset_garden')) {
      this.add
        .tileSprite(0, 0, WORLD_WIDTH, GARDEN_ZONE_HEIGHT, 'tileset_garden')
        .setOrigin(0, 0)
        .setDepth(0);
    } else {
      // TODO(asset): tileset_garden.png — solid fill placeholder in use.
      this.add
        .rectangle(0, 0, WORLD_WIDTH, GARDEN_ZONE_HEIGHT, 0x3e5e34)
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
      this.add
        .rectangle(0, forestY, WORLD_WIDTH, forestHeight, 0x16291a)
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
      this.add
        .rectangle(0, forestY, WORLD_WIDTH, 8, 0x8a6a3a)
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
    this.slimes = [];

    const spots = [
      { x: 620, y: 1120 },
      { x: 1580, y: 1320 },
      { x: 2580, y: 1160 },
      { x: 1040, y: 1900 },
      { x: 2240, y: 2040 }
    ];
    spots.forEach((p) => {
      const slime = new Slime(this, p.x, p.y, 'green_slime', this.gameData);
      this.slimeGroup.add(slime);
      this.slimes.push(slime);
    });
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
      if (d > SEED_COLLECT_RANGE) continue;

      if (this.player.hasEmptySlot()) {
        if (this.player.addSeed(seed.plantType)) {
          seed.collect();
          EventBus.emit('seed:collected', {
            plantType: seed.plantType,
            position: { x: seed.x, y: seed.y }
          });
        }
      } else if (d < candidateDist) {
        candidateDist = d;
        candidate = seed;
      }
    }

    // Edge-trigger the inventory:full notification when a full-slot pickup is
    // first attempted.
    if (candidate && !this._swapCandidate) {
      EventBus.emit('inventory:full', {});
    }
    this._swapCandidate = candidate;

    if (candidate) {
      this.swapPrompt.setPosition(this.player.x, this.player.y - 40).setVisible(true);
    } else {
      this.swapPrompt.setVisible(false);
    }
  }

  performSwap(seed) {
    const oldest = this.player.getOldestSeed();
    if (oldest === -1) return;
    this.player.dropSeed(oldest); // spawns world seed at feet, frees a slot
    this.player.addSeed(seed.plantType); // fills the freed slot
    seed.collect();
    EventBus.emit('seed:collected', {
      plantType: seed.plantType,
      position: { x: seed.x, y: seed.y }
    });
    this._swapCandidate = null;
    this.swapPrompt.setVisible(false);
  }

  // --- Garden beds & structures ---------------------------------------------

  spawnGardenBeds() {
    this.beds = [];
    const bedY = 260;
    const startX = 1340;
    const gap = 160;
    for (let i = 0; i < 4; i++) {
      this.beds.push(
        new GardenBed(this, startX + i * gap, bedY, i, this.gameData)
      );
    }
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
    // Priority: sleep > well > garden bed > seed swap. Objects are spatially
    // separated so only one is ever in range, but ordering keeps it deterministic.
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

    if (this._swapCandidate) {
      this.performSwap(this._swapCandidate);
    }
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
      bed.water();
      this.player.hasWater = false;
      EventBus.emit('player:usedWater', {});
      return true;
    }
    return false;
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
    this.swapPrompt.setVisible(false);

    this.cameras.main.fadeOut(SLEEP_FADE_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.daySystem.advanceDay(); // dayNumber++, refill timer, emit day:advanced
      this.player.healToFull(); // emits player:healed → UIScene updates
      EventBus.emit('player:slept', { dayNumber: this.daySystem.dayNumber });
      console.log('AUTO-SAVE placeholder — Day', this.daySystem.dayNumber);

      GameState.transition('PLAYING');
      this.physics.resume();
      // Timer stays paused until the player re-enters the forest.
      this.daySystem.setTimerActive(false);

      this.cameras.main.fadeIn(SLEEP_FADE_MS, 0, 0, 0);
      this._sleeping = false;
    });
  }

  // --- Audio ----------------------------------------------------------------

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
      this.tweens.add({ targets: this.bgm.bgm_garden, volume: 0.5, duration: 800 });
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
    this.tweens.add({ targets: target, volume: 0.5, duration: 800 });
    this.currentBgmKey = key;
  }

  // --- EventBus reactions ---------------------------------------------------

  subscribe(event, handler) {
    EventBus.on(event, handler);
    this._busHandlers.push([event, handler]);
  }

  onZoneChanged({ zone }) {
    this.currentZone = zone;
    if (this.cache.audio.exists('sfx_gate')) {
      this.sound.play('sfx_gate', { volume: 0.6 });
    }
    this.crossfadeTo(zone === 'forest' ? 'bgm_forest' : 'bgm_garden');
    // Timer counts only in the forest, and never restarts once already expired.
    this.daySystem.setTimerActive(zone === 'forest' && this.daySystem.timerRemaining > 0);
  }

  onTimerExpired() {
    if (this._postTimerApplied) return;
    this._postTimerApplied = true;
    const { postTimerSpeedMult, postTimerDamageMult } = this.gameData.daySystem;
    this.slimes.forEach((s) => s.applyPostTimer(postTimerSpeedMult, postTimerDamageMult));
  }

  onDayAdvanced() {
    // A fresh day clears the post-timer slime buffs.
    if (this._postTimerApplied) {
      this.slimes.forEach((s) => s.resetPostTimer());
      this._postTimerApplied = false;
    }
  }

  onPlantHarvested({ plantType }) {
    if (this.plantBank[plantType] === undefined) this.plantBank[plantType] = 0;
    this.plantBank[plantType]++;
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
  }

  onPlayerDied() {
    if (this._gameOverScheduled) return;
    this._gameOverScheduled = true;
    this.time.delayedCall(1500, () => {
      GameState.transition('GAME_OVER');
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
  }

  // --- Main loop ------------------------------------------------------------

  update(time, delta) {
    if (!GameState.is('PLAYING')) return;
    const dt = delta / 1000;

    this.player.update(dt);
    this.slimes.forEach((s) => s.update(dt, this.player));
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
