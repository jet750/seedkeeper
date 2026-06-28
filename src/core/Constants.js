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
// Sprint mobile-playability-2: in portrait the controls felt oversized (the same
// landscape radii take a bigger share of the narrow width). Both the joystick and the
// action buttons shrink by this factor in the portrait branch of layout(); landscape
// keeps full size. Tunable during device feel-test.
export const TOUCH_PORTRAIT_SCALE = 0.8;
// Dim factor for an action button that renders from the start but is not yet usable
// (e.g. ranged before a ranged weapon is acquired). Full-alpha once unlocked.
export const TOUCH_BUTTON_LOCKED_ALPHA = 0.3;

// --- Mobile diamond action cluster (Sprint combat-input-mobile-consolidated) --
// The 2x2 grid was rotated 45° into a face-button diamond (interact top / melee
// inner-left / ranged-ability outer-right / dash bottom). The diamond is anchored
// from the bottom-right corner: its CENTRE sits TOUCH_DIAMOND_CENTER_X/Y in from the
// corner (past the safe insets), and each button is TOUCH_DIAMOND_SPREAD from that
// centre along the up/down/left/right axes. Raise the spread to space the four
// buttons further apart with NO re-layout (the whole diamond just grows). Portrait
// scales all three by TOUCH_PORTRAIT_SCALE. // TUNE
// Sprint mobile-control-feel: spread cut 70 -> 50 so the four buttons read as ONE
// connected face-cross (Xbox ABXY), not a sparse cross. Neighbour centre-to-centre is
// spread*√2 ≈ 70.7px ≈ 1.18× the 60px button diameter (target band 1.1–1.25×). // TUNE
export const TOUCH_DIAMOND_SPREAD = 50; // centre→button distance (button gaps grow with this)
export const TOUCH_DIAMOND_CENTER_X = 120; // diamond centre inset from the right edge
// Shared vertical resting anchor for BOTH control clusters (Sprint movement-jank). The
// joystick and the diamond both sit too high before this — near screen centre — which
// compresses the play area, badly in landscape. Instead of insetting each cluster's
// CENTRE from the bottom (which left a big gap below them), anchor each cluster's BOTTOM
// edge this many px above the effective bottom inset (= max(safe.bottom, BOTTOM_SAFE_MIN)),
// so both rest as low as the safe area allows and the play view above is maximised. Each
// cluster derives its own centre from its half-height, so the joystick and the diamond
// bottoms line up regardless of their different sizes. Small = lower (closer to the home
// indicator); raise to lift both clusters together. // TUNE
export const TOUCH_CLUSTER_BOTTOM_GAP = 16;
// Minimum bottom inset for the touch controls (Sprint mobile-control-feel). env(safe-
// area-inset-bottom) reports 0 in a non-PWA Android Chrome tab even though a bottom
// nav/URL bar overlaps, so the dash button fell under the chrome. The control layer
// never treats the bottom inset as less than this, guaranteeing clearance above the
// browser chrome / home indicator in BOTH orientations. // TUNE
export const TOUCH_BOTTOM_SAFE_MIN = 24;

// Mobile dev-menu cheat: N rapid taps on the MAP button opens DevMenuScene (there is
// no tilde key on a phone). Taps must land within the reset window of each other, so
// ordinary single-tap map toggling never trips it.
export const MAP_CHEAT_TAP_COUNT = 10;
export const MAP_CHEAT_RESET_MS = 600;

// --- Control scheme & combat input (Sprint control-scheme-combat-input) ----
// The full input / secondary-slot / auto-target framework. SPELL EFFECTS ARE OUT OF
// SCOPE this sprint: slot 1 = ranged (fully functional, drives the existing ranged
// system); slots 2..SECONDARY_SLOT_COUNT are inert spell SELECTORS (selecting changes
// the active secondary but casts nothing yet). All values below are feel knobs.
// Sprint magic-1: widened 5 → 7 (slot 1 ranged + 6 spell selectors) so all SIX Mage
// Mart spells map 1:1 onto a secondary slot (slot 2 = cheapest spell … slot 7 = most
// expensive). Slots 2-7 stay inert (no spell effects yet); a spell becomes SELECTABLE
// only once purified (unlocked) at the Mage Mart — see Player.selectSecondary gating.
export const SECONDARY_SLOT_COUNT = 7; // slot 1 ranged + 6 spell selectors

// Auto-target facing-weighted cone (FULL width, degrees). A candidate enemy must lie
// within ±(cone/2) of the player's facing to be acquired; wider = more forgiving aim.
// This is the fix for "ranged needs near-perfect axis alignment". Design range 90-120.
export const AUTO_TARGET_CONE_DEG = 100; // TUNE

// Projectile homing turn-rate (radians/sec) toward a per-shot locked target. SLIGHT —
// it nudges near-misses onto the target, it is NOT a guided missile. 0 = straight shot.
export const PROJECTILE_HOMING_RAD_PER_S = 3.5; // TUNE

// Desktop auto-target defaults OFF (weak / mouse-led, toggle with T). Mobile forces it
// on (strong / full-auto) regardless of this. Persisted per-save (save v5).
export const AUTO_TARGET_DESKTOP_DEFAULT = false; // TUNE

// Mobile radial secondary-select: hold the Ranged-Magic button this long (ms) to open
// the radial; a shorter tap fires instead. While open the world runs in slow-motion
// (timescale below) — NOT a hard pause.
export const RADIAL_LONGPRESS_MS = 260; // TUNE
export const RADIAL_TIMESCALE = 0.15; // ~15% speed while the radial is open // TUNE

// Mana scaffold (DORMANT until the spell sprint). The bar renders ONLY after the first
// spell unlock (none exist yet, so it stays hidden by default). Bar width matches the
// HP bar; mounts directly beneath it.
export const MANA_BAR_MAX_WIDTH = 240; // matches HP bar width
export const MANA_BAR_HEIGHT = 12;
export const MANA_DEFAULT_MAX = 100; // starting mana pool once unlocked // TUNE

// --- Corrupted souls currency (Sprint magic-1) ----------------------------
// Souls = corrupted forest spirits, the third currency (alongside plants → stat
// trees and coins → gear/capacity). They drop from slain enemies and are spent at
// the Mage Mart to "purify" (unlock + upgrade) spells. Drop = BASE[type] × level
// (the enemy's 1-5 level), banked immediately on death. Split-children award none
// (mirrors the coin/seed loot rule). All values TUNE — dial in during feel-test.
// NOTE: a future sortie/extraction loop will escrow souls in the world and forfeit
// them on death/timeout (mirroring the planned coins layer); banked-on-death is the
// interim model. // TUNE
export const SOUL_DROP_BASE = {
  green_slime: 1, // common woodland spirit — the everyday trickle
  dark_slime: 3, // corrupted heavier spirit
  skeleton: 5 // the rarest, most-corrupted remains
};
export const SOUL_DROP_FALLBACK = 1; // any enemy type not listed above

// Farmstand plant BUY markup (Sprint magic-1). Plants buy back at sellPrice × this —
// a HEAVY markup so rebuying a crop to feed a different stat tree is real friction (a
// rebalancing valve), never a free swap. Sell stays at economy.json sellPrices. // TUNE
export const FARMSTAND_MARKUP = 4;

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
