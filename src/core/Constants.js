// Constants.js — Every magic number for gameplay lives here ONLY.
//
// No other file may contain numeric literals for gameplay values.
// Import from this file instead.

// World / canvas dimensions
export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 2400;
export const VIRTUAL_WIDTH = 1600;
export const VIRTUAL_HEIGHT = 900;
export const TILE_SIZE = 16;

// Zones
export const GARDEN_ZONE_HEIGHT = 800; // top N world-px is garden

// Day timer
export const DAY_TIMER_MS = 180000; // 3 minutes

// Player
export const PLAYER_SPEED = 160;

// Slimes
export const SLIME_WANDER_SPEED = 40;
export const SLIME_CHASE_SPEED = 90;
export const SLIME_DETECT_RANGE = 80;
export const SLIME_LOSE_RANGE = 200;

// --- Developer tools (dev cheat menu) ---
// Master switch for the in-game dev cheat menu. Set to false before shipping to
// disable the menu entirely. The menu also activates when the page URL contains
// ?dev=true, regardless of this flag.
export const DEV_MODE = true;

// True when the dev menu should be available. Browser-only (guards window so the
// build/SSR never touches location). Called at runtime, never at module load.
export function isDevModeActive() {
  if (DEV_MODE) return true;
  if (typeof window === 'undefined' || !window.location) return false;
  return new URLSearchParams(window.location.search).has('dev');
}
