// Constants.js — Every magic number for gameplay lives here ONLY.
//
// No other file may contain numeric literals for gameplay values.
// Import from this file instead.

// World / canvas dimensions
// Sprint 9: the hand-built Tiled world (world_v1) is a 400x400 tile map = 6400x6400px.
// WORLD_HEIGHT grew from 4800 to match it (square world). The procedural fallback
// still builds at this size; its zones just leave the extra southern band sparse.
export const WORLD_WIDTH = 6400; // doubled (was 3200) for the Sprint 10c organic world
export const WORLD_HEIGHT = 6400; // Sprint 9: was 4800 — now matches the square Tiled world
export const VIRTUAL_WIDTH = 1600;
export const VIRTUAL_HEIGHT = 900;
export const TILE_SIZE = 16;

// --- World source (Sprint 9) ---
// When true (and the map is in the tilemap cache), GameScene renders the hand-built
// Tiled world (world_v1) instead of the procedural background/river/trees. The
// procedural generator is retained as the fallback when the map fails to load.
export const USE_TILED_WORLD = true;
export const TILED_WORLD_KEY = 'world_v1';

// Zones
export const GARDEN_ZONE_HEIGHT = 800; // legacy band height — still used for enemy/tree spawn gating

// Garden homestead (centered square). The garden is an 800x800 fenced square.
// Sprint 9 re-centered it to the middle of the world (was top-center at y=200) so it
// sits on the Tiled world's authored garden and the distance-from-home enemy gradient
// (ENEMY_HOME = garden centre) radiates outward in every direction.
export const GARDEN_WIDTH  = 800;
export const GARDEN_HEIGHT = 800;
export const GARDEN_X      = (WORLD_WIDTH - GARDEN_WIDTH) / 2; // 2800 — left edge
export const GARDEN_Y      = (WORLD_HEIGHT - GARDEN_HEIGHT) / 2; // 2800 — Sprint 9: centred (was 200)
export const GARDEN_LEFT   = GARDEN_X;
export const GARDEN_RIGHT  = GARDEN_X + GARDEN_WIDTH;
export const GARDEN_TOP    = GARDEN_Y;
export const GARDEN_BOTTOM = GARDEN_Y + GARDEN_HEIGHT;

// --- Geographic zone bands (Sprint 10c — SUPERSEDED) ---
// The straight-line biome bands below were replaced by the organic, influence-
// point layout in src/systems/WorldZoneSystem.js (Sprint 10c revised). Nothing
// imports these anymore; they are retained only as reference for the legacy
// horizontal-zone design. Zone lookups + the river now come from WorldZoneSystem.
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
