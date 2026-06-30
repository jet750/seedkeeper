// GraphicsQuality.js — the player-facing Graphics / Performance setting (Sprint mobile-polish-
// menus, Phase 6). Exposes the VFX budget (the combat-particle scalar + concurrent cap) as a
// Low / Medium / High choice surfaced in the pause menu.
//
// LIVE: ParticleSystem reads vfx() on every spawn, so changing the level takes effect on the
// next particle with no reload. PERSISTED via the lightweight global settings store
// (SaveSystem.loadSettings/saveSettings → localStorage 'seedkeeper_settings') — NOT the
// versioned per-slot save, so a graphics tweak never risks a save wipe.

import EventBus from './EventBus.js';
import SaveSystem from './SaveSystem.js';

export const GRAPHICS_LEVELS = ['low', 'medium', 'high'];

// Level → effective VFX budget. MEDIUM reproduces the prior hard-coded MOBILE_VFX_SCALAR (0.5)
// and VFX_PARTICLE_CAP (256) EXACTLY, so the default ('medium') changes nothing vs. before this
// sprint. LOW trims both for weaker GPUs; HIGH restores full mobile particle density. // TUNE
const QUALITY = {
  low: { vfxScalar: 0.3, particleCap: 96 },
  medium: { vfxScalar: 0.5, particleCap: 256 },
  high: { vfxScalar: 1.0, particleCap: 256 }
};

// Seeded from the persisted setting at module load; defaults to 'medium' if unset/corrupt.
let _level = (() => {
  try {
    const g = SaveSystem.loadSettings().graphics;
    return QUALITY[g] ? g : 'medium';
  } catch {
    return 'medium';
  }
})();

export function getLevel() {
  return _level;
}

// Set + persist the level and broadcast the change. Invalid levels are ignored.
export function setLevel(level) {
  if (!QUALITY[level] || level === _level) return;
  _level = level;
  try {
    const s = SaveSystem.loadSettings();
    s.graphics = level;
    SaveSystem.saveSettings(s);
  } catch {
    /* persistence is best-effort — the live value still applies this session */
  }
  EventBus.emit('graphics:changed', { level, ...QUALITY[level] });
}

// The live VFX budget for the current level — read by ParticleSystem each spawn.
export function vfx() {
  return QUALITY[_level];
}

// Title-case label for the UI (e.g. 'medium' → 'Medium').
export function levelLabel(level = _level) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}
