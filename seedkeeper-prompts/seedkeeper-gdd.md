# SEEDKEEPER
## Game Design Document v1.0
**Author:** Jaxon Travis  
**Created:** June 2026  
**Status:** Active Development — Sprint 1 In Progress

---

## SECTION 1 — CORE IDENTITY

**ONE-SENTENCE PITCH**  
A cozy-but-tense top-down RPG where you venture into a dangerous forest each day to collect seeds, grow them in your home garden to earn upgrade resources, and build a powerful enough character to fully restore the forest — starting with nothing and ending as its guardian.

**CORE EMOTION**  
Satisfying progression under gentle pressure. Every day you go out weaker than you want to be, come back with something, and feel measurably stronger for it. The loop should feel like momentum, not grind.

**TARGET PLAYER**  
Casual-to-mid gamers aged 18–35 who enjoy cozy aesthetics but want more mechanical depth than a pure farming sim. Stardew Valley players who wish it had more combat. Players who enjoy short sessions (15–30 min) with meaningful progress each time.

**THIS GAME IS NOT:**
- A survival game (no punishing fail states)
- A combat-focused action game (combat is a means to an end)
- A deep farming sim (planting is a reward mechanism, not the core loop)
- A story-heavy RPG (minimal narrative, mechanics-first)
- A procedurally generated roguelite (hand-crafted world, persistent upgrades)

**REFERENCE GAMES**
- Stardew Valley — safe home base, dangerous outside, day cycle, resource loop
- Forager — collect → deposit → upgrade satisfying feedback
- Hades — each run feels distinct, permanent progression between runs

---

## SECTION 2 — CORE LOOP

```
Wake at garden → harvest ready plants → spend at upgrade chest →
equip gear → go through gate → explore forest (3-min timer) →
fight enemies → collect seeds (limited slots) → return home →
plant seeds in beds → water to accelerate → sleep → repeat
```

**SESSION FEEL**  
A single play session = 3–5 day cycles = approximately 20–30 minutes. Each session should feel like a chapter: started weak, ended measurably stronger, want to come back.

**WIN CONDITIONS**  
- **Demo win (~20 min):** Grow one of each of the 6 plant types. Celebration sequence. Player can continue or return to menu.  
- **Full win:** All 6 upgrade trees maxed on both stat AND gear tracks. Distinct ending. Then New Game+ with 20% harder enemy density.

**FAIL STATE**  
None. Death drops carried seeds at death location (recoverable within 30 seconds). Respawn at garden. Setback, not reset.

---

## SECTION 3 — THE WORLD

### Zone 1 — The Garden (Safe Zone)
- **Visual:** Sprout Lands tileset — soft pastel grass, fencing, warm light
- **Contents:** 4 garden beds (start), upgrade chest, well, sleep bed, garden gate
- **Rules:** No enemies. Timer does not run. Player fully heals on sleep.

### Zone 2 — The Forest (Danger Zone)
- **Visual:** Mystic Woods tileset — denser trees, cooler palette
- **Contents:** Seeds near their geographic zones, slimes, skeletons (deep)
- **Rules:** Day timer runs. Enemy density increases each day. Enemies scale at timer expiry.

**World Size:** Single scrolling map. Garden ~20% (top), Forest ~80% (rest). Hand-placed in Tiled, exported as JSON.

**Camera:** Smooth follow, lerp 0.08–0.12, bounded to map edges.

---

## SECTION 4 — THE PLAYER

**BASE STATS** (all in entities.json)
```
maxHP: 100
speed: 160 (world units/sec)
attackDamage: 10
attackCooldown: 600ms
critChance: 0.05
dayTimerDuration: 180000ms (3 minutes)
seedSlots: 3
```

**CONTROLS**
```
WASD / Arrows  — movement
Spacebar       — melee attack
F              — interact (seed, plant, chest, sleep, swap)
R              — ranged attack (once unlocked)
Shift          — dash (once unlocked)
E              — inventory view
ESC            — pause
```

**PROGRESSION ARC**
- Days 1–2: Find first seeds, plant them, learn the loop
- Days 3–5: First upgrades, basic weapon, push deeper
- Days 6–10: Mid-tier gear, routing decisions matter
- Days 10+: Optimizing upgrade paths, full character build

---

## SECTION 5 — PLANTS & THE UPGRADE ECONOMY

**CORE PRINCIPLE**  
Each plant type = currency for exactly one upgrade tree.  
Each tree offers TWO paths: stat upgrade OR gear upgrade.  
Player cannot max both with normal play — meaningful identity decisions.

### The Six Plants

| Plant | Found Near | Growth | Stat Path | Gear Path |
|-------|-----------|--------|-----------|-----------|
| Red Mushroom | Dark tree clusters | 1 day | Attack +5%/level | Stick→Dagger→Sword |
| Blue Flower | Water edges | 1 day | Max HP +8%/level | None→Tunic→Leather→Chainmail |
| Golden Wheat | Sunny clearings | 1 day | Move speed +3%/level | Boots→Dash Boots |
| Green Herb | Forest entrance | 3 days | Day timer +15s/level | Satchel (+1 seed slot/tier) |
| Glowshroom | Deep forest/slime nests | 2 days | Crit chance +2%/level | Sling→Bow |
| Sunflower | Meadow clearings | 1 day | Harvest range +5%/level | Basic Can→Copper Can→Golden Can |

**UPGRADE COST SCALING**  
Levels 1–5 cost: 1 / 3 / 6 / 10 / 15 of that plant type  
Green Herb (slow grow, high value): 1 / 2 / 4 / 7 / 11

**GEAR COSTS (cumulative mushrooms as example)**
- Dagger: 3 | Sword: 12 total
- Tunic: 3 | Leather: 8 | Chainmail: 18 total
- Basic Boots: 3 | Dash Boots: 10 total
- Satchel tiers: 2 / 4 / 7 / 11 herbs total

**WATERING**  
Cuts remaining growth time by 33% for that day. Optional — no penalty for skipping.

**GARDEN BED EXPANSION**  
Start: 4 beds. Each herb satchel tier also unlocks 1 additional bed. Max: 8 beds.

---

## SECTION 6 — ENEMIES

### Green Slime (Mystic Woods)
- HP: 15 | Damage: 8 | Wander: 40px/s | Chase: 90px/s
- Detect: 80px | Lose: 200px
- Drops: 1 seed (random, weighted common)
- Appears: Day 1, everywhere in forest

### Dark Slime (Mystic Woods — purple tint via code)
- HP: 35 | Damage: 15 | Wander: 25px/s | Chase: 70px/s
- Detect: 150px | Lose: 300px
- Drops: 2 seeds (weighted mid-tier)
- Appears: Day 3+, mid to deep forest

### Skeleton (Mystic Woods premium)
- HP: 50 | Damage: 20 | Patrol: 55px/s | Chase: 110px/s
- Detect: 120px | Lose: 400px
- Drops: 1 glowshroom (guaranteed) + 1 random
- Appears: Day 5+, deep forest only, patrols fixed path

**Enemy Scaling:** +10% density per day. Post-timer: +50% speed and damage.

**Combat Feel Targets**
- Screenshake on player damage
- Knockback on enemy hit
- White flash (100ms) on damage received
- Float-up damage numbers
- Particle burst on death

---

## SECTION 7 — INVENTORY & SEED SYSTEM

**Seed Slots:** Start 3, max 7 (via herb satchel upgrades). One slot = one seed (not stackable).

**Pickup:** Auto-collect if slot open. Full = prompt "[F] Swap" → drops oldest seed, collects new.

**Death:** All carried seeds drop at death position. 30-second shrink/despawn timer. Recoverable if you run back fast enough.

**World Seeds:** Fixed positions by geographic zone. Bob animation. Name tag on proximity. Respawn after 90–150s (varies by rarity).

---

## SECTION 8 — THE UPGRADE CHEST (Shop Interface)

**Access:** F key at chest in garden. Full-screen overlay. Pauses game. ESC to close.

**Layout:**
- Left panel: Resource counts per plant type
- Center: 6 upgrade tree panels — each shows stat track (level 0–5, cost, bonus) and gear track (current tier, next item, cost)
- BUY buttons grey when insufficient resources
- Right panel: Currently equipped gear summary

**Confirmation:** "Spend 3 Red Mushrooms on Dagger? [Confirm] [Cancel]"

---

## SECTION 9 — HUD & UI

```
TOP LEFT:     HP bar (red) + "HP: 80/100" + armor icon
TOP CENTER:   "Day 4" + "FOREST" (red) or "GARDEN" (green)  
TOP RIGHT:    Day timer "2:47" — forest only, orange @30s, red @10s, pulses @10s
BOTTOM LEFT:  Seed slot row (3–7 slots, plant color icons)
BOTTOM RIGHT: Weapon icon | Armor icon | Boots icon | Ammo "↑ 8/10"
```

**Float-up Text:** Damage (red), heal (green), seed collected (yellow), upgrade (purple). 1.2s fade-up.

---

## SECTION 10 — SAVE SYSTEM

**3 save slots** on main menu. Each shows: day number, total playtime, plant progress icons.

**Save Schema (localStorage key: `seedkeeper_save_[0/1/2]`):**
```json
{
  "version": 1,
  "slotIndex": 0,
  "dayNumber": 4,
  "totalPlaytime": 2340,
  "bank": { "red_mushroom": 3, "blue_flower": 1, "golden_wheat": 0, "green_herb": 2, "glowshroom": 0, "sunflower": 5 },
  "upgrades": {
    "red_mushroom": { "stat": 1, "gear": 1 },
    "blue_flower":  { "stat": 0, "gear": 1 }
  },
  "equippedGear": { "weapon": "dagger", "armor": "tunic", "boots": "basic_boots" },
  "seedSlots": 4,
  "gardenBeds": [
    { "plantType": "red_mushroom", "daysRemaining": 0, "watered": false, "ready": true },
    { "plantType": "blue_flower",  "daysRemaining": 1, "watered": true,  "ready": false }
  ],
  "plantsGrownEver": { "red_mushroom": 2, "blue_flower": 1 },
  "newGamePlus": false,
  "savedAt": 1718000000000
}
```

**Auto-save triggers:** Sleep (day advance), upgrade purchased, return through gate.

---

## SECTION 11 — AUDIO DIRECTION

**Music**
- Garden: gentle, acoustic, pastoral loop
- Forest: slightly adventurous, subtle tension, same key as garden
- Crossfade on zone transition: 1.5 seconds

**Key SFX**
```
seed_collect     — soft chime
plant_harvest    — rustle + pop  
upgrade_purchase — warm ascending tone
attack_swing     — swoosh
enemy_hit        — soft thud
player_damaged   — impact + tone drop
day_timer_30s    — soft bell
day_timer_10s    — urgent pulse (loops)
gate_enter/exit  — ambient shift
sleep            — gentle fade
watering         — soft pour
```

All audio CC0 from freesound.org. Loaded via AssetLoader manifest at BootScene.

---

## SECTION 12 — ASSET CREDITS

```
Sprout Lands (Premium)
  Artist: Cup Nooble
  URL: https://cupnooble.itch.io/sprout-lands-asset-pack
  License: Commercial license purchased
  Usage: Garden tiles, player character, plants, UI elements

Sprout Lands UI Pack
  Artist: Cup Nooble  
  URL: https://cupnooble.itch.io/sprout-lands-ui-pack
  License: Verify on purchase page
  Usage: Inventory UI, buttons, icons, HUD elements

Mystic Woods (Paid)
  Artist: Game Endeavor
  URL: https://game-endeavor.itch.io/mystic-woods
  License: Commercial license purchased
  Usage: Forest tiles, slime enemies, skeleton enemy

Anokolisa Top-Down RPG Pack
  Artist: Anokolisa
  URL: https://anokolisa.itch.io/dungeon-crawler-pixel-art-asset-pack
  License: Free for commercial use with credit
  Usage: Weapon sprites, item icons

Audio: CC0 clips from freesound.org
[Update with each filename, creator, freesound ID as you add them]

Phaser 3 — https://phaser.io — MIT License
Vite — https://vitejs.dev — MIT License

Built by Jaxon Travis with AI assistance (Claude, Anthropic).
All design decisions and creative direction by the developer.
```

---

## SECTION 13 — TECHNICAL ARCHITECTURE

**Stack:** Phaser 3, Vite, Vanilla JS (ES modules), self-hosted portfolio iframe

**Project Structure:**
```
/src/
  main.js
  /core/
    EventBus.js       — pub/sub, no direct cross-module imports ever
    GameState.js      — state machine
    Constants.js      — every magic number lives here only
    SaveSystem.js     — 3-slot localStorage, versioned migration
  /scenes/
    BootScene.js      — preload + progress bar
    MenuScene.js      — title + 3 save slots
    GameScene.js      — gameplay
    UIScene.js        — HUD overlay (parallel scene)
    UpgradeScene.js   — chest UI overlay
    WinScene.js       — win sequence
  /entities/
    Player.js, Slime.js, Skeleton.js, Seed.js, GardenBed.js
  /systems/
    CombatSystem.js, DaySystem.js, InventorySystem.js, ParticleSystem.js
  /data/
    entities.json     — ALL tunable values
    assetManifest.json — all asset paths
/assets/
  /images/  /tilemaps/  /audio/
```

**Architecture Principles**
- EventBus: all cross-system communication, no direct imports between modules
- Constants.js: no magic numbers in logic code anywhere
- entities.json: no hardcoded gameplay values in JavaScript
- Delta time (dt): all movement and timers frame-rate independent
- Virtual 1600×900 world, scales to browser window
- Object pooling for particles, projectiles, float text

**Performance Targets:** 60fps on 2019+ laptop, <3s load, <100MB memory

---

## SECTION 14 — SCOPE PROTECTION

**V1.0 HARD SCOPE — build this, nothing else**
- 6 plant types, 3 enemy types, 3 weapon tiers, 3 armor tiers
- 2 boots tiers, 2 ranged tiers, 1 world map, 3 save slots
- Dual win condition + New Game+

**V2.0 BACKLOG — do not build now**
- Second biome (cave/dungeon)
- NPC villager, crafting system, lighting effects
- Mobile touch controls, leaderboard
- 3D version in Godot (separate project)
