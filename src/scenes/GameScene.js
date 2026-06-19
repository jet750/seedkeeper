// GameScene.js
//
// The playable world: a two-zone map (safe garden on top, dangerous forest
// below), a player, wandering slimes, the day-timer system, and zone-reactive
// music. All HUD state is pushed out over EventBus to the parallel UIScene.

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
import entitiesData from '../data/entities.json';

// --- Inline Day Timer (promoted to its own system in a later sprint) ---------
class DaySystem {
  constructor(scene, config) {
    this.scene = scene;
    this.timerDuration = config.timerDuration;
    this.warningTime = config.warningTime;
    this.urgentTime = config.urgentTime;
    this.speedMult = config.postTimerSpeedMult;
    this.damageMult = config.postTimerDamageMult;
    this.reset();
  }

  reset() {
    this.remaining = this.timerDuration;
    this.warned = false;
    this.urgent = false;
    this.expired = false;
    this._lastTickSecond = Math.ceil(this.remaining / 1000);
  }

  // Exposed for the Sprint 2 sleep mechanic.
  resetDayTimer() {
    this.reset();
    EventBus.emit('day:timerReset', { remaining: this.remaining });
    EventBus.emit('day:timerTick', { remaining: this.remaining });
  }

  update(delta) {
    // Counts down only while the player is in the forest; pauses in the garden.
    if (this.scene.currentZone !== 'forest') return;
    if (this.expired) return;

    this.remaining = Math.max(0, this.remaining - delta);

    const sec = Math.ceil(this.remaining / 1000);
    if (sec !== this._lastTickSecond) {
      this._lastTickSecond = sec;
      EventBus.emit('day:timerTick', { remaining: this.remaining });
    }

    if (!this.warned && this.remaining <= this.warningTime) {
      this.warned = true;
      EventBus.emit('day:timerWarning', { remaining: this.remaining });
    }
    if (!this.urgent && this.remaining <= this.urgentTime) {
      this.urgent = true;
      EventBus.emit('day:timerUrgent', { remaining: this.remaining });
    }
    if (!this.expired && this.remaining <= 0) {
      this.expired = true;
      EventBus.emit('day:timerExpired', {});
      EventBus.emit('day:postTimerActive', {});
    }
  }
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.gameData = entitiesData;
    this.currentZone = 'garden';
    this.dayNumber = 1;
    this._gameOverScheduled = false;
    this._busHandlers = [];

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

    // --- Collisions ---
    this.physics.add.collider(this.slimeGroup, this.slimeGroup);
    this.physics.add.overlap(
      this.player,
      this.slimeGroup,
      (player, slime) => slime.touchPlayer(),
      null,
      this
    );

    // --- Day timer ---
    this.daySystem = new DaySystem(this, this.gameData.daySystem);

    // --- Audio ---
    this.setupMusic();

    // --- EventBus wiring (parallel UIScene + scene reactions) ---
    this.subscribe('player:zoneChanged', (d) => this.onZoneChanged(d));
    this.subscribe('player:died', () => this.onPlayerDied());
    this.subscribe('day:timerExpired', () => this.onTimerExpired());
    this.subscribe('day:timerReset', () => this.onTimerReset());

    // --- Launch the HUD as a parallel scene ---
    this.scene.launch('UIScene', { dayNumber: this.dayNumber });

    // Broadcast the initial day number for the HUD once it is up.
    this.time.delayedCall(0, () =>
      EventBus.emit('day:dayChanged', { day: this.dayNumber })
    );

    this.events.once('shutdown', this.shutdown, this);
    this.events.once('destroy', this.shutdown, this);
  }

  // --- World construction ---------------------------------------------------

  buildWorld() {
    const forestY = GARDEN_ZONE_HEIGHT;
    const forestHeight = WORLD_HEIGHT - GARDEN_ZONE_HEIGHT;

    // Garden zone (top) — tile if art exists, else solid fill.
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

    // Forest zone (remainder)
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

    // Fence / boundary at the zone border
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

    // Faint zone labels
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

    // 5 green slimes spread across the forest zone.
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
  }

  onTimerExpired() {
    const { postTimerSpeedMult, postTimerDamageMult } = this.gameData.daySystem;
    this.slimes.forEach((s) => s.applyPostTimer(postTimerSpeedMult, postTimerDamageMult));
  }

  onTimerReset() {
    this.slimes.forEach((s) => s.resetPostTimer());
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
  }

  shutdown() {
    this._busHandlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._busHandlers = [];
    if (this.bgm) {
      Object.values(this.bgm).forEach((snd) => snd.stop());
    }
  }
}
