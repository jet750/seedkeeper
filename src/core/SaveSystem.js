// SaveSystem.js — 3-slot localStorage persistence (Sprint 4)
//
// Pure data layer: it knows the save schema, reads/writes localStorage, and
// migrates old saves forward. It does NOT know about Phaser or GameScene —
// GameScene builds a plain state object (see buildCurrentState) and hands it to
// save(); load() returns a plain object GameScene applies on create.

// v2 (Economy Sprint 2): dual economy. Plants → stat trees only; coins → gear +
// capacity. Saves are disposable in this pre-launch showcase, so a version bump
// WIPES old slots to a fresh v2 default instead of migrating (no shim).
const SAVE_VERSION = 2;
const SAVE_KEY_PREFIX = 'seedkeeper_save_';
const SETTINGS_KEY = 'seedkeeper_settings'; // global audio settings (Sprint 12)

function freshBank() {
  return {
    red_mushroom: 0,
    blue_flower: 0,
    golden_wheat: 0,
    green_herb: 0,
    glowshroom: 0,
    sunflower: 0
  };
}

function freshUpgrades() {
  // stat = number of stat levels bought per plant. Gear is no longer plant-funded
  // (v2): it lives on the coin economy via equippedGear (see economy.json).
  return {
    red_mushroom: { stat: 0 },
    blue_flower: { stat: 0 },
    golden_wheat: { stat: 0 },
    green_herb: { stat: 0 },
    glowshroom: { stat: 0 },
    sunflower: { stat: 0 }
  };
}

const SaveSystem = {
  VERSION: SAVE_VERSION,

  defaultSave() {
    return {
      version: SAVE_VERSION,
      slotIndex: 0,
      dayNumber: 1,
      totalPlaytime: 0,
      bank: freshBank(),
      // Banked coins (v2). All mutations route through GameScene.addCoins/spendCoins.
      coins: 0,
      upgrades: freshUpgrades(),
      // Coin-funded gear. Start with NO weapon (base unarmed attack). wateringCan
      // is the default basic can (cans are no longer purchasable in v2).
      equippedGear: { weapon: null, armor: null, boots: null, ranged: null, wateringCan: 'basic' },
      // Coin-funded capacity trees (v2) — independent of each other and of stats.
      seedBagTier: 0, // carry-slot tier index (0 = base 3)
      gardenBedTier: 0, // bed-count tier index (0 = base 4)
      wateringTier: 0, // water-charge tier index (0 = base 1); replaces wellLevel
      gardenBeds: [
        { plantType: null, daysRemaining: 0, watered: false, ready: false },
        { plantType: null, daysRemaining: 0, watered: false, ready: false },
        { plantType: null, daysRemaining: 0, watered: false, ready: false },
        { plantType: null, daysRemaining: 0, watered: false, ready: false }
      ],
      plantsGrownEver: freshBank(),
      todayWeather: null,
      dailySeedCollected: null,
      dailySeedToastShown: null,
      discoveredPlants: [],
      newGamePlus: false,
      demoWinTriggered: false,
      settings: { masterVolume: 1.0, sfxVolume: 0.8, musicVolume: 0.5, footstepVolume: 0.25, muted: false },
      achievements: [],
      achievementDays: {},
      stats: { killCount: 0, deathCount: 0, timerExpiredCount: 0, darkSlimeKills: 0 },
      tutorialsSeen: [], // Sprint 12 — ids of first-run hints already shown in this slot
      savedAt: 0
    };
  },

  // GameScene passes a fully-built state object; we stamp metadata and persist.
  save(slotIndex, gameState) {
    try {
      const data = { ...gameState, version: SAVE_VERSION, slotIndex, savedAt: Date.now() };
      localStorage.setItem(SAVE_KEY_PREFIX + slotIndex, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn('[save] failed to write slot', slotIndex, err);
      return false;
    }
  },

  load(slotIndex) {
    try {
      const raw = localStorage.getItem(SAVE_KEY_PREFIX + slotIndex);
      if (!raw) return { ...this.defaultSave(), slotIndex };
      const data = JSON.parse(raw);
      // v2 rip-and-rebuild: saves are disposable, so any version mismatch is
      // discarded and replaced with a fresh v2 default. No migration shim.
      // `_wasReset` lets GameScene show a one-time "save reset" notice.
      if (data.version !== SAVE_VERSION) {
        return { ...this.defaultSave(), slotIndex, _wasReset: true };
      }
      return data;
    } catch {
      return { ...this.defaultSave(), slotIndex };
    }
  },

  getSlotsMetadata() {
    return [0, 1, 2].map((i) => {
      try {
        const raw = localStorage.getItem(SAVE_KEY_PREFIX + i);
        if (!raw) return { isEmpty: true, slotIndex: i };
        const d = JSON.parse(raw);
        return {
          isEmpty: false,
          slotIndex: i,
          dayNumber: d.dayNumber,
          totalPlaytime: d.totalPlaytime,
          plantsGrownEver: d.plantsGrownEver
        };
      } catch {
        return { isEmpty: true, slotIndex: i };
      }
    });
  },

  clear(slotIndex) {
    localStorage.removeItem(SAVE_KEY_PREFIX + slotIndex);
  },

  // --- Global audio settings (Sprint 12) ------------------------------------
  // Per-slot saves keep their own `settings`, but the title-screen settings menu
  // runs with no slot loaded, so volumes also live in a global key. The most
  // recent change (menu or in-game) is mirrored here and used as the default for
  // a freshly started run that has no settings yet.
  defaultSettings() {
    return { masterVolume: 1.0, sfxVolume: 0.8, musicVolume: 0.5, footstepVolume: 0.25, muted: false };
  },

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return this.defaultSettings();
      return { ...this.defaultSettings(), ...JSON.parse(raw) };
    } catch {
      return this.defaultSettings();
    }
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn('[save] failed to write global settings', err);
    }
  }
};

export default SaveSystem;
