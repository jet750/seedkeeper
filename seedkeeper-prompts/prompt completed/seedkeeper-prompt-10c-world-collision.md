# Seedkeeper — Sprint 10c: World Design, Collision & Planting Picker

**What this sprint produces:** Strategic planting inventory picker showing grow
times. Collision physics on all world objects so they block movement. World
zone layout redesigned with distinct geographic areas (meadow, mid-forest,
deep forest, river with bridge). Collision-ready tree rows that act as natural
barriers. Full collision layer architecture so adding real tileset art later
is a one-line swap.

**Note on art assets:** This sprint builds the world STRUCTURE and COLLISION
SYSTEM with colored placeholder zones. Real tileset art is wired in Sprint 10d
once frame indices are confirmed from visual inspection. The world will feel
navigable and have correct collision before art lands.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-10c-world-collision
```

---

## Feature 1 — Planting Inventory Picker

When the player presses F near an empty garden bed and has multiple seeds,
instead of auto-planting the oldest seed, show a picker overlay letting them
choose which seed to plant and see grow times before committing.

### Picker UI

In UIScene, add a planting picker panel triggered by `'bed:plantPrompt'` event:

```javascript
// GameScene emits when player presses F near empty bed with seeds available:
EventBus.emit('bed:plantPrompt', {
  bedIndex: bed.index,
  availableSeeds: player.seedSlots.filter(s => s !== null),
  bedPosition: { x: bed.x, y: bed.y }
});
```

UIScene shows a panel centered on screen (not near the bed — centered is more
readable):

```
┌─────────────────────────────────────────────┐
│           Choose a seed to plant            │
├──────────┬──────────┬──────────┬────────────┤
│ 🟢        │ 🟡        │ 🟣        │            │
│ Green    │ Sunflower│ Glowshroom│ [Cancel]   │
│ Herb     │          │          │   [Esc]    │
│ 3 days   │ 1 day    │ 2 days   │            │
│ [1]      │ [2]      │ [3]      │            │
└──────────┴──────────┴──────────┴────────────┘
```

Each seed option shows:
- Plant color circle (matching existing color scheme)
- Plant name from `entities.json`
- Growth days — this is the strategic information the player needs
- Number key shortcut (1, 2, 3... matching slot position)
- Whether it has been watered before (show 💧 if watered version available)

On selection: emit `'bed:plantConfirmed'` `{ bedIndex, plantType, slotIndex }`
GameScene listens and executes the plant action using the chosen slot.

On cancel (ESC or Cancel button): close picker, no action taken.

Also show a small note if the player has the golden watering can:
"Golden Can: waters all beds after planting"

```javascript
// In GardenBed.js, change F-key handler:
// OLD: auto-plant oldest seed
// NEW: emit bed:plantPrompt, wait for bed:plantConfirmed
onInteract(player) {
  if (this.state === 'EMPTY') {
    const seeds = player.seedSlots.filter(s => s !== null);
    if (seeds.length === 0) return; // no seeds, prompt already shows "Need a seed"
    if (seeds.length === 1) {
      // Only one seed — skip picker, plant directly
      this.plant(seeds[0], player.seedSlots.indexOf(seeds[0]), player);
    } else {
      // Multiple seeds — show picker
      EventBus.emit('bed:plantPrompt', {
        bedIndex: this.index,
        availableSeeds: [...player.seedSlots],
        plantData: this.scene.gameData.plants
      });
    }
  }
  // READY, GROWING states unchanged
}
```

Save `plantData` reference to UIScene via the event so it has grow time info.

---

## Feature 2 — World Zone Architecture

Replace the current two-zone world (garden rectangle + forest rectangle) with
a proper multi-zone world with distinct geographic areas. This is the world
layout that real art will slot into in Sprint 10d.

### Zone Map (world coordinates, top to bottom)

```
Y: 0 to GARDEN_ZONE_HEIGHT (800px)
  ┌─────────────────────────────────┐
  │           GARDEN ZONE           │
  │  Safe, warm, all interactables  │
  │  Garden beds, chest, well, bed  │
  └─────────────────────────────────┘
  ═══════════════════════════════════  ← Fence + Gate (existing)

Y: 800 to 1200 (400px)
  ┌─────────────────────────────────┐
  │         MEADOW ENTRANCE         │
  │  Light, open, low enemy density │
  │  Green herb seeds here          │
  │  Sunflower seeds in clearings   │
  │  Scattered rocks and flowers    │
  └─────────────────────────────────┘

Y: 1200 to 1600 (400px)
  ┌─────────────────────────────────┐
  │          MID FOREST             │
  │  Denser, tree rows as barriers  │
  │  Red mushroom, blue flower here │
  │  Golden wheat in clearings      │
  │  Green and dark slimes          │
  └─────────────────────────────────┘

Y: ~1500 (horizontal strip)
  ═══ RIVER ══ [BRIDGE] ══ RIVER ═══  ← Water + bridge crossing point

Y: 1600 to 2400 (800px)
  ┌─────────────────────────────────┐
  │          DEEP FOREST            │
  │  Dark, dense, high danger       │
  │  Glowshroom seeds here          │
  │  Skeletons patrol here          │
  │  Dark slimes only               │
  └─────────────────────────────────┘
```

### Zone Constants

Add to `src/core/Constants.js`:
```javascript
export const MEADOW_START    = GARDEN_ZONE_HEIGHT;        // 800
export const MEADOW_END      = GARDEN_ZONE_HEIGHT + 400;  // 1200
export const MID_FOREST_START = 1200;
export const RIVER_Y          = 1500;
export const DEEP_FOREST_START = 1600;
export const BRIDGE_X         = WORLD_WIDTH / 2;          // center bridge
export const BRIDGE_WIDTH     = 120;
```

### Zone Visual Colors (placeholders until Sprint 10d art)

In GameScene, replace the two solid rectangles with four distinct zones:

```javascript
createZoneVisuals() {
  // Garden — warm light green
  this.add.rectangle(0, 0, WORLD_WIDTH, GARDEN_ZONE_HEIGHT, 0x5a8f3c)
    .setOrigin(0, 0).setDepth(0);

  // Meadow entrance — slightly lighter, open feel
  this.add.rectangle(0, MEADOW_START, WORLD_WIDTH, 400, 0x4a7a30)
    .setOrigin(0, 0).setDepth(0);

  // Mid forest — medium dark green
  this.add.rectangle(0, MID_FOREST_START, WORLD_WIDTH, 400, 0x2d5a1a)
    .setOrigin(0, 0).setDepth(0);

  // River strip
  this.add.rectangle(0, RIVER_Y - 16, WORLD_WIDTH, 80, 0x2255aa)
    .setOrigin(0, 0).setDepth(0);

  // Deep forest — darkest
  this.add.rectangle(0, DEEP_FOREST_START, WORLD_WIDTH, WORLD_HEIGHT - DEEP_FOREST_START, 0x1a3a0a)
    .setOrigin(0, 0).setDepth(0);
}
```

---

## Feature 3 — River and Bridge

The river is a visual and physics barrier. The only crossing point is the bridge.

### River Physics Wall

```javascript
createRiver() {
  // River visual already created in createZoneVisuals()

  // Physics wall — blocks entire river width except bridge gap
  const riverWalls = this.physics.add.staticGroup();

  // Left of bridge
  const leftWall = riverWalls.create(
    (BRIDGE_X - BRIDGE_WIDTH / 2) / 2,  // center of left section
    RIVER_Y,
    null
  );
  leftWall.setSize(BRIDGE_X - BRIDGE_WIDTH / 2, 80).refreshBody().setVisible(false);

  // Right of bridge
  const rightWall = riverWalls.create(
    BRIDGE_X + BRIDGE_WIDTH / 2 + (WORLD_WIDTH - BRIDGE_X - BRIDGE_WIDTH / 2) / 2,
    RIVER_Y,
    null
  );
  rightWall.setSize(WORLD_WIDTH - BRIDGE_X - BRIDGE_WIDTH / 2, 80).refreshBody().setVisible(false);

  this.physics.add.collider(this.player, riverWalls);
  this.physics.add.collider(this.enemies, riverWalls);
  this.riverWalls = riverWalls;
}
```

### Bridge Visual

```javascript
createBridge() {
  // Bridge placeholder — brown rectangle spanning river
  // Will be replaced with bridge sprite in Sprint 10d
  this.bridgeVisual = this.add.rectangle(
    BRIDGE_X,
    RIVER_Y,
    BRIDGE_WIDTH,
    80,
    0x8b6914   // brown wood color
  ).setDepth(1);

  // Optional: bridge planks as horizontal lines for detail
  for (let i = 0; i < 5; i++) {
    this.add.rectangle(
      BRIDGE_X,
      RIVER_Y - 32 + (i * 16),
      BRIDGE_WIDTH - 8,
      4,
      0x6b4a10
    ).setDepth(2);
  }
}
```

---

## Feature 4 — Tree Row Barriers

Tree rows act as natural navigation barriers in the mid-forest and deep forest.
Rows of trees with physics colliders force the player to find gaps to navigate
through, creating routing decisions.

### Tree Row System

```javascript
createTreeRows() {
  this.treeObjects = this.physics.add.staticGroup();

  // Define tree rows — each row is an array of [x positions] at a given Y
  const TREE_ROWS = [
    // Meadow border trees (decorative, no collision yet)
    { y: MEADOW_END - 20, positions: this.generateTreeRow(8, 0.15), collide: false },

    // Mid forest barriers — 3 partial rows with gaps
    { y: MID_FOREST_START + 100, positions: this.generateTreeRow(10, 0.25), collide: true },
    { y: MID_FOREST_START + 250, positions: this.generateTreeRow(10, 0.25), collide: true },

    // Deep forest entry barrier — denser
    { y: DEEP_FOREST_START + 100, positions: this.generateTreeRow(12, 0.2), collide: true },
    { y: DEEP_FOREST_START + 300, positions: this.generateTreeRow(12, 0.2), collide: true },
    { y: DEEP_FOREST_START + 500, positions: this.generateTreeRow(14, 0.15), collide: true },
  ];

  TREE_ROWS.forEach(row => {
    row.positions.forEach(x => {
      // Visual placeholder — dark green circle/rectangle for tree trunk
      const treeVisual = this.add.rectangle(x, row.y, 24, 32, 0x1a4a0a).setDepth(3);

      if (row.collide) {
        // Physics trunk — narrower than visual so player can squeeze past edges
        const trunk = this.treeObjects.create(x, row.y + 8, null);
        trunk.setSize(16, 16).refreshBody().setVisible(false);
      }
    });
  });

  this.physics.add.collider(this.player, this.treeObjects);
  this.physics.add.collider(this.enemies, this.treeObjects);
}

generateTreeRow(count, gapChance) {
  // Returns X positions for trees in a row
  // gapChance = probability of skipping a tree (creates navigation gaps)
  const positions = [];
  const spacing = WORLD_WIDTH / count;
  for (let i = 0; i < count; i++) {
    if (Math.random() > gapChance) {  // keep tree
      positions.push(spacing * i + spacing / 2 + (Math.random() - 0.5) * 20);
    }
  }
  return positions;
}
```

**Important:** Tree rows must have at least 2 gaps wide enough for the player
(48px+ each gap). After generating, verify at least 2 gaps exist per row and
add one manually if not:
```javascript
// Safety: ensure minimum 2 gaps per row
if (positions.length >= count - 1) {
  // Too dense — force remove 2 random trees
  positions.splice(Math.floor(positions.length / 3), 1);
  positions.splice(Math.floor(positions.length * 2 / 3), 1);
}
```

---

## Feature 5 — Sign and World Object Collision

World detail signs and large props should have physics bodies so the player
walks around them, not through them.

In `src/entities/WorldDetail.js`, add optional collision:

```javascript
constructor(scene, x, y, config) {
  // ... existing code ...
  if (config.hasCollision) {
    scene.physics.add.existing(this.sprite, true); // true = static body
    this.sprite.body.setSize(12, 16); // narrow collision box for signs
    scene.physics.add.collider(scene.player, this.sprite);
  }
}
```

Update WorldDetail placements in GameScene to add `hasCollision: true` to
the sign/post objects. Mushroom clusters and flowers should NOT have collision —
only solid objects like posts, rocks, and the signpost.

For the signpost in the garden:
```javascript
// In GameScene, after creating signpost:
this.physics.add.existing(this.signpost, true);
this.signpost.body.setSize(10, 20);
this.physics.add.collider(this.player, this.signpost);
```

For the field notes book object:
Same pattern — add static body, narrow collision, player collider.

For rock formations (already exist from Sprint 7):
Verify the existing rock collision groups include the new zone's rocks.
Rocks in the meadow zone should be added to `this.treeObjects` group or
a new `this.propColliders` static group.

---

## Feature 6 — Seed Repositioning to Match New Zones

Move seed spawn positions to match the new geographic zone layout.
Seeds should now appear in their correct biome:

```javascript
const SEED_POSITIONS = [
  // MEADOW ENTRANCE (Y: 800-1200) — entrance seeds, easy to reach
  { type: 'green_herb',    x: 400,  y: 900  },
  { type: 'green_herb',    x: 2800, y: 1000 },
  { type: 'sunflower',     x: 800,  y: 950  },
  { type: 'sunflower',     x: 2400, y: 850  },
  { type: 'sunflower',     x: 1600, y: 1100 },

  // MID FOREST (Y: 1200-1500) — moderate risk
  { type: 'red_mushroom',  x: 600,  y: 1250 },
  { type: 'red_mushroom',  x: 1800, y: 1350 },
  { type: 'red_mushroom',  x: 2600, y: 1280 },
  { type: 'blue_flower',   x: 300,  y: 1400 },
  { type: 'blue_flower',   x: 2900, y: 1350 },
  { type: 'golden_wheat',  x: 1200, y: 1280 },
  { type: 'golden_wheat',  x: 2100, y: 1400 },
  { type: 'golden_wheat',  x: 900,  y: 1450 },

  // DEEP FOREST (Y: 1600+) — high risk, best seeds
  { type: 'glowshroom',    x: 700,  y: 1700 },
  { type: 'glowshroom',    x: 2500, y: 1800 },
  { type: 'red_mushroom',  x: 1400, y: 1650 },
  { type: 'blue_flower',   x: 1900, y: 2000 },
];
```

Update enemy spawn positions to match:
- Green slimes: meadow and mid-forest only
- Dark slimes: mid-forest and deep forest
- Skeletons: deep forest only, patrol between fixed waypoints there

---

## Feature 7 — Minimap (Simple)

With a larger, more complex world, the player needs navigation context.
Add a simple minimap in the top-right corner of the HUD.

```javascript
// In UIScene, create minimap
createMinimap() {
  const MAP_W = 120;
  const MAP_H = 90;
  const MAP_X = VIRTUAL_WIDTH - MAP_W - 16;
  const MAP_Y = 16;
  const SCALE_X = MAP_W / WORLD_WIDTH;
  const SCALE_Y = MAP_H / WORLD_HEIGHT;

  // Background
  this.minimapBg = this.add.rectangle(MAP_X, MAP_Y, MAP_W, MAP_H, 0x000000, 0.6)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(50);

  // Zone color bands
  this.add.rectangle(MAP_X, MAP_Y, MAP_W, GARDEN_ZONE_HEIGHT * SCALE_Y, 0x5a8f3c, 0.8)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(51);
  this.add.rectangle(MAP_X, MAP_Y + GARDEN_ZONE_HEIGHT * SCALE_Y, MAP_W, 400 * SCALE_Y, 0x4a7a30, 0.8)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(51);
  this.add.rectangle(MAP_X, MAP_Y + 1200 * SCALE_Y, MAP_W, 300 * SCALE_Y, 0x2d5a1a, 0.8)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(51);
  this.add.rectangle(MAP_X, MAP_Y + RIVER_Y * SCALE_Y, MAP_W, 80 * SCALE_Y, 0x2255aa, 0.8)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(51);
  this.add.rectangle(MAP_X, MAP_Y + DEEP_FOREST_START * SCALE_Y, MAP_W, (WORLD_HEIGHT - DEEP_FOREST_START) * SCALE_Y, 0x1a3a0a, 0.8)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(51);

  // Player dot — updates every frame
  this.minimapPlayer = this.add.circle(MAP_X, MAP_Y, 3, 0x00ffff)
    .setScrollFactor(0).setDepth(52);

  // Border
  this.add.rectangle(MAP_X, MAP_Y, MAP_W, MAP_H, 0xffffff, 0)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(52)
    .setStrokeStyle(1, 0x888888);

  this.minimapScaleX = SCALE_X;
  this.minimapScaleY = SCALE_Y;
  this.minimapX = MAP_X;
  this.minimapY = MAP_Y;
}
```

Update minimap player dot position via EventBus — GameScene emits
`'player:moved'` `{ x, y }` every 500ms (not every frame — throttle it):

```javascript
// In UIScene update or on player:moved event:
EventBus.on('player:moved', ({ x, y }) => {
  this.minimapPlayer.setPosition(
    this.minimapX + x * this.minimapScaleX,
    this.minimapY + y * this.minimapScaleY
  );
});
```

Add a `M` key toggle to show/hide minimap. Default: visible.

---

## Deliverables Checklist

```
[ ] Planting picker shows when player has 2+ different seeds near empty bed
[ ] Picker shows plant name, color, and grow days for each seed
[ ] Number keys 1-N select which seed to plant
[ ] Single seed auto-plants without showing picker
[ ] Cancel/ESC closes picker without planting
[ ] World has 5 distinct visual zones (garden/meadow/mid-forest/river/deep)
[ ] River blocks movement except at bridge crossing
[ ] Bridge is visually distinct from river
[ ] Player can cross river only at bridge position
[ ] Enemies cannot cross river (also blocked)
[ ] Tree rows visible in mid-forest and deep forest
[ ] Tree row colliders block player movement
[ ] Each tree row has at least 2 navigable gaps
[ ] Signs and signpost have collision — player walks around them
[ ] Rock formations in all forest zones have collision
[ ] Seeds repositioned to correct geographic biome zones
[ ] Green herb and sunflower near meadow entrance
[ ] Glowshroom only in deep forest
[ ] Green slimes only in meadow and mid-forest
[ ] Skeletons only in deep forest
[ ] Minimap visible in top-right corner
[ ] Minimap shows player position updating as you move
[ ] M key toggles minimap
[ ] All prior systems functional — zero regressions
[ ] npm run dev — zero console errors

git checkout dev
git merge feature/sprint-10c-world-collision
git push origin dev
```

Commit: `feat: sprint-10c world zones river bridge tree barriers planting picker minimap`
