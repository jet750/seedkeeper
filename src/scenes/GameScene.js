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
import DaySystem from '../systems/DaySystem.js';
import CombatSystem from '../systems/CombatSystem.js';
import ParticleSystem from '../systems/ParticleSystem.js';
import entitiesData from '../data/entities.json';

const INTERACT_RANGE = 48; // px — F-key reach for beds, well, sleep
const SEED_COLLECT_RANGE = 26; // px — player must be this close to pick up a seed
const SLEEP_FADE_MS = 500;

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

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.gameData = entitiesData;
    this.currentZone = 'garden';
    this._respawning = false;
    this._postTimerApplied = false;
    this._sleeping = false;
    this._swapCandidate = null;
    this._busHandlers = [];

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
    this.subscribe('player:damaged', (d) => this.onPlayerDamaged(d));
    this.subscribe('day:timerExpired', () => this.onTimerExpired());
    this.subscribe('day:advanced', (d) => this.onDayAdvanced(d));
    this.subscribe('plant:harvested', (d) => this.onPlantHarvested(d));
    this.subscribe('enemy:died', (d) => this.onEnemyDied(d));

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

    const spots = [
      { x: 620, y: 1120 },
      { x: 1580, y: 1320 },
      { x: 2580, y: 1160 },
      { x: 1040, y: 1900 },
      { x: 2240, y: 2040 }
    ];
    spots.forEach((p) => this.spawnSlime('green_slime', p.x, p.y));
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

    if (dayNumber >= scaling.startDay_darkSlime) {
      const wantCount = Math.min(
        MAX_DARK_SLIMES,
        Math.floor((dayNumber - scaling.startDay_darkSlime) / 2) + 1
      );
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

  onPlantHarvested({ plantType }) {
    if (this.plantBank[plantType] === undefined) this.plantBank[plantType] = 0;
    this.plantBank[plantType]++;
    EventBus.emit('bank:updated', { bank: { ...this.plantBank } });
  }

  onPlayerDied() {
    if (this._respawning) return;
    this._respawning = true;

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
    const color = ENEMY_DEATH_COLORS[type] || '#ffffff';
    this.particleSystem.showDeathBurst(position.x, position.y, color);
  }

  // --- Main loop ------------------------------------------------------------

  update(time, delta) {
    if (!GameState.is('PLAYING')) return;
    const dt = delta / 1000;

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
