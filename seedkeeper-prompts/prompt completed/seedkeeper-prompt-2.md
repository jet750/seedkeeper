# Seedkeeper — Sprint 2: Core Resource Loop

**What this sprint produces:** Seeds exist in the forest with geographic placement. Limited seed slot inventory with drop/swap. Garden beds with growth timers. Watering accelerates growth. Sleeping advances the day. Harvested plants go into a bank. The complete core loop exists end to end.

**Playtestable result:** Full grow loop — collect seeds, plant them, grow them, harvest them. No combat yet.

**Depends on:** Sprint 1 complete and all checklist items passing.

---

You are continuing development of Seedkeeper. This is Sprint 2: Core Resource Loop. The project already has a working Phaser 3 foundation from Sprint 1 — player movement, slime enemies, two-zone world, day timer, and HUD. Do not modify any working Sprint 1 systems unless specifically instructed below.

## Sprint 2 Goal

Implement the complete resource loop: seeds in the forest → carry in limited slots → plant at home → grow over days → harvest into bank. This is the backbone the rest of the game hangs on.

## New File: /src/entities/Seed.js

World seed object (exists in the game world, not in player inventory).

**Properties:** `plantType` (string key matching entities.json plants), `x`, `y`, `respawnDelay`

**Visual:**
- Colored circle matching `entities.json.plants[plantType].color`
- Bob animation: tween y ±4px, 1.2s loop, ease Sine.easeInOut
- Name tag text above seed showing `entities.json.plants[plantType].name`, only visible when player is within 60px — hide otherwise

**Collection:**
- On player overlap: if inventory slot available → `player.addSeed(plantType)` → emit `'seed:collected'` `{ plantType, position }`
- If slots full: show "[F] Swap" text prompt near player position (world-space text, not HUD)
- On F key with full slots: `player.dropSeed(player.getOldestSeed())` creates Seed world object at player feet, then collect new seed

**Respawn:** After being collected, seed object deactivates. Re-activates at same fixed world position after `respawnDelay` ms (from entities.json). Show subtle "growing back" opacity fade-in over 1 second on respawn.

## New File: /src/entities/GardenBed.js

Represents one plantable bed in the garden zone.

**States:** `EMPTY`, `PLANTED`, `GROWING`, `READY`

**Visuals per state:**
- `EMPTY`: brown/soil colored rectangle
- `PLANTED`: soil + small centered green dot
- `GROWING`: soil + taller green rect, floating text showing days remaining ("2 days")
- `READY`: full plant-colored rectangle (matching plant type color), gentle scale pulse (1.0→1.05→1.0, 1s loop)

**Interactions (all via F key when player within 48px):**
- `EMPTY` + player has seeds in inventory: plant oldest seed → state `PLANTED` → start growth → emit `'bed:planted'` `{ plantType, bedIndex }`
- `GROWING` or `PLANTED` + player has watering can water: water the bed → emit `'bed:watered'` `{ bedIndex }`
- `READY`: harvest → `plantBank[plantType]++` → emit `'plant:harvested'` `{ plantType }` → state `EMPTY`

**Growth:**
- `daysRemaining` set from `entities.json.plants[plantType].growthDays` on planting
- Decrements by 1 on each `day:advanced` event
- If `watered === true` when day advances: decrement by an additional 0.33 (floor, min 0)
- State becomes `READY` when `daysRemaining <= 0`
- `watered` flag resets to false at start of each new day

## Update entities.json — Add Plants Section

```json
"plants": {
  "red_mushroom": {
    "name": "Red Mushroom",
    "growthDays": 1,
    "color": "#cc3333",
    "foundNear": "dark_trees",
    "seedRespawn": 90000
  },
  "blue_flower": {
    "name": "Blue Flower",
    "growthDays": 1,
    "color": "#3366cc",
    "foundNear": "water",
    "seedRespawn": 90000
  },
  "golden_wheat": {
    "name": "Golden Wheat",
    "growthDays": 1,
    "color": "#ccaa00",
    "foundNear": "clearing",
    "seedRespawn": 90000
  },
  "green_herb": {
    "name": "Green Herb",
    "growthDays": 3,
    "color": "#33aa44",
    "foundNear": "entrance",
    "seedRespawn": 120000
  },
  "glowshroom": {
    "name": "Glowshroom",
    "growthDays": 2,
    "color": "#aa44ff",
    "foundNear": "deep_forest",
    "seedRespawn": 150000
  },
  "sunflower": {
    "name": "Sunflower",
    "growthDays": 1,
    "color": "#ffcc00",
    "foundNear": "meadow",
    "seedRespawn": 90000
  }
}
```

## Seed World Placement

Place seed objects at these fixed world-coordinate zones (adjust positions to fit your actual world layout, but respect the geographic grouping):

```
red_mushroom  × 3 — deep forest, grouped near dark tree cluster areas
blue_flower   × 2 — near water/stream area or forest bottom-left region  
golden_wheat  × 3 — open clearing, spread out, lower tree density area
green_herb    × 2 — near forest entrance (just past garden gate, shallow forest)
glowshroom    × 2 — deepest forest region, far from garden gate
sunflower     × 3 — open meadow patches, mid-forest
```

Each seed occupies its own fixed position. Positions should be visually spread — not all clustered in one corner. Comment each seed spawn with its plantType and geographic zone reason.

## Inventory System — Update Player.js

Add to Player:
```javascript
this.seedSlots = new Array(this.gameData.player.seedSlots).fill(null); // ['red_mushroom', null, null]

addSeed(plantType) {
  const emptyIndex = this.seedSlots.indexOf(null);
  if (emptyIndex === -1) return false; // full
  this.seedSlots[emptyIndex] = plantType;
  EventBus.emit('inventory:changed', { slots: [...this.seedSlots] });
  return true;
}

dropSeed(slotIndex) {
  const plantType = this.seedSlots[slotIndex];
  if (!plantType) return;
  this.seedSlots[slotIndex] = null;
  // Create world Seed object at player position
  new Seed(this.scene, this.x, this.y, plantType, this.scene.gameData);
  EventBus.emit('inventory:changed', { slots: [...this.seedSlots] });
}

getOldestSeed() {
  return this.seedSlots.findIndex(s => s !== null); // first filled slot (FIFO)
}
```

Emit `'inventory:full'` when collection attempted with no empty slots.

## UIScene Update — Seed Slot Display

Listen to `'inventory:changed'`. Update the bottom-left seed slot row:
- Filled slot: colored circle matching that plant's color from entities.json
- Empty slot: grey rectangle
- Slot count matches `slots.length` (will grow in Sprint 4 with satchel upgrades)

## New File: /src/systems/DaySystem.js

Extract day logic from GameScene into its own system.

```javascript
export default class DaySystem {
  constructor(scene, gameData) {
    this.scene = scene;
    this.gameData = gameData;
    this.dayNumber = 1;
    this.timerRemaining = gameData.daySystem.timerDuration;
    this.timerActive = false;
    this.warningEmitted = false;
    this.urgentEmitted = false;
  }

  setTimerActive(active) { this.timerActive = active; }

  update(delta) {
    if (!this.timerActive) return;
    this.timerRemaining -= delta;
    EventBus.emit('day:timerTick', { remaining: Math.max(0, this.timerRemaining) });
    if (!this.warningEmitted && this.timerRemaining <= this.gameData.daySystem.warningTime) {
      this.warningEmitted = true;
      EventBus.emit('day:timerWarning', {});
    }
    if (!this.urgentEmitted && this.timerRemaining <= this.gameData.daySystem.urgentTime) {
      this.urgentEmitted = true;
      EventBus.emit('day:timerUrgent', {});
    }
    if (this.timerRemaining <= 0) {
      this.timerRemaining = 0;
      EventBus.emit('day:timerExpired', {});
      this.setTimerActive(false);
    }
  }

  advanceDay() {
    this.dayNumber++;
    this.timerRemaining = this.gameData.daySystem.timerDuration;
    this.warningEmitted = false;
    this.urgentEmitted = false;
    // Notify garden beds to tick growth
    EventBus.emit('day:advanced', { dayNumber: this.dayNumber });
  }

  resetTimer() {
    this.timerRemaining = this.gameData.daySystem.timerDuration;
    this.warningEmitted = false;
    this.urgentEmitted = false;
  }
}
```

UIScene listens to `'day:advanced'` to update Day counter display.

## Sleep Mechanic

Add a sleep object (bed rectangle or sprite) in the garden zone.

On F key when player within 48px of sleep object:
1. `GameState.transition('PAUSED')` — stop all updates
2. Camera fade to black over 500ms
3. `daySystem.advanceDay()`
4. Heal player to full HP (emit `'player:healed'`)
5. `GameState.transition('PLAYING')`
6. Camera fade in from black over 500ms
7. Emit `'player:slept'` `{ dayNumber }`
8. `console.log('AUTO-SAVE placeholder — Day', dayNumber)` (real save in Sprint 4)

Day timer resets to full on sleep. Timer starts when player next enters forest.

## Well & Watering

Add a well object in the garden zone.

On F key when player within 48px of well:
- `player.hasWater = true`
- Show watering can icon or "💧" text indicator in HUD top-left (listen to new event `'player:gotWater'`)
- Emit `'player:gotWater'` `{}`

On F key when player near GROWING garden bed AND `player.hasWater === true`:
- Call `bed.water()` — sets `bed.watered = true`
- `player.hasWater = false`
- Emit `'player:usedWater'` `{}` — UIScene removes watering indicator
- Emit `'bed:watered'` `{ bedIndex }`

`advanceDay()` in DaySystem clears all bed `watered` flags via `'day:advanced'` event that beds listen to.

## Plant Bank

In GameScene, maintain:
```javascript
this.plantBank = {
  red_mushroom: 0, blue_flower: 0, golden_wheat: 0,
  green_herb: 0, glowshroom: 0, sunflower: 0
};
```

On `'plant:harvested'` event: `this.plantBank[data.plantType]++`

Emit `'bank:updated'` `{ bank: { ...this.plantBank } }` immediately after.

UIScene or console.log to confirm bank state (upgrade chest UI comes in Sprint 4).

## Deliverables Checklist

```
[ ] Seeds visible in forest at correct geographic zones
[ ] Seeds bob gently with smooth animation  
[ ] Name tags appear on proximity, hide at distance
[ ] Walking into seed auto-collects it if slot available
[ ] "[F] Swap" prompt appears when inventory is full
[ ] F key swaps seed when full (drops oldest, collects new)
[ ] Seed slot row in HUD shows plant color circles for filled slots
[ ] 4 garden beds visible in garden zone
[ ] F key near empty bed plants seed (oldest from inventory)
[ ] Bed shows GROWING state with days remaining text
[ ] F key near well fills watering can (HUD indicator appears)
[ ] F key on GROWING bed with water applies watering
[ ] F key near sleep object: screen fades, day advances, counter updates
[ ] Player fully healed on sleep
[ ] READY bed shows pulsing plant-colored visual
[ ] F key harvests READY bed → plant goes to bank → bank:updated emitted
[ ] Seeds respawn at fixed positions after their respawn timer
[ ] Day timer resets after sleeping
[ ] No Sprint 1 systems broken — all Sprint 1 checklist items still pass
```
