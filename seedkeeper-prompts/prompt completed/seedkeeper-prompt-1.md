# Seedkeeper — Sprint 1: Foundation & World

**What this sprint produces:** Complete Phaser 3 project scaffold. Player walks around a two-zone world. Slimes wander and chase. Day timer counts down in HUD. Every subsequent sprint builds on this — it must be stable before moving on.

**Playtestable result:** Walk around, avoid slimes, watch the timer.

---

You are building **Seedkeeper** — a top-down 2D RPG browser game using Phaser 3 and Vite. This is Sprint 1: Foundation and World. Build the complete project scaffold and first playable scene from scratch.

## Game Summary

Seedkeeper is a cozy-but-tense top-down RPG. The player wakes each day in a safe garden, ventures into a dangerous forest to collect seeds, returns home to plant them in garden beds, and spends the harvested plants on stat and gear upgrades at an upgrade chest. Core tension: a 3-minute day timer in the forest — stay too long and enemies get faster and stronger.

## Tech Stack

- Phaser 3 latest stable via npm
- Vite as dev server and build tool
- Vanilla JavaScript, ES modules only
- No TypeScript, no additional frameworks

## Asset Files

The following files are already placed in /assets/images/ and /assets/audio/. Use these exact filenames — if a file is missing, use a colored rectangle placeholder and add a TODO comment noting the missing asset.

**Images (all in /assets/images/):**
```
player_sheet.png         — Sprout Lands character sprite sheet (48x48px per frame, 4-dir walk+idle)
slime_sheet.png          — Mystic Woods green slime sprite sheet
skeleton_sheet.png       — Mystic Woods skeleton sprite sheet
tileset_garden.png       — Sprout Lands ground/grass tiles (16x16px tiles)
tileset_forest.png       — Mystic Woods forest tiles (16x16px tiles)
tileset_fence.png        — Sprout Lands fence tiles for garden boundary
```

**Audio (all in /assets/audio/):**
```
bgm_garden.mp3           — garden ambient music loop
bgm_forest.mp3           — forest music loop
sfx_gate.wav             — zone transition sound
```

## Project Structure to Create

```
/
├── index.html
├── package.json
├── vite.config.js
├── CREDITS.md
├── /src/
│   ├── main.js
│   ├── /core/
│   │   ├── EventBus.js
│   │   ├── GameState.js
│   │   └── Constants.js
│   ├── /scenes/
│   │   ├── BootScene.js
│   │   ├── MenuScene.js
│   │   ├── GameScene.js
│   │   └── UIScene.js
│   ├── /entities/
│   │   ├── Player.js
│   │   └── Slime.js
│   └── /data/
│       ├── entities.json
│       └── assetManifest.json
└── /assets/
    ├── /images/
    ├── /tilemaps/
    └── /audio/
```

## Architecture — Non-Negotiable

Implement all of the following exactly as specified. These patterns are the foundation everything else depends on.

### EventBus.js — Singleton Pub/Sub
```javascript
// Modules NEVER import each other directly.
// ALL cross-system communication goes through EventBus only.
const EventBus = {
  listeners: {},
  on(event, callback) { ... },
  off(event, callback) { ... },
  emit(event, data = {}) { ... }
};
export default EventBus;
```

### GameState.js — State Machine
```
States: LOADING, MENU, PLAYING, PAUSED, GAME_OVER, WIN
Valid transitions:
  LOADING  → MENU
  MENU     → PLAYING
  PLAYING  → PAUSED, GAME_OVER, WIN
  PAUSED   → PLAYING, MENU
  GAME_OVER → MENU
  WIN      → MENU

Methods:
  transition(newState) — validates, emits 'game:stateChanged' via EventBus, returns false if invalid
  is(state) — returns boolean
```

### Constants.js — Every Magic Number Lives Here Only
```javascript
export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 2400;
export const VIRTUAL_WIDTH = 1600;
export const VIRTUAL_HEIGHT = 900;
export const TILE_SIZE = 16;
export const GARDEN_ZONE_HEIGHT = 800;    // top N world-px is garden
export const DAY_TIMER_MS = 180000;       // 3 minutes
export const PLAYER_SPEED = 160;
export const SLIME_WANDER_SPEED = 40;
export const SLIME_CHASE_SPEED = 90;
export const SLIME_DETECT_RANGE = 80;
export const SLIME_LOSE_RANGE = 200;
```

No other file may contain numeric literals for gameplay values. Import from Constants.js.

### entities.json — All Tunable Gameplay Values
```json
{
  "player": {
    "maxHP": 100,
    "speed": 160,
    "attackDamage": 10,
    "attackCooldown": 600,
    "critChance": 0.05,
    "seedSlots": 3
  },
  "enemies": {
    "green_slime": {
      "hp": 15,
      "damage": 8,
      "wanderSpeed": 40,
      "chaseSpeed": 90,
      "detectRange": 80,
      "loseRange": 200
    },
    "dark_slime": {
      "hp": 35,
      "damage": 15,
      "wanderSpeed": 25,
      "chaseSpeed": 70,
      "detectRange": 150,
      "loseRange": 300
    }
  },
  "daySystem": {
    "timerDuration": 180000,
    "warningTime": 30000,
    "urgentTime": 10000,
    "postTimerSpeedMult": 1.5,
    "postTimerDamageMult": 1.5
  }
}
```

### Delta Time
ALL movement multiplied by `dt` (delta / 1000, in seconds). Pass `dt` to all entity update methods. The game loop:
```javascript
update(time, delta) {
  if (!GameState.is('PLAYING')) return;
  const dt = delta / 1000;
  this.player.update(dt);
  this.slimes.forEach(s => s.update(dt, this.player));
  this.daySystem.update(delta);
}
```

### Coordinate System
Virtual world: 1600×900 units. Canvas scales to fill browser window. Handle window resize. All entity positions in world units.

## Scene Requirements

### BootScene.js
- Load all assets listed in assetManifest.json
- Display loading progress bar (white rectangle fill on dark background, shows %)
- On load complete: `GameState.transition('MENU')`, start MenuScene

### MenuScene.js
- Title: "SEEDKEEPER" centered, large pixel-style text
- Three save slot buttons stacked: each shows "— Empty Slot —" for now (real data in Sprint 4)
- Any slot click: `GameState.transition('PLAYING')`, start GameScene
- Simple, clean layout — no animations needed yet

### GameScene.js
- Display two-zone world:
  - Garden zone: top GARDEN_ZONE_HEIGHT world-px — use tileset_garden.png tiles or solid green rect with label
  - Forest zone: remainder — use tileset_forest.png tiles or solid dark-green rect
  - Visual fence boundary at zone border using tileset_fence.png or a colored line
- Camera: follows player, lerp 0.1, hard-bounded to world dimensions (0,0 to WORLD_WIDTH,WORLD_HEIGHT)
- Spawn player at center of garden zone on game start
- Spawn 5 green slimes at varied positions in forest zone (spread across the zone)
- Fetch entities.json at scene create, store as `this.gameData`, pass to entities that need it
- Emit `'player:zoneChanged'` with `{ zone: 'garden' | 'forest' }` when player crosses GARDEN_ZONE_HEIGHT boundary
- On player death: emit `'player:died'`, transition `GAME_OVER` after 1500ms
- Music: play bgm_garden on start, crossfade to bgm_forest when player enters forest, reverse on return

### UIScene.js — Parallel Scene (launched with `{ active: true }`)
- Receives ALL state via EventBus. Never imports GameScene, Player, or Slime directly.
- Subscribes on create, unsubscribes on shutdown.

**Layout:**
```
TOP LEFT:    HP bar — red filled rect (width proportional to hp/maxHP), white border
             "HP: 80 / 100" text below bar
TOP CENTER:  "Day 1" text
             Zone badge: "GARDEN" in green or "FOREST" in red
TOP RIGHT:   Timer text "2:47" — ONLY visible when zone === 'forest'
             Normal color by default
             Orange (#ffaa00) when warningTime remaining
             Red (#ff3333) when urgentTime remaining
             Scale pulse tween at urgentTime (scale 1→1.15→1, repeat)
BOTTOM LEFT: Row of 3 grey rectangles (seed slot placeholders — real icons in Sprint 2)
```

All positions in screen coordinates (not world coordinates). Use scene cameras for UI.

## Player.js Requirements

- Phaser Arcade Physics body, circular collider
- Movement: WASD and arrow keys, 4-directional, normalized diagonal movement
- Track `this.facing` direction ('down', 'up', 'left', 'right') — update on any non-zero movement
- Animations using player_sheet.png: idle_down, idle_up, idle_left, idle_right, walk_down, walk_up, walk_left, walk_right (or placeholder if sheet not available — use tinted rectangle and skip animation)
- Stats loaded from gameData passed to constructor (not hardcoded)
- `this.currentHP` starts at `maxHP`
- **EventBus emissions:**
  - `'player:damaged'` — `{ amount, currentHP, maxHP }`
  - `'player:healed'` — `{ amount, currentHP, maxHP }`
  - `'player:died'` — `{}`
  - `'player:zoneChanged'` — `{ zone }` — emit when zone changes, debounced to once per actual change
- Zone detection: check `this.y` vs `GARDEN_ZONE_HEIGHT` each update frame
- 1-second invincibility after taking damage (flash white during invincibility — setTint/clearTint toggle every 100ms)
- No attack yet (Sprint 3)

## Slime.js Requirements

- Phaser Arcade Physics body
- Constructor takes `(scene, x, y, slimeType, gameData)` — slimeType is 'green_slime' or 'dark_slime'
- Stats loaded from `gameData.enemies[slimeType]`
- **State machine:** `WANDER` and `CHASE`
  - **WANDER:** Pick random direction, move at wanderSpeed. Pick new direction every 2000–3000ms (randomize per slime so they don't sync).
  - **CHASE:** Move directly toward player position at chaseSpeed.
  - `WANDER → CHASE`: player distance < detectRange
  - `CHASE → WANDER`: player distance > loseRange
- Contact with player body: emit `'player:damaged'` `{ amount: this.damage }` via EventBus. Do not call player methods directly.
- Slime HP tracked but no kill mechanic yet (added in Sprint 3)
- Sprite: use slime_sheet.png if available with walk animations; otherwise colored circle (green tint for green_slime, purple tint for dark_slime) as placeholder

## Day Timer System (inline in GameScene for Sprint 1)

- `this.dayTimer` — counts down in milliseconds
- Starts counting when player is in forest zone
- Pauses (stops decrementing) when player is in garden zone
- Resets to full `timerDuration` on sleep (sleep mechanic in Sprint 2 — for now expose a `resetDayTimer()` method)
- **At `warningTime` remaining:** emit `'day:timerWarning'` once
- **At `urgentTime` remaining:** emit `'day:timerUrgent'` once
- **At 0:** emit `'day:timerExpired'`. Apply `postTimerSpeedMult` to all slime chaseSpeed. Apply `postTimerDamageMult` to all slime damage. Emit `'day:postTimerActive'`.
- Timer value emitted each second: `'day:timerTick'` `{ remaining }` — UIScene listens to format and display

## Deliverables — Confirm All Before Finishing

```
[ ] npm install && npm run dev starts without errors
[ ] Browser shows loading progress bar, then menu screen
[ ] Three save slot buttons visible on menu
[ ] Clicking any slot starts GameScene
[ ] Player renders in garden zone
[ ] Player moves with WASD in all 4 directions at correct speed
[ ] Camera follows player, does not go outside world bounds
[ ] Garden and forest zones visually distinct with boundary
[ ] 5 slimes visible in forest zone
[ ] Slimes wander at low speed with direction changes
[ ] Slimes enter chase state when player approaches within range
[ ] Slimes return to wander when player escapes
[ ] Player takes damage on slime contact, HP bar decrements
[ ] Zone indicator in HUD changes between GARDEN and FOREST correctly
[ ] Day timer counts down only when in forest zone
[ ] Timer pauses when player returns to garden
[ ] Timer text turns orange at 30 seconds
[ ] Timer text turns red and pulses at 10 seconds
[ ] Post-timer: slimes visibly move faster after timer expires
[ ] Garden music plays in garden, forest music in forest (or console.log if audio not yet placed)
[ ] Browser console has zero errors and zero warnings
```

## Known Asset Gaps for Sprint 1

- **Mystic Woods has no bow/weapon animations:** weapons will be separate sprites in later sprints — no action needed in Sprint 1
- **If sprite sheets not yet copied to /assets/images/:** use colored rectangle placeholders for all entities and add TODO comments. The architecture is what matters in Sprint 1 — art can be swapped in at any time.
- **Tiled tilemap not yet created:** use colored rectangles for zones. Full tilemap integration happens in Sprint 5.
