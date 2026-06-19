// SaveSystem.js — 3-slot localStorage persistence (Sprint 4)
//
// Pure data layer: it knows the save schema, reads/writes localStorage, and
// migrates old saves forward. It does NOT know about Phaser or GameScene —
// GameScene builds a plain state object (see buildCurrentState) and hands it to
// save(); load() returns a plain object GameScene applies on create.

const SAVE_VERSION = 1;
const SAVE_KEY_PREFIX = 'seedkeeper_save_';

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
      newGamePlus: false,
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
  }
};

export default SaveSystem;
