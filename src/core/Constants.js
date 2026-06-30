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

// Global texture key for the cached downscaled real-world map (Sprint minimap-realmap-
// seed-chest). GameScene generates it once at world load; the persistent minimap
// (UIScene) and the full-screen MapScene both sample it so they show the REAL world
// and stay consistent. Shared here so all three reference one key.
export const WORLD_MAP_TEXTURE_KEY = 'world_map_render';

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

// --- Threat-weighted targeting (Sprint mobile-overnight-batch, Phase 1) --------
// Replaces the mobile facing-CONE auto-target with a THREAT-weighted policy: the
// nearest actively-pursuing (aggroed) ON-SCREEN enemy wins, with only a SOFT pull
// toward the aim/run direction — so the reticle stays on the mass that is chasing
// you, not an off-screen wanderer that happens to lie dead ahead. Desktop's cone+
// cursor pick is untouched. Every weight below is a feel knob. // TUNE
export const TARGETING_ACQUIRE_RANGE = 380;     // furthest an enemy can be and still be auto-acquired (px)
export const TARGETING_OFFSCREEN_MARGIN = 24;   // px beyond the camera worldView still counted "on-screen"
export const TARGETING_OFFSCREEN_PENALTY = 2.2; // score ×penalty for an off-screen candidate (higher = avoid harder)
export const TARGETING_AGGRO_BIAS = 0.45;       // score ×bias for an aggroed/pursuing enemy (lower = prefer it)
export const TARGETING_FACING_BIAS = 0.5;       // soft facing/run-direction weight (0 = ignore aim, higher = pull harder toward it)
export const TARGETING_CLUSTER_RADIUS = 160;    // Zone (Frost) densest-visible-cluster neighbour radius (px)

// --- VFX performance budget (Sprint mobile-overnight-batch, Phase 2) -----------
// Combat juice (death bursts, collect pops, splats, confetti) now recycles from a
// pool instead of create/destroy-per-particle. Two knobs bound the budget; BOTH are
// deliberately CONSERVATIVE so VFX isn't degraded before the human confirms overdraw
// on-device (Safari profiling is a human step). // TUNE
//   MOBILE_VFX_SCALAR — ×combat-particle counts on mobile only. 0.5 CODIFIES the prior
//     hard-coded mobile "/2"; it is NOT new degradation. Raise toward 1.0 to restore
//     full mobile VFX, lower to trim further once overdraw is confirmed.
//   VFX_PARTICLE_CAP  — hard ceiling on concurrently-live pooled particles. A safety
//     valve only: 256 is far above what normal combat reaches, so it is effectively
//     OFF until lowered after on-device profiling.
export const MOBILE_VFX_SCALAR = 0.5; // TUNE
export const VFX_PARTICLE_CAP = 256;  // TUNE

// --- Mobile strafe-lock / tap-target / threat arrows (Phase 3) ----------------
// A LEFT-thumb strafe-lock toggle (by the joystick, NOT a 5th right-cluster button),
// tap-to-target, and edge-of-screen arrows pointing at off-screen pursuers. // TUNE
export const TOUCH_STRAFE_BTN_RADIUS_SCALE = 0.72; // strafe toggle size as a fraction of an action button
export const TOUCH_STRAFE_BTN_GAP = 8;             // px gap between the joystick ring and the strafe toggle
export const TOUCH_TAP_MAX_MS = 220;               // a press shorter than this (and barely moved) is a TAP, not a drag/hold
export const TOUCH_TAP_MAX_DIST = 18;              // px of travel under which a press still counts as a tap (screen px)
export const TOUCH_TAP_TARGET_RADIUS = 90;         // world px around a tap that can grab an enemy hard-lock
export const THREAT_ARROW_MAX = 6;                 // most off-screen threat arrows drawn at once (nearest pursuers win)
export const THREAT_ARROW_MARGIN = 20;             // px inset of the arrow track from the screen / safe-area edge
export const THREAT_ARROW_SIZE = 13;               // arrowhead half-length (px) on the HUD

// Mobile radial secondary-select: hold the Ranged-Magic button this long (ms) to open
// the radial; a shorter tap fires instead. While open the world runs in slow-motion
// (timescale below) — NOT a hard pause.
export const RADIAL_LONGPRESS_MS = 260; // TUNE
export const RADIAL_TIMESCALE = 0.15; // ~15% speed while the radial is open // TUNE

// Mana scaffold (LIVE from Sprint magic-2). The bar renders after the first spell is
// purified (unlockMana); casting a spell spends mana; mana regenerates passively. Bar
// width matches the HP bar; mounts directly beneath it.
export const MANA_BAR_MAX_WIDTH = 240; // matches HP bar width
export const MANA_BAR_HEIGHT = 12;
export const MANA_DEFAULT_MAX = 100; // base mana pool once unlocked // TUNE

// --- Mana economy (Sprint magic-2) ----------------------------------------
// Passive mana regen: a flat base rate, plus a contribution from the red_berry
// healthRegen node (so the regen stat tree feeds BOTH HP and mana). Max mana gets a
// small bump from the blue_flower spellPower node. spellPower (0..0.5 at max) also
// scales spell power/radius (applied per-spell). All TUNE.
export const MANA_REGEN_PER_SEC = 3; // flat mana/sec regenerated — lowered from 5 so sustained casting is a real drain (Ember rebalance) // TUNE
export const MANA_REGEN_FROM_REGEN_NODE = 2.5; // × red_berry healthRegen (HP/s) → extra mana/s // TUNE
export const MANA_PER_SPELLPOWER = 40; // × blue_flower spellPower → +max mana (≤ +20 at cap) // TUNE
export const SPELL_CAST_COOLDOWN_MS = 320; // min interval between casts so mana isn't frame-drained // TUNE

// --- Passive HP regen (Sprint survivability-drops) -------------------------
// HP now regenerates out of combat for EVERYONE via a flat base, mirroring how mana
// always trickles back (MANA_REGEN_PER_SEC). Previously HP only regenerated if you'd
// invested in the red_berry regen node, so a fresh player never healed between fights.
// The red_berry healthRegen node still feeds BOTH HP (here) and mana (above) per the
// locked design — the regen tree covers both pools. base maxHP is 100.
export const HP_REGEN_BASE = 1.5; // flat HP/sec out of combat → ~67s full refill at 0 stat // TUNE
export const HP_REGEN_FROM_REGEN_NODE = 1.0; // × red_berry healthRegen (0..2.0 HP/s) on top → up to 3.5 HP/s at max // TUNE
export const HP_REGEN_DELAY_MS = 3000; // passive HP regen pauses this long after a hit; dial to 0 to disable the stall // TUNE

// --- Ember spell (Sprint magic-2) — the implemented template ---------------
// A semi-homing single-target bolt with a procedural flame-teardrop silhouette + spark
// trail (distinguishable by SHAPE + MOTION, not colour alone — so a future dark mirror
// reads as the dark version of this). The upgrade ladder (level 1-4, where level 1 is
// the unlock): L1 base bolt → L2 +damage → L3 small impact AoE → L4 wide AoE. blue_flower
// spellPower scales damage + AoE radius. All numbers TUNE.
export const EMBER_BOLT_SPEED = 430; // px/sec // TUNE
export const EMBER_BOLT_RANGE = 380; // px before it fizzles // TUNE
export const EMBER_HOMING_RAD_PER_S = 5.5; // semi-homing turn rate (stronger than the bow's 3.5) // TUNE
// Per-level tier table (index = level-1). damage = direct-hit damage; aoeRadius = impact
// blast radius (0 = single-target); aoeDamageMult = blast damage as a fraction of `damage`.
// Damage curve shifted DOWN by 4 from the original 12/20/24/28 (Ember rebalance): the
// L1→L4 progression (deltas +8/+4/+4) is preserved, but the whole curve drops so Ember is
// "kill this one thing," not "delete the army" — melee/ranged stay relevant for trash. // TUNE
export const EMBER_TIERS = [
  { damage: 8,  aoeRadius: 0,   aoeDamageMult: 0 },    // L1 — base bolt (the unlock)
  { damage: 16, aoeRadius: 0,   aoeDamageMult: 0 },    // L2 — +damage
  { damage: 20, aoeRadius: 52,  aoeDamageMult: 0.6 },  // L3 — small impact AoE on hit
  { damage: 24, aoeRadius: 112, aoeDamageMult: 0.7 }   // L4 — wide "diameter nuke" AoE
];

// ════════════════════════════════════════════════════════════════════════════
// Sprint magic-3 — the four combat spells (Arc · Frost · Thornfield · Bulwark).
// EVERY number below is a FIRST-PASS, EXPLICITLY UNBALANCED value (// TUNE). The
// magic-3 sprint's job was to make each effect WORK and read distinctly tier-to-
// tier, NOT to balance damage/radius/mana — do not treat these as tuned. Each
// table is index = level-1 (L1 = unlock, +1 per Mage Mart upgrade). blue_flower
// spellPower scales damage + radii per-spell (mirrors Ember).
// ════════════════════════════════════════════════════════════════════════════

// --- Arc (chain lightning) — "thin this pack" --------------------------------
// Instant strike to the nearest enemy, then chains to the nearest un-hit enemy
// within chainRange, with per-jump damage falloff. Ladder: L2 +jump, L3 +range,
// L4 +per-jump damage (higher falloff = less lost per jump). chainCount = jumps
// AFTER the first strike (so total targets = 1 + chainCount). // TUNE (all)
export const ARC_TIERS = [
  { damage: 10, chainCount: 2, chainRange: 170, falloff: 0.55 }, // L1 — strike + chain to 2
  { damage: 10, chainCount: 3, chainRange: 170, falloff: 0.55 }, // L2 — +1 jump
  { damage: 10, chainCount: 3, chainRange: 260, falloff: 0.55 }, // L3 — +chain range
  { damage: 14, chainCount: 3, chainRange: 260, falloff: 0.85 }  // L4 — +per-jump damage
];
export const ARC_STRIKE_RANGE = 360; // px the initial auto-lock strike can reach // TUNE

// --- Frost (slow / freeze / field) — "stop them so I can move" ---------------
// L1 slow+root one target. L2 adds a self/target-centred freeze NOVA. L3 adds a
// lingering ground-ice FIELD (persistent slow zone w/ floor decal). L4 +radius.
// slowMult = velocity multiplier while chilled (lower = slower; ~0.3 reads as a
// near-root). novaRadius 0 = single-target; fieldMs 0 = no lingering field. // TUNE
export const FROST_TIERS = [
  { damage: 6, slowMult: 0.30, slowMs: 1600, novaRadius: 0,   fieldRadius: 0,   fieldMs: 0    }, // L1 — slow+root one
  { damage: 6, slowMult: 0.30, slowMs: 1600, novaRadius: 120, fieldRadius: 0,   fieldMs: 0    }, // L2 — nova freeze
  { damage: 6, slowMult: 0.35, slowMs: 1600, novaRadius: 120, fieldRadius: 130, fieldMs: 4000 }, // L3 — lingering field
  { damage: 6, slowMult: 0.35, slowMs: 1600, novaRadius: 140, fieldRadius: 190, fieldMs: 4500 }  // L4 — +field radius
];

// --- Thornfield (ground denial) — "deny this ground" -------------------------
// A vine patch placed on the ground (at the locked target, else ahead of the
// player). Slows + DoT-damages enemies pathing through; NEVER touches the player
// (fields only iterate scene.enemies). Ladder: L2 +size, L3 +DoT (more/faster
// ticks), L4 dense enough to BLOCK pathing (a static collider barrier). // TUNE
export const THORNFIELD_TIERS = [
  { fieldRadius: 90,  fieldMs: 5000, dmgPerTick: 3, tickMs: 700, slowMult: 0.55, blocks: false }, // L1 — vine patch
  { fieldRadius: 130, fieldMs: 5000, dmgPerTick: 3, tickMs: 700, slowMult: 0.55, blocks: false }, // L2 — +size
  { fieldRadius: 130, fieldMs: 6000, dmgPerTick: 6, tickMs: 480, slowMult: 0.50, blocks: false }, // L3 — +DoT
  { fieldRadius: 150, fieldMs: 6000, dmgPerTick: 6, tickMs: 480, slowMult: 0.40, blocks: true  }  // L4 — dense barrier
];
export const THORNFIELD_AHEAD_DIST = 110; // px ahead of the player to plant when no target is locked // TUNE

// --- Bulwark (self-cast block / dome) — "survive this burst" -----------------
// L1/L2 are REACTIVE: a guard goes up for armMs during which the player CANNOT
// attack; the first hit taken is negated and grants negateMs of full invuln, then
// the guard ends. L3/L4 are a STATIC invulnerability DOME (cast-and-forget): full
// invuln for durationMs, attacking locked the whole time. domeRadius drives the
// pulsing-ring VFX size. // TUNE (all)
export const BULWARK_TIERS = [
  { mode: 'reactive', armMs: 1400, negateMs: 700,  domeRadius: 46 }, // L1 — reactive block
  { mode: 'reactive', armMs: 1800, negateMs: 1100, domeRadius: 50 }, // L2 — longer block
  { mode: 'dome',     durationMs: 3000, domeRadius: 62 },            // L3 — invuln dome
  { mode: 'dome',     durationMs: 4500, domeRadius: 74 }             // L4 — +dome duration
];

// ════════════════════════════════════════════════════════════════════════════
// Sprint magic-4 — Sprout Sentinel (the SIXTH spell): a persistent, stationary
// auto-turret summoned from the soil. Unlike the other five (instant-effect casts),
// casting the Sentinel PLANTS an entity that lives for a lifetime, auto-targets the
// nearest enemy in range, and fires a green mini-bolt on a fire interval — then
// despawns. Capped at ONE active (a recast REPLACES the standing one). v1 is a BASE
// RANGED turret with LINEAR L1→L4 tiers (the persistent-entity is the new hard part;
// melee/mage branches are a deliberate follow-up behind the entity's `mode` seam,
// default 'ranged'). EVERY number here is FIRST-PASS, EXPLICITLY UNBALANCED. // TUNE
// ════════════════════════════════════════════════════════════════════════════

// Body sprite: a RETIRED crop sheet rendered at its grown column so the turret reads as
// a planted stalk (corn = tall, tower-shaped). The texture is ALREADY registered through
// the manifest → imageImports.js path, so it emits in the prod build (the raw glob would
// drop it — see MEMORY vite-glob-asset-emission); the body is a // TUNE swap. SproutSentinel
// guards with textures.exists() + a procedural fallback so it never renders as nothing.
export const SENTINEL_BODY_TEXTURE = 'corn'; // manifest spritesheet key (registered + prod-verified) // TUNE
export const SENTINEL_BODY_FRAME = 5; // grown column (matches GardenBed PLANT_READY_FRAME) // TUNE
export const SENTINEL_BODY_SCALE = 2.2; // draw scale — taller than a bed crop so it reads as a turret // TUNE
export const SENTINEL_BODY_DEPTH = 8; // sits in the world like a slime (player=10, bolts=10 render over it)

// Placement: auto-plant just AHEAD of the player along the aim angle (NO tap-to-place on
// mobile). 0 = plant on the player.
export const SENTINEL_AHEAD_DIST = 30; // px ahead of the player to plant // TUNE

// Cap: only this many Sentinels may stand at once; a recast REPLACES the oldest (despawn
// + re-plant at the new spot). Seam: see SpellSystem.spawnSentinel to BLOCK instead.
export const SENTINEL_MAX_ACTIVE = 1;

// Mini-bolt look: the turret reuses the pooled Ember SpellBolt, tinted GREEN and scaled
// DOWN so its shot reads as a "green mini fireball", NOT an Ember cast. Trails are neutral
// white so the green tint lands cleanly on them.
export const SENTINEL_BOLT_TINT = 0x8ae66b; // vivid leaf green // TUNE
export const SENTINEL_BOLT_SCALE = 0.6; // × the tier-1 kite scale — a small bolt // TUNE
export const SENTINEL_BOLT_SPEED = 360; // px/sec // TUNE

// Per-level tier table (index = level-1; L1 = unlock, +1 per Mage Mart upgrade). LINEAR
// ramp on ALL FOUR stats — a simple monotone ladder (NOT the branch system). spellPower
// (blue_flower) scales damage + range per-cast (mirrors the other spells). // TUNE (all)
//   damage     = per-bolt hit damage
//   fireMs     = ms between shots (LOWER = faster fire rate)
//   lifetimeMs = how long the turret stands before despawning
//   range      = px the turret can acquire AND reach a target
export const SENTINEL_TIERS = [
  { damage: 5,  fireMs: 1100, lifetimeMs: 8000,  range: 220 }, // L1 — base turret
  { damage: 8,  fireMs: 900,  lifetimeMs: 10000, range: 260 }, // L2 — +damage, +fire rate
  { damage: 11, fireMs: 720,  lifetimeMs: 12000, range: 300 }, // L3 — +damage/rate, +lifetime
  { damage: 15, fireMs: 560,  lifetimeMs: 15000, range: 360 }  // L4 — +all
];

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

// --- Coin + plant drops on kill (Sprint survivability-drops) ----------------
// Kills now pay COINS (banked at once via addCoins, BASE[type] × enemy level —
// mirrors the souls faucet) plus a SMALL chance of a full-grown plant. This REPLACES
// the old enemy seed drops: seeds now come only from the daily reroll, wild map
// seeds, and growing. Split-children (`light`) award nothing, same as souls. All TUNE.
export const COIN_DROP_BASE = {
  green_slime: 2, // everyday trickle
  dark_slime: 6, // heavier purse
  skeleton: 12 // the big payout
};
export const COIN_DROP_FALLBACK = 2; // any enemy type not listed above
// Chance any single kill also drops a full-grown plant (PlantBundle → straight to the
// sellable plant bank). One small UNIVERSAL chance across every kill — supersedes the
// old high per-enemy bundleDropChance (dark_slime 0.5 / skeleton 0.7, green none). The
// plant pool + weighting live in lootTable.js bundleDropWeights (entities.json loot). // TUNE
export const FULL_PLANT_DROP_CHANCE = 0.05;

// Farmstand plant BUY markup (Sprint magic-1). Plants buy back at sellPrice × this —
// a HEAVY markup so rebuying a crop to feed a different stat tree is real friction (a
// rebalancing valve), never a free swap. Sell stays at economy.json sellPrices. // TUNE
export const FARMSTAND_MARKUP = 4;

// --- Seed storage chest (Sprint minimap-realmap-seed-chest) ----------------
// Garden interactable that holds seed overflow beyond the carry satchel. Deposit/
// withdraw between satchel and chest; contents persist in save (v7). Capacity is the
// total number of seeds the chest can hold across all types — deliberately GENEROUS
// so it reads as "bottomless storage" relative to the 3-8 slot satchel. // TUNE
export const CHEST_SEED_CAPACITY = 200;

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
