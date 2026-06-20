// SaveSystem.js — 3-slot localStorage persistence (Sprint 4)
//
// Pure data layer: it knows the save schema, reads/writes localStorage, and
// migrates old saves forward. It does NOT know about Phaser or GameScene —
// GameScene builds a plain state object (see buildCurrentState) and hands it to
// save(); load() returns a plain object GameScene applies on create.

const SAVE_VERSION = 1;
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
  // stat = number of stat levels bought; gear = highest gear tier index (-1 = none).
  return {
    red_mushroom: { stat: 0, gear: -1 },
    blue_flower: { stat: 0, gear: -1 },
    golden_wheat: { stat: 0, gear: -1 },
    green_herb: { stat: 0, gear: -1 },
    glowshroom: { stat: 0, gear: -1 },
    sunflower: { stat: 0, gear: -1 }
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
      upgrades: freshUpgrades(),
      equippedGear: { weapon: null, armor: null, boots: null, ranged: null, wateringCan: 'basic' },
      seedSlots: 3,
      gardenBeds: [
        { plantType: null, daysRemaining: 0, watered: false, ready: false },
        { plantType: null, daysRemaining: 0, watered: false, ready: false },
        { plantType: null, daysRemaining: 0, watered: false, ready: false },
        { plantType: null, daysRemaining: 0, watered: false, ready: false }
      ],
      plantsGrownEver: freshBank(),
      wellLevel: 0,
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
      return this.migrate(JSON.parse(raw));
    } catch {
      return { ...this.defaultSave(), slotIndex };
    }
  },

  migrate(data) {
    if (!data.version || data.version < 1) {
      data.newGamePlus = data.newGamePlus || false;
      data.version = 1;
    }
    // Backfill fields added after a save was first written so older slots load
    // cleanly. Idempotent — only fills what is missing.
    if (data.demoWinTriggered === undefined) data.demoWinTriggered = false;
    if (data.wellLevel === undefined) data.wellLevel = 0;
    if (data.todayWeather === undefined) data.todayWeather = null;
    if (data.dailySeedCollected === undefined) data.dailySeedCollected = null;
    if (data.dailySeedToastShown === undefined) data.dailySeedToastShown = null;
    if (!Array.isArray(data.discoveredPlants)) data.discoveredPlants = [];
    if (!data.settings) {
      data.settings = { masterVolume: 1.0, sfxVolume: 0.8, musicVolume: 0.5, footstepVolume: 0.25, muted: false };
    }
    // Footstep volume added after the first settings shipped — backfill it so
    // older slots get a sensible default rather than undefined.
    if (data.settings.footstepVolume === undefined) data.settings.footstepVolume = 0.25;
    if (!Array.isArray(data.achievements)) data.achievements = [];
    if (!data.achievementDays) data.achievementDays = {};
    if (!data.stats) {
      data.stats = { killCount: 0, deathCount: 0, timerExpiredCount: 0, darkSlimeKills: 0 };
    }
    if (!Array.isArray(data.tutorialsSeen)) data.tutorialsSeen = [];
    // Future: if (data.version < 2) { ... data.version = 2; }
    return data;
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
