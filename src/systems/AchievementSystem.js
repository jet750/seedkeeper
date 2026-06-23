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
const SLIME_CULL_THRESHOLD = 5;
const SKELETON_THRESHOLD = 5;
const COINS_EARNED_THRESHOLD = 100; // cumulative coins EARNED, not current balance

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
    this.slimeKills = stats.slimeKills || 0;
    this.skeletonKills = stats.skeletonKills || 0;
    this.coinsEarned = stats.coinsEarned || 0;

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
    this.on('gear:equipped', (data) => this.handleGearEquipped(data));
    this.on('capacity:purchased', (data) => this.handleCapacityPurchased(data));
    this.on('coins:changed', (data) => this.handleCoinsChanged(data));
    // 'plant:sold' ships with the Sprint 3 marketplace; the listener is inert
    // until that emitter lands on dev, then 'first_sale' fires on the first sale.
    this.on('plant:sold', () => this.unlock('first_sale'));

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

    // Per-type kill tracks (dual-economy combat progression). A slime is a
    // slime — green and dark both count toward 'slime_culler'; dark slimes
    // additionally drive the dark-specific milestones, skeletons their own.
    if (type === 'green_slime' || type === 'dark_slime') {
      this.slimeKills++;
      if (this.slimeKills >= SLIME_CULL_THRESHOLD) this.unlock('slime_culler');
    }
    if (type === 'skeleton') {
      this.unlock('bonecrusher');
      this.skeletonKills++;
      if (this.skeletonKills >= SKELETON_THRESHOLD) this.unlock('skeleton_crew');
    }
    if (type === 'dark_slime') {
      this.unlock('dark_first');
      this.darkSlimeKills++;
      if (this.darkSlimeKills >= DARKWALKER_THRESHOLD) this.unlock('darkwalker');
    }
  }

  handlePlayerDied() {
    this.deathCount++;
    if (this.deathCount >= COMMITTED_THRESHOLD) this.unlock('committed');
  }

  handleHarvest(plantType) {
    // v3 (Sprint 6/3d): retired keys repointed to valid catalog plants so these
    // stay earnable. NOTE: 'mycologist' (🍄 mushroom flavor) now triggers on a
    // deep-forest magic crop — its name/icon/flavor should be revisited (flagged).
    if (plantType === 'pineapple') this.unlock('mycologist');
    if (plantType === 'blue_flower_2') this.unlock('blue_thumb');
    const grown = this.scene.plantsGrownEver || {};
    const all = Object.keys(this.scene.gameData.plants).every(
      (pt) => (grown[pt] || 0) >= HARVEST_BEGINS_PER_PLANT
    );
    if (all) this.unlock('harvest_begins');
  }

  handleUpgrade() {
    // v2: the workshop chest is stat-only — gear/capacity achievements moved to
    // the coin path (handleGearEquipped / handleCapacityPurchased). Master
    // Botanist still tracks every stat track reaching max level.
    const levels = this.scene.upgradeLevels;
    const allStatMaxed = Object.values(levels).every((u) => u.stat >= MASTER_STAT_LEVEL);
    if (allStatMaxed) this.unlock('master_botanist');
    this.checkBroke();
  }

  // Coin-funded gear (v2). 'the_stick' = the cold-start first weapon; 'armed'/
  // 'layered' on the relevant tiers; 'slot_maxed' once any one slot hits its top
  // tier; 'full_kit' once every slot holds its top tier.
  handleGearEquipped({ slot, tierId }) {
    if (tierId === 'stick') this.unlock('the_stick');
    if (['dagger', 'sword'].includes(tierId)) this.unlock('armed');
    if (['tunic', 'leather', 'chainmail'].includes(tierId)) this.unlock('layered');
    if (this.isSlotMaxed(slot)) this.unlock('slot_maxed');
    if (this.allGearMaxed()) this.unlock('full_kit');
  }

  // Coin-funded capacity (v2). 'satchel_bearer' = bought a seed-bag (carry) tier;
  // 'capacity_maxed' once any one tree reaches its final tier.
  handleCapacityPurchased({ tree, tier }) {
    if (tree === 'seedBag') this.unlock('satchel_bearer');
    const def = this.scene.economyData && this.scene.economyData.capacity[tree];
    if (def && def.tiers && tier >= def.tiers.length) this.unlock('capacity_maxed');
  }

  // Cumulative coins EARNED (positive deltas only). Spends emit a negative delta
  // and syncHud emits delta:0 — both ignored so balance churn doesn't inflate
  // the total. Cheat coin grants flow through addCoins, so they count too.
  handleCoinsChanged({ delta }) {
    if (!delta || delta <= 0) return;
    this.coinsEarned += delta;
    this.unlock('first_coin');
    if (this.coinsEarned >= COINS_EARNED_THRESHOLD) this.unlock('coin_purse');
  }

  // True once the equipped tier in `slot` is the top catalog tier for it.
  isSlotMaxed(slot) {
    const gear = this.scene.economyData && this.scene.economyData.gear;
    const equipped = this.scene.player && this.scene.player.equippedGear;
    if (!gear || !equipped) return false;
    const list = gear[slot] || [];
    if (!list.length) return false;
    return equipped[slot] === list[list.length - 1].id;
  }

  // Every coin-gear slot at its top catalog tier.
  allGearMaxed() {
    const gear = this.scene.economyData && this.scene.economyData.gear;
    const equipped = this.scene.player && this.scene.player.equippedGear;
    if (!gear || !equipped) return false;
    return ['weapon', 'armor', 'boots', 'ranged'].every((slot) => {
      const list = gear[slot] || [];
      if (!list.length) return true;
      return equipped[slot] === list[list.length - 1].id;
    });
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
        darkSlimeKills: this.darkSlimeKills,
        slimeKills: this.slimeKills,
        skeletonKills: this.skeletonKills,
        coinsEarned: this.coinsEarned
      }
    };
  }

  cleanup() {
    this._handlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._handlers = [];
  }
}
