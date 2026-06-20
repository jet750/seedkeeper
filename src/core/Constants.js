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

// --- Geographic zone bands (Sprint 10c) ---
// The forest is divided into distinct biomes top-to-bottom. Real tileset art
// slots into these bands in Sprint 10d; until then they render as colored
// placeholder zones. The river (a physics barrier crossable only at the bridge)
// cuts horizontally through the mid-forest band.
export const MEADOW_START = GARDEN_ZONE_HEIGHT; // 800 — open meadow entrance
export const MEADOW_END = GARDEN_ZONE_HEIGHT + 400; // 1200
export const MID_FOREST_START = 1200; // denser, tree-row barriers begin
export const RIVER_Y = 1500; // river centerline (within the mid-forest band)
export const RIVER_HEIGHT = 80; // river/bridge band thickness
export const DEEP_FOREST_START = 1600; // dark, high-danger zone
export const BRIDGE_X = WORLD_WIDTH / 2; // the single river crossing point
export const BRIDGE_WIDTH = 120; // gap in the river wall the bridge spans

// Day timer
export const DAY_TIMER_MS = 180000; // 3 minutes

// Player
export const PLAYER_SPEED = 160;

// Slimes
export const SLIME_WANDER_SPEED = 40;
export const SLIME_CHASE_SPEED = 90;
export const SLIME_DETECT_RANGE = 80;
export const SLIME_LOSE_RANGE = 200;

// --- Shared UI styling (Sprint 12 visual-consistency pass) ---
// Every text object in the game already renders with this family; referencing the
// constant keeps new scenes from drifting back to a default Phaser sans-serif.
export const FONT_FAMILY = '"SproutLands", "Courier New", monospace';

// Normalized panel/backdrop colours so every overlay reads as one UI system.
// Values match the de-facto palette the shipped scenes (Upgrade / Signpost /
// SeedDict) already use, so new overlays sit flush with the old ones.
export const UI_PANEL_COLOR = 0x221e1b; // elevated panel fill
export const UI_PANEL_ALPHA = 0.97; // near-opaque so panels read over the world
export const UI_BORDER_COLOR = 0x4d4843; // panel/divider border
export const UI_BACKDROP_COLOR = 0x000000; // full-screen dim behind a modal
export const UI_BACKDROP_ALPHA = 0.85; // dim strength behind a modal
export const UI_ACCENT_GOLD = 0xeac34f; // hover/active highlight (matches HUD gold)

// In-game text-size hierarchy (px). New UI uses these; HUD/world text predates it.
export const TEXT_HEADER = '22px';
export const TEXT_BODY = '16px';
export const TEXT_SMALL = '13px';
export const TEXT_MICRO = '12px';

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
