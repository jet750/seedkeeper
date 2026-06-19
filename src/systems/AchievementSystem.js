// AchievementSystem.js
//
// Drives the achievement catalogue (Sprint 6) entirely from EventBus events —
// never polls the update loop. Owned by GameScene. On unlock it emits
// 'achievement:unlocked' (UIScene shows a toast) and 'save:requested'
// (GameScene persists). Unlock state, per-achievement unlock day, and running
// stat counters are all serialised back into the save slot.
//
// Adapted to this codebase's real shapes: live garden beds live on
// `scene.beds`, the plant bank on `scene.plantBank`, grown counts on
// `scene.plantsGrownEver`, upgrade levels on `scene.upgradeLevels`, and the
// 'upgrade:purchased' event carries { plantType, track, newLevel } (no tierId),
// so gear-tier ids are resolved from gameData here.

import EventBus from '../core/EventBus.js';
import { ACHIEVEMENTS } from '../data/achievements.js';

const SLAYER_THRESHOLD = 25;
const DARKWALKER_THRESHOLD = 10;
const COMMITTED_THRESHOLD = 10;
const NIGHT_OWL_THRESHOLD = 5;
const NATURALIST_DAYS = 5;
const PUSHING_IT_DELAY_MS = 60000;
const SPEED_RUNNER_WINDOW_MS = 15000;
const FULL_BLOOM_MIN_BEDS = 8;
const HARVEST_BEGINS_PER_PLANT = 10; // matches the demo-win threshold (10 of each)
const MASTER_STAT_LEVEL = 5;

export default class AchievementSystem {
  constructor(scene, saveData) {
    this.scene = scene;
    this.saveData = saveData;
    this.unlockedIds = new Set(saveData.achievements || []);
    this.achievementDays = { ...(saveData.achievementDays || {}) };

    const stats = saveData.stats || {};
    this.killCount = stats.killCount || 0;
    this.deathCount = stats.deathCount || 0;
    this.timerExpiredCount = stats.timerExpiredCount || 0;
    this.darkSlimeKills = stats.darkSlimeKills || 0;

    // Per-run / per-day transient trackers.
    this.daysForestNoKill = 0;
    this.currentRunDamageTaken = false;
    this.currentDayKilled = false;
    this.enteredForest = false;

    this._handlers = [];
    this.registerListeners();

    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);
  }

  on(event, handler) {
    EventBus.on(event, handler);
    this._handlers.push([event, handler]);
  }

  unlock(id) {
    if (this.unlockedIds.has(id)) return;
    this.unlockedIds.add(id);
    const day = this.scene.daySystem ? this.scene.daySystem.dayNumber : 1;
    this.achievementDays[id] = day;
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    if (!achievement) return;
    EventBus.emit('achievement:unlocked', { achievement, day });
    EventBus.emit('save:requested', {});
  }

  registerListeners() {
    // --- Tier 1 ---
    this.on('plant:harvested', ({ plantType }) => {
      this.unlock('first_harvest');
      this.handleHarvest(plantType);
    });
    this.on('player:slept', ({ dayNumber }) => {
      if (dayNumber >= 2) this.unlock('one_day_done');
      if (dayNumber >= 10) this.unlock('deep_root');
    });
    this.on('bed:watered', () => this.unlock('water_carrier'));
    this.on('enemy:died', ({ type }) => this.handleEnemyDied(type));
    this.on('upgrade:purchased', (data) => this.handleUpgrade(data));

    // --- Tier 2 ---
    this.on('player:dashed', () => this.unlock('blur'));
    this.on('ranged:fired', () => this.unlock('ranged'));
    this.on('inventory:changed', ({ slots }) => {
      if (slots && slots.length && slots.every((s) => s !== null)) {
        this.unlock('fully_stocked');
      }
    });
    this.on('day:timerExpired', () => {
      this.timerExpiredCount++;
      if (this.timerExpiredCount >= NIGHT_OWL_THRESHOLD) this.unlock('night_owl');
      // Stay in the forest a full minute past the deadline.
      this.scene.time.delayedCall(PUSHING_IT_DELAY_MS, () => {
        if (this.scene.currentZone === 'forest') this.unlock('pushing_it');
      });
    });

    // --- Tier 3 ---
    this.on('player:died', () => this.handlePlayerDied());
    this.on('seed:recovered', () => this.unlock('second_chance'));
    this.on('newGamePlus:activated', () => this.unlock('new_game_plus'));
    // 'the_seedkeeper' = the full win (every track maxed).
    this.on('win:full', () => this.unlock('the_seedkeeper'));

    // --- Zone-based (into_the_woods / untouchable / speed_runner) ---
    this.on('player:zoneChanged', ({ zone }) => this.handleZoneChanged(zone));
    this.on('player:damaged', ({ currentHP }) => {
      if (currentHP !== undefined) this.currentRunDamageTaken = true;
    });

    // --- Hidden bookkeeping ---
    this.on('upgrade:opened', () => this.checkBroke());
    this.on('day:advanced', () => this.checkNaturalist());
    this.on('bed:planted', () => this.checkFullBloom());
  }

  // --- Handlers --------------------------------------------------------------

  handleZoneChanged(zone) {
    if (zone === 'forest') {
      this.enteredForest = true;
      return;
    }
    // Returned to the garden.
    if (this.enteredForest) {
      this.unlock('into_the_woods'); // safety: also covers the first trip
      if (!this.currentRunDamageTaken) this.unlock('untouchable');
      // Speed Runner: back home with almost the whole timer intact.
      const ds = this.scene.daySystem;
      if (ds && ds.timerRemaining >= ds.maxTimer() - SPEED_RUNNER_WINDOW_MS) {
        this.unlock('speed_runner');
      }
    }
    this.currentRunDamageTaken = false;
    this.enteredForest = false;
  }

  handleEnemyDied(type) {
    this.killCount++;
    this.currentDayKilled = true;
    this.daysForestNoKill = 0;

    if (this.killCount === 1) this.unlock('first_blood');
    if (this.killCount >= SLAYER_THRESHOLD) this.unlock('slayer');
    if (type === 'skeleton') this.unlock('bonecrusher');
    if (type === 'dark_slime') {
      this.darkSlimeKills++;
      if (this.darkSlimeKills >= DARKWALKER_THRESHOLD) this.unlock('darkwalker');
    }
  }

  handlePlayerDied() {
    this.deathCount++;
    if (this.deathCount >= COMMITTED_THRESHOLD) this.unlock('committed');
  }

  handleHarvest(plantType) {
    if (plantType === 'glowshroom') this.unlock('mycologist');
    if (plantType === 'blue_flower') this.unlock('blue_thumb');
    const grown = this.scene.plantsGrownEver || {};
    const all = Object.keys(this.scene.gameData.plants).every(
      (pt) => (grown[pt] || 0) >= HARVEST_BEGINS_PER_PLANT
    );
    if (all) this.unlock('harvest_begins');
  }

  handleUpgrade(data) {
    if (data.track === 'gear') {
      const tiers = this.scene.gameData.upgrades[data.plantType].gear.tiers;
      const tier = tiers[data.newLevel];
      const tierId = tier ? tier.id : '';
      if (['dagger', 'sword'].includes(tierId)) this.unlock('armed');
      if (['tunic', 'leather', 'chainmail'].includes(tierId)) this.unlock('layered');
      if (tierId.startsWith('satchel')) this.unlock('satchel_bearer');
    }

    // Master Botanist — every stat track at max level.
    const levels = this.scene.upgradeLevels;
    const allStatMaxed = Object.values(levels).every((u) => u.stat >= MASTER_STAT_LEVEL);
    if (allStatMaxed) this.unlock('master_botanist');

    // Full Kit — every gear track at its top tier.
    if (this.allGearMaxed()) this.unlock('full_kit');

    this.checkBroke();
  }

  allGearMaxed() {
    const upgrades = this.scene.gameData.upgrades;
    const levels = this.scene.upgradeLevels;
    return Object.keys(upgrades).every(
      (pt) => levels[pt].gear >= upgrades[pt].gear.tiers.length - 1
    );
  }

  checkBroke() {
    const bank = this.scene.plantBank || {};
    if (Object.values(bank).every((v) => v === 0)) this.unlock('broke');
  }

  checkNaturalist() {
    if (!this.currentDayKilled) {
      this.daysForestNoKill++;
      if (this.daysForestNoKill >= NATURALIST_DAYS) this.unlock('naturalist');
    }
    this.currentDayKilled = false;
  }

  checkFullBloom() {
    const beds = this.scene.beds || [];
    const allPlanted = beds.length >= FULL_BLOOM_MIN_BEDS && beds.every((b) => b.state !== 'EMPTY');
    if (allPlanted) this.unlock('full_bloom');
  }

  // --- Persistence -----------------------------------------------------------

  serialize() {
    return {
      achievements: Array.from(this.unlockedIds),
      achievementDays: { ...this.achievementDays },
      stats: {
        killCount: this.killCount,
        deathCount: this.deathCount,
        timerExpiredCount: this.timerExpiredCount,
        darkSlimeKills: this.darkSlimeKills
      }
    };
  }

  cleanup() {
    this._handlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._handlers = [];
  }
}
