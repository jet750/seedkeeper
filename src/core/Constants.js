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

// --- Sprint 11: camera zoom + garden scale reconciliation -----------------
// Pure visual/feel knobs (no gameplay impact). The player/enemy sprite scale was
// halved (2 -> 1) in Sprint 10 to fit the massive 6400x6400 Tiled world; these
// constants bring the camera and the garden props/layout back into proportion
// with the now-1x sprite. All three are meant to be dialed in playtest.

// Single uniform world-camera zoom, used everywhere (garden + world — no per-
// context zoom, confirmed by the designer). The camera sat at 2.5 when the sprite
// was 2x; halving the sprite made it read tiny, so the camera zooms further in to
// compensate (the world stays massive, just viewed closer). The HUD, minimap,
// joystick and action buttons live on UIScene (scrollFactor 0, separate camera)
// and are NOT affected by this. Higher = closer in.
export const CAMERA_ZOOM = 4.0;

// Mobile-only world-camera zoom (Sprint mobile-playability). The desktop 4.0 is far
// too tight on a phone — the sprite fills the screen and the world isn't navigable —
// so on touch devices the camera pulls back to show enough world to move around.
// Desktop is untouched (still CAMERA_ZOOM). Starting point; dial in during feel-test.
export const MOBILE_CAMERA_ZOOM = 2.25;

// Camera-follow smoothing (Sprint pre-control). Lerp applied on BOTH axes in
// startFollow so the camera eases toward the player instead of hard-locking. Paired
// with per-camera roundPixels=false: at CAMERA_ZOOM=4 a hard integer-snapped follow
// made diagonal movement shimmer (world tiles crossed their pixel-rounding threshold
// on different frames as both axes advanced sub-pixel). Fractional scroll + this lerp
// removes the shimmer; pixelArt:true still gives crisp NEAREST sprite filtering.
// Higher = snappier/tighter follow, lower = floatier. Tunable in playtest.
export const CAMERA_LERP = 0.1;

// Garden prop render scale. The well, workshop/work_station, signpost, sleep bed,
// market stall, field-notes book and the garden beds were all authored at the old
// 2x sprite scale, so they now dwarf the 1x sprite. This multiplier scales their
// on-screen size down to match (1.0 = original authored size; 0.5 = halved).
export const GARDEN_PROP_SCALE = 0.5;

// Garden LAYOUT spacing. The bed grid / well / structure positions were spaced for
// the big props; every garden element is pulled toward the garden centre by this
// factor so the homestead stays a compact, walkable square at the new prop scale
// (1.0 = original Sprint 10 spacing; lower = tighter). The well sits at the bed-
// grid centre, so uniform scaling about the centre keeps it centred in the beds.
export const GARDEN_LAYOUT_SCALE = 0.6;

// Anchor for the layout scaling — the garden (fence) centre, which is also the
// authored player_start. Garden elements scale their offset from this point.
export const GARDEN_CENTER_X = GARDEN_X + GARDEN_WIDTH / 2;  // 3200
export const GARDEN_CENTER_Y = GARDEN_Y + GARDEN_HEIGHT / 2; // 3200

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
// Sprint 16: slowed 160 -> 120 so the 6400² world reads as appropriately large to
// traverse and a chase is a committed run. Sprint mobile-playability: 120 -> 108
// (~10% cut) so the large world feels fuller at the new mobile zoom; applies to both
// platforms. Live value is entities.json player.speed (what Player reads); this
// mirror is kept in sync as the canonical reference. NOTE: cutting the player alone
// raises the enemy-to-player chase ratio (enemies unchanged this sprint) — the enemy
// move-speed constants below stay exposed so the ratio can be held during tuning.
export const PLAYER_SPEED = 108;

// Slimes — Sprint 16 slowed (mirror of entities.json enemies.green_slime; enemy
// chase cut slightly more than the player so a fresh player can still outrun one).
export const SLIME_WANDER_SPEED = 28;
export const SLIME_CHASE_SPEED = 64;
export const SLIME_DETECT_RANGE = 80;
export const SLIME_LOSE_RANGE = 200;

// --- Mobile touch controls (Sprint mobile-playability) --------------------
// Sizes for the on-screen joystick + action buttons. They were oversized — the
// cluster crowded the minimap and made the interact/market target hard to hit — so
// every control scaled down. All tunable during device feel-test.
export const TOUCH_JOYSTICK_BASE_RADIUS = 56; // was 70
export const TOUCH_JOYSTICK_HANDLE_RADIUS = 24; // was 30
export const TOUCH_BUTTON_RADIUS = 30; // was 38
export const TOUCH_BUTTON_LABEL_PX = '20px'; // was 24px
// Dim factor for an action button that renders from the start but is not yet usable
// (e.g. ranged before a ranged weapon is acquired). Full-alpha once unlocked.
export const TOUCH_BUTTON_LOCKED_ALPHA = 0.3;

// Mobile dev-menu cheat: N rapid taps on the MAP button opens DevMenuScene (there is
// no tilde key on a phone). Taps must land within the reset window of each other, so
// ordinary single-tap map toggling never trips it.
export const MAP_CHEAT_TAP_COUNT = 10;
export const MAP_CHEAT_RESET_MS = 600;

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
