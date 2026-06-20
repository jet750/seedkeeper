# Seedkeeper — Sprint 10d: Real Tileset Art Integration

**What this sprint produces:** All placeholder colored rectangles replaced
with real Sprout Lands sprite art. Garden gets grass tiles. Forest gets
darker grass. River gets water tiles. Trees, props, mushrooms, flowers
scattered throughout. Bridge sprites at crossing points. Farming plants
on garden beds. Fence gate animation at garden exits. Work station as
chest visual. This is the sprint that makes it look like a real game.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-10d-tileset-art
```

---

## Step 1 — Copy All Asset Files

Copy all files to `C:\dev\seedkeeper\assets\images\` keeping exact filenames:

```powershell
$src = "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack"
$dst = "C:\dev\seedkeeper\assets\images"

Copy-Item "$src\Tilesets\ground tiles\New tiles\Grass_tiles_v2.png"        "$dst\Grass_tiles_v2.png" -Force
Copy-Item "$src\Tilesets\ground tiles\New tiles\Darker_Grass_Tiles_v2.png" "$dst\Darker_Grass_Tiles_v2.png" -Force
Copy-Item "$src\Tilesets\ground tiles\Soil Ground Tiles.png"               "$dst\Soil_Ground_Tiles.png" -Force
Copy-Item "$src\Tilesets\ground tiles\Darker Soil Ground Tiles.png"        "$dst\Darker_Soil_Ground_Tiles.png" -Force
Copy-Item "$src\Tilesets\ground tiles\Stone Ground Tiles.png"              "$dst\Stone_Ground_Tiles.png" -Force
Copy-Item "$src\Tilesets\Water.png"                                        "$dst\Water.png" -Force
Copy-Item "$src\Objects\Water Objects.png"                                 "$dst\Water_Objects.png" -Force
Copy-Item "$src\Objects\Trees, stumps and bushes.png"                      "$dst\Trees__stumps_and_bushes.png" -Force
Copy-Item "$src\Objects\Mushrooms, Flowers, Stones.png"                    "$dst\Mushrooms__Flowers__Stones.png" -Force
Copy-Item "$src\Objects\Farming Plants.png"                                "$dst\Farming_Plants.png" -Force
Copy-Item "$src\Tilesets\Building parts\Fences.png"                       "$dst\Fences.png" -Force
Copy-Item "$src\Tilesets\Building parts\Fence gates animation sprites .png" "$dst\Fence_gates_animation_sprites_.png" -Force
Copy-Item "$src\Objects\Wooden Bridge.png"                                 "$dst\Wooden_Bridge.png" -Force
Copy-Item "$src\Objects\Wooden Bridge v2.png"                              "$dst\Wooden_Bridge_v2.png" -Force
Copy-Item "$src\Objects\work station.png"                                  "$dst\work_station.png" -Force
Copy-Item "$src\Objects\Bush Tiles.png"                                    "$dst\Bush_Tiles.png" -Force
Copy-Item "$src\Tilesets\Paths.png"                                        "$dst\Paths.png" -Force

echo "All tileset files copied"
```

---

## Verified Sheet Dimensions (measured from actual files)

```
Grass_tiles_v2.png         176x112px — 16px tiles — 11 cols x 7 rows
Darker_Grass_Tiles_v2.png  176x112px — 16px tiles — 11 cols x 7 rows
Soil_Ground_Tiles.png      176x112px — 16px tiles — 11 cols x 7 rows
Darker_Soil_Ground_Tiles.png 176x112px — 16px tiles — 11 cols x 7 rows
Stone_Ground_Tiles.png     176x112px — 16px tiles — 11 cols x 7 rows
Water.png                  64x16px   — 16px tiles — 4 cols x 1 row
Water_Objects.png          192x32px  — 16px tiles — 12 cols x 2 rows
Trees__stumps_and_bushes.png 192x112px — 16px tiles — 12 cols x 7 rows
Mushrooms__Flowers__Stones.png 192x80px — 16px tiles — 12 cols x 5 rows
Farming_Plants.png         80x240px  — 16px tiles — 5 cols x 15 rows
Fences.png                 128x64px  — 16px tiles — 8 cols x 4 rows
Fence_gates_animation_sprites_.png 160x48px — 16px tiles — 10 cols x 3 rows
Wooden_Bridge.png          80x48px   — 16px tiles — 5 cols x 3 rows
Wooden_Bridge_v2.png       64x48px   — 16px tiles — 4 cols x 3 rows
work_station.png           32x32px   — single 32x32 sprite
Bush_Tiles.png             176x176px — 16px tiles — 11 cols x 11 rows
Paths.png                  64x64px   — 16px tiles — 4 cols x 4 rows
```

---

## Step 2 — Load All Assets in BootScene

```javascript
// Ground tilesets
this.load.spritesheet('grass_tiles',        './assets/images/Grass_tiles_v2.png',         { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('dark_grass_tiles',   './assets/images/Darker_Grass_Tiles_v2.png',  { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('soil_tiles',         './assets/images/Soil_Ground_Tiles.png',       { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('dark_soil_tiles',    './assets/images/Darker_Soil_Ground_Tiles.png',{ frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('stone_tiles',        './assets/images/Stone_Ground_Tiles.png',      { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('water_tiles',        './assets/images/Water.png',                   { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('water_objects',      './assets/images/Water_Objects.png',           { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('trees',              './assets/images/Trees__stumps_and_bushes.png',{ frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('mushrooms_flowers',  './assets/images/Mushrooms__Flowers__Stones.png',{ frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('farming_plants',     './assets/images/Farming_Plants.png',          { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('fences',             './assets/images/Fences.png',                  { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('fence_gates',        './assets/images/Fence_gates_animation_sprites_.png', { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('bridge',             './assets/images/Wooden_Bridge.png',           { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('bridge_v2',          './assets/images/Wooden_Bridge_v2.png',        { frameWidth: 16, frameHeight: 16 });
this.load.spritesheet('bush_tiles',         './assets/images/Bush_Tiles.png',              { frameWidth: 16, frameHeight: 16 });
this.load.image('work_station',             './assets/images/work_station.png');
```

---

## Step 3 — Frame Index Reference

All frame indices are zero-based, counted left-to-right then top-to-bottom.

### Grass_tiles_v2.png (11 cols x 7 rows = 77 frames)
```
Frame 0  = top-left corner piece (rounded corner, light grass)
Frame 1  = top edge
Frame 2  = top-right corner
Frame 4  = left edge
Frame 5  = CENTER FILL — main grass tile, use this for garden ground
Frame 6  = right edge
Frame 8  = bottom-left corner
Frame 9  = bottom edge
Frame 10 = bottom-right corner
Frame 11 = isolated rounded square variant
Frame 44 = plain flat grass — use as primary fill tile
Frame 55 = grass with subtle texture variation 1
Frame 66 = grass with subtle texture variation 2
```
**Primary garden ground tile: frame 44 (plain flat center)**
**Border/edge tiles: frames 0-10 for corners and edges**

### Darker_Grass_Tiles_v2.png (11 cols x 7 rows = 77 frames)
Same layout as Grass_tiles_v2 but darker/cooler palette.
```
Frame 44 = primary forest ground fill
Frame 5  = forest center with texture
```
**Primary forest ground tile: frame 44**
**Deep forest: use frame 5 (darker texture)**

### Water.png (4 cols x 1 row = 4 frames)
```
Frame 0 = water tile variant 1 (use as animated water — cycle 0,1,2,3)
Frame 1 = water tile variant 2
Frame 2 = water tile variant 3
Frame 3 = water tile variant 4
```
**Animate river: cycle frames 0→1→2→3 at 4fps**

### Water_Objects.png (12 cols x 2 rows = 24 frames)
```
Row 0 (frames 0-11):  water lily, pond objects, water edge decorations
Row 1 (frames 12-23): additional water decorations, reeds, ripples
Frame 0  = small water lily
Frame 1  = medium water lily
Frame 4  = reed/plant in water
Frame 6  = water ripple decoration
```
**Use frames 0-6 scattered along river banks**

### Trees__stumps_and_bushes.png (12 cols x 7 rows = 84 frames)
```
Row 0 (frames 0-11):   full trees — large canopy variants
  Frame 0  = round green tree (main forest tree)
  Frame 1  = round green tree variant 2
  Frame 2  = apple tree with fruit
  Frame 3  = tree variant 3
  Frame 4  = bare/autumn tree
  Frame 6  = bush large
  Frame 7  = bush small

Row 2 (frames 24-35):  tree trunks and stumps
  Frame 24 = tree trunk base (use under canopy)
  Frame 25 = stump
  Frame 26 = stump with mushroom

Row 4 (frames 48-59):  small trees and saplings
  Frame 48 = small tree
  Frame 49 = sapling

Row 6 (frames 72-83):  logs and fallen trees
  Frame 72 = fallen log left
  Frame 73 = fallen log right
  Frame 74 = log pile
```
**Primary forest tree: frame 0 (large, at 32x32 display size)**
**Deep forest variant: frame 1**
**Stumps for decoration: frame 25**
**Fallen logs: frames 72-73**

### Mushrooms__Flowers__Stones.png (12 cols x 5 rows = 60 frames)
```
Row 0 (frames 0-11):   mushrooms
  Frame 0  = red mushroom (matches red_mushroom plant type!)
  Frame 1  = brown mushroom
  Frame 2  = purple/blue mushroom (matches glowshroom!)
  Frame 3  = mushroom cluster
  Frame 4  = small mushroom

Row 1 (frames 12-23):  flowers
  Frame 12 = blue flower (matches blue_flower plant type!)
  Frame 13 = pink flower
  Frame 14 = yellow flower (matches sunflower!)
  Frame 15 = white flower
  Frame 16 = flower cluster

Row 2 (frames 24-35):  stones and rocks
  Frame 24 = small stone
  Frame 25 = medium rock
  Frame 26 = large rock
  Frame 27 = rock cluster
  Frame 28 = crystal/gem stone

Row 3 (frames 36-47):  mixed small props
Row 4 (frames 48-59):  ground detail sprites
```
**IMPORTANT: Use plant-matching sprites near seed spawns:**
- Red mushroom seeds area → scatter frame 0 (red mushroom)
- Glowshroom area → scatter frame 2 (purple mushroom)
- Blue flower area → scatter frame 12 (blue flower)
- Sunflower area → scatter frame 14 (yellow flower)

### Farming_Plants.png (5 cols x 15 rows = 75 frames)
```
Each ROW = one growth stage sequence for a plant type
Each plant has 5 frames: empty soil → sprout → small → medium → full grown

Row 0  (frames 0-4):   Plant type 1 — wheat/grain
Row 1  (frames 5-9):   Plant type 1 watered variant
Row 2  (frames 10-14): Plant type 2 — leafy green
Row 3  (frames 15-19): Plant type 2 watered variant
Row 4  (frames 20-24): Plant type 3 — flower
Row 5  (frames 25-29): Plant type 3 watered variant
Row 6  (frames 30-34): Plant type 4 — mushroom
Row 7  (frames 35-39): Plant type 4 watered variant
Row 8  (frames 40-44): Plant type 5 — root vegetable
Row 9  (frames 45-49): Plant type 5 watered variant
Rows 10-14: additional plant types and variations

Growth stage frame offset within each row:
  Col 0 = just planted (soil only)
  Col 1 = sprout (tiny)
  Col 2 = small plant
  Col 3 = medium plant
  Col 4 = full grown / ready to harvest
```

**Map plant types to farming plant rows:**
```javascript
const PLANT_ROW_MAP = {
  golden_wheat:  0,   // row 0, frames 0-4
  green_herb:    2,   // row 2, frames 10-14
  blue_flower:   4,   // row 4, frames 20-24
  red_mushroom:  6,   // row 6, frames 30-34
  sunflower:     8,   // row 8, frames 40-44
  glowshroom:    10,  // row 10, frames 50-54
};

// Get frame for a plant at a growth stage (0=just planted, 4=ready)
function getFarmingPlantFrame(plantType, growthStage) {
  const row = PLANT_ROW_MAP[plantType] || 0;
  return (row * 5) + Math.min(growthStage, 4);
}

// Growth stage from daysRemaining:
function getGrowthStage(daysRemaining, totalDays) {
  if (daysRemaining <= 0) return 4; // ready
  const progress = 1 - (daysRemaining / totalDays);
  return Math.floor(progress * 4); // 0-3 growing stages
}
```

### Fences.png (8 cols x 4 rows = 32 frames)
```
Row 0 (frames 0-7):   horizontal fence pieces
  Frame 0 = horizontal fence segment (use for top/bottom garden fence)
  Frame 1 = horizontal fence end left
  Frame 2 = horizontal fence end right
Row 1 (frames 8-15):  vertical fence pieces
  Frame 8 = vertical fence segment (use for left/right garden fence)
Row 2 (frames 16-23): corner pieces
  Frame 16 = top-left corner
  Frame 17 = top-right corner
  Frame 18 = bottom-left corner
  Frame 19 = bottom-right corner
Row 3 (frames 24-31): fence post and gate variants
  Frame 24 = fence post
```

### Fence_gates_animation_sprites_.png (10 cols x 3 rows = 30 frames)
```
Row 0 (frames 0-9):   gate type 1 animation frames (open sequence)
  Frame 0 = gate closed
  Frame 1 = gate opening frame 1
  Frame 2 = gate opening frame 2
  Frame 3 = gate open
Row 1 (frames 10-19): gate type 2 animation
Row 2 (frames 20-29): gate type 3 / additional variants
```
**Gate open animation: frames 0→1→2→3 at 8fps**
**Gate close animation: frames 3→2→1→0 at 8fps**

### Wooden_Bridge.png (5 cols x 3 rows = 15 frames)
```
Row 0 (frames 0-4):  bridge top view — horizontal bridge
  Frame 0 = bridge left end
  Frame 1 = bridge middle segment (repeat for width)
  Frame 2 = bridge right end
Row 1 (frames 5-9):  bridge vertical orientation
  Frame 5 = bridge top end
  Frame 6 = bridge middle vertical
  Frame 7 = bridge bottom end
Row 2 (frames 10-14): bridge shadow/detail pieces
```
**Horizontal bridge across river: frame 0 + repeat frame 1 + frame 2**

### Wooden_Bridge_v2.png (4 cols x 3 rows = 12 frames)
```
Row 0 (frames 0-3):  wider bridge variant, horizontal
  Frame 0 = left end
  Frame 1 = middle (repeat)
  Frame 2 = right end
Row 1 (frames 4-7):  vertical variant
Row 2 (frames 8-11): detail pieces
```

---

## Step 4 — Ground Tile Layer

Replace all colored zone rectangles with tiled ground using `tileSprite`:

```javascript
createGroundLayers(scene) {
  // Full world base — darker grass as default outside garden
  scene.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'dark_grass_tiles', 44)
    .setOrigin(0, 0).setDepth(0);

  // Garden homestead — bright grass
  scene.add.tileSprite(GARDEN_X, GARDEN_Y, GARDEN_WIDTH, GARDEN_HEIGHT, 'grass_tiles', 44)
    .setOrigin(0, 0).setDepth(1);

  // Soil patches inside garden (where beds are)
  const BED_AREA_X = GARDEN_X + 60;
  const BED_AREA_Y = GARDEN_Y + 120;
  scene.add.tileSprite(BED_AREA_X, BED_AREA_Y, 200, 280, 'soil_tiles', 44)
    .setOrigin(0, 0).setDepth(2);

  // Deep forest areas — even darker ground
  // Use darker_grass frame 5 for deep forest pockets
  // These are approximated since Tiled map isn't built yet
  // Place dark ground patches at approximate deep forest coordinates
  const DEEP_FOREST_AREAS = [
    { x: 300,  y: 3800, w: 800,  h: 900 },
    { x: 2800, y: 3700, w: 800,  h: 1000 },
    { x: 5300, y: 3800, w: 800,  h: 900 },
  ];
  DEEP_FOREST_AREAS.forEach(area => {
    scene.add.tileSprite(area.x, area.y, area.w, area.h, 'dark_grass_tiles', 5)
      .setOrigin(0, 0).setDepth(1);
  });
}
```

---

## Step 5 — Garden Fence with Real Sprites

Replace invisible fence colliders with real fence sprites:

```javascript
createGardenFenceVisuals(scene) {
  const TILE = 16;

  // Top fence — horizontal, full width with gate gap in center
  const gateX = GARDEN_X + GARDEN_WIDTH / 2;
  const GATE_W = 64; // 4 tiles wide gate

  // Top fence left of gate
  for (let x = GARDEN_X; x < gateX - GATE_W/2; x += TILE) {
    scene.add.image(x + 8, GARDEN_Y, 'fences', 0).setDepth(4);
  }
  // Top fence right of gate
  for (let x = gateX + GATE_W/2; x < GARDEN_RIGHT; x += TILE) {
    scene.add.image(x + 8, GARDEN_Y, 'fences', 0).setDepth(4);
  }

  // Bottom fence same pattern
  for (let x = GARDEN_X; x < gateX - GATE_W/2; x += TILE) {
    scene.add.image(x + 8, GARDEN_BOTTOM, 'fences', 0).setDepth(4);
  }
  for (let x = gateX + GATE_W/2; x < GARDEN_RIGHT; x += TILE) {
    scene.add.image(x + 8, GARDEN_BOTTOM, 'fences', 0).setDepth(4);
  }

  // Left fence — vertical
  const gateY = GARDEN_Y + GARDEN_HEIGHT / 2;
  for (let y = GARDEN_Y; y < gateY - GATE_W/2; y += TILE) {
    scene.add.image(GARDEN_X, y + 8, 'fences', 8).setDepth(4);
  }
  for (let y = gateY + GATE_W/2; y < GARDEN_BOTTOM; y += TILE) {
    scene.add.image(GARDEN_X, y + 8, 'fences', 8).setDepth(4);
  }

  // Right fence — vertical
  for (let y = GARDEN_Y; y < gateY - GATE_W/2; y += TILE) {
    scene.add.image(GARDEN_RIGHT, y + 8, 'fences', 8).setDepth(4);
  }
  for (let y = gateY + GATE_W/2; y < GARDEN_BOTTOM; y += TILE) {
    scene.add.image(GARDEN_RIGHT, y + 8, 'fences', 8).setDepth(4);
  }

  // Corner pieces
  scene.add.image(GARDEN_X,     GARDEN_Y,      'fences', 16).setDepth(4);
  scene.add.image(GARDEN_RIGHT, GARDEN_Y,      'fences', 17).setDepth(4);
  scene.add.image(GARDEN_X,     GARDEN_BOTTOM, 'fences', 18).setDepth(4);
  scene.add.image(GARDEN_RIGHT, GARDEN_BOTTOM, 'fences', 19).setDepth(4);

  // Gate sprites at each opening — animated on zone change
  this.gateSprites = {
    top:    scene.add.sprite(gateX, GARDEN_Y,      'fence_gates', 0).setDepth(5),
    bottom: scene.add.sprite(gateX, GARDEN_BOTTOM, 'fence_gates', 0).setDepth(5),
    left:   scene.add.sprite(GARDEN_X, gateY,      'fence_gates', 0).setDepth(5),
    right:  scene.add.sprite(GARDEN_RIGHT, gateY,  'fence_gates', 0).setDepth(5),
  };

  // Gate animations
  scene.anims.create({
    key: 'gate_open',
    frames: scene.anims.generateFrameNumbers('fence_gates', { start: 0, end: 3 }),
    frameRate: 8, repeat: 0
  });
  scene.anims.create({
    key: 'gate_close',
    frames: scene.anims.generateFrameNumbers('fence_gates', { start: 3, end: 0 }),
    frameRate: 8, repeat: 0
  });
}
```

---

## Step 6 — River Water Tiles

Replace the circle-drawn river with animated water tiles along the river path:

```javascript
createRiverWaterTiles(scene) {
  // Animated water texture
  scene.anims.create({
    key: 'water_flow',
    frames: scene.anims.generateFrameNumbers('water_tiles', { start: 0, end: 3 }),
    frameRate: 4,
    repeat: -1
  });

  // Sample along river paths and place water tiles
  const placeWaterAlongPath = (path, width) => {
    const TILE = 16;
    const tilesAcross = Math.ceil(width / TILE);

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.ceil(dist / TILE);

      for (let t = 0; t <= steps; t++) {
        const px = Phaser.Math.Linear(a.x, b.x, t / steps);
        const py = Phaser.Math.Linear(a.y, b.y, t / steps);

        // Place a row of water tiles across the river width
        for (let w = -tilesAcross/2; w <= tilesAcross/2; w++) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const perpX = px + Math.cos(angle + Math.PI/2) * w * TILE;
          const perpY = py + Math.sin(angle + Math.PI/2) * w * TILE;

          const waterTile = scene.add.sprite(perpX, perpY, 'water_tiles', 0)
            .setDepth(2);
          waterTile.play('water_flow');
          // Offset animation start so tiles don't all animate in sync
          waterTile.anims.setCurrentFrame(
            waterTile.anims.currentAnim.frames[Math.floor(Math.random() * 4)]
          );
        }
      }
    }
  };

  // Apply to all river paths from the WorldZoneSystem
  placeWaterAlongPath(scene.mainRiverPath,  80);
  placeWaterAlongPath(scene.leftCreekPath,  48);
  placeWaterAlongPath(scene.rightCreekPath, 48);
}
```

---

## Step 7 — Bridge Sprites

Replace brown rectangle bridges with real wooden bridge sprites:

```javascript
placeBridgeSprites(scene) {
  scene.bridges.forEach(bridge => {
    const TILE = 16;
    const tilesWide = Math.ceil(bridge.width / TILE);

    // Place bridge tiles
    for (let i = 0; i < tilesWide; i++) {
      const isLeft  = i === 0;
      const isRight = i === tilesWide - 1;
      const frame   = isLeft ? 0 : isRight ? 2 : 1;
      const x = bridge.x - bridge.width/2 + i * TILE + 8;

      scene.add.image(x, bridge.y, 'bridge', frame)
        .setDepth(3)
        .setAngle(bridge.angle || 0);
    }
  });
}
```

---

## Step 8 — Tree Sprites

Replace rectangle tree placeholders with real tree sprites:

```javascript
placeTrees(scene) {
  // Re-run tree cluster generation but use real sprites
  // Access existing treeColliders positions and replace visuals

  // For each tree position already generated in createOrganicTrees():
  // Replace the rectangle visual with a tree sprite

  // Tree size selection by zone:
  const getTreeFrame = (x, y) => {
    const zone = scene.worldZoneSystem?.getZoneAt(x, y) || 'mid_forest';
    if (zone === 'deep_forest') return 1;  // darker tree variant
    if (zone === 'meadow')      return 6;  // bush/small tree
    return 0; // standard round green tree
  };

  // Destroy existing tree rectangle visuals
  // (they were created as scene.add.rectangle — need to track and destroy)
  // Then recreate at same positions using sprites:

  scene.treePositions.forEach(({ x, y }) => {
    const frame = getTreeFrame(x, y);
    // Tree canopy (32x32 display, using 2x2 tile area)
    scene.add.image(x, y - 8, 'trees', frame)
      .setScale(2)  // scale up from 16px to 32px display
      .setDepth(3 + (y / WORLD_HEIGHT) * 2); // depth by Y for overlap sorting
  });
}
```

**Note:** This requires GameScene to store tree positions in
`this.treePositions = []` during `createOrganicTrees()`. Add that array
population to the organic tree creation code if not already present.

---

## Step 9 — Mushroom, Flower and Stone Props

Replace scattered prop rectangles with real sprites:

```javascript
scatterProps(scene) {
  // Mushrooms near red_mushroom seed zones
  const MUSHROOM_POSITIONS = [
    { x: 600,  y: 1400 }, { x: 620, y: 1380 }, { x: 580, y: 1420 },
    { x: 2000, y: 1380 }, { x: 2020, y: 1400 }, { x: 1980, y: 1360 },
    { x: 1400, y: 1450 }, { x: 1420, y: 1430 },
    // Deep forest mushroom clusters
    { x: 500,  y: 2000 }, { x: 520,  y: 2020 }, { x: 480, y: 1980 },
    { x: 1650, y: 2100 }, { x: 1630, y: 2080 },
    { x: 2750, y: 2000 }, { x: 2770, y: 2020 },
  ];

  MUSHROOM_POSITIONS.forEach(({ x, y }) => {
    const frame = y > 1800 ? 2 : 0; // purple mushroom deep forest, red elsewhere
    scene.add.image(x, y, 'mushrooms_flowers', frame)
      .setDepth(3).setScale(1.5);
  });

  // Flowers near blue_flower and sunflower seed zones
  const FLOWER_POSITIONS = [
    { x: 250,  y: 1480, frame: 12 }, // blue flower — left bank
    { x: 270,  y: 1460, frame: 12 },
    { x: 2950, y: 1460, frame: 12 }, // blue flower — right bank
    { x: 1500, y: 1100, frame: 14 }, // sunflower — meadow
    { x: 1520, y: 1120, frame: 14 },
    { x: 400,  y: 1280, frame: 14 }, // sunflower — left meadow
    { x: 2750, y: 1350, frame: 14 }, // sunflower — right meadow
    // General meadow flowers
    { x: 800,  y: 950,  frame: 13 },
    { x: 900,  y: 1000, frame: 15 },
    { x: 2400, y: 900,  frame: 13 },
    { x: 2500, y: 980,  frame: 16 },
  ];

  FLOWER_POSITIONS.forEach(({ x, y, frame }) => {
    scene.add.image(x, y, 'mushrooms_flowers', frame)
      .setDepth(3).setScale(1.5);
  });

  // Rocks scattered throughout forest
  const ROCK_POSITIONS = [
    { x: 700,  y: 1250 }, { x: 720,  y: 1270 },
    { x: 1800, y: 1350 }, { x: 2200, y: 1400 },
    { x: 900,  y: 1600 }, { x: 1900, y: 1620 },
    { x: 400,  y: 1900 }, { x: 2800, y: 1950 },
  ];

  ROCK_POSITIONS.forEach(({ x, y }) => {
    const frame = 24 + Math.floor(Math.random() * 4); // frames 24-27
    scene.add.image(x, y, 'mushrooms_flowers', frame)
      .setDepth(3);
  });
}
```

---

## Step 10 — Farming Plants on Garden Beds

Update GardenBed.js to use real farming plant sprites:

```javascript
// In GardenBed.js
const PLANT_ROW_MAP = {
  golden_wheat: 0,
  green_herb:   2,
  blue_flower:  4,
  red_mushroom: 6,
  sunflower:    8,
  glowshroom:   10,
};

updateGrowthVisual() {
  if (!this.plantSprite) {
    this.plantSprite = this.scene.add.image(this.x, this.y - 8, 'farming_plants', 0)
      .setDepth(5).setScale(2);
  }

  if (this.state === 'EMPTY') {
    this.plantSprite.setVisible(false);
    return;
  }

  this.plantSprite.setVisible(true);
  const row = PLANT_ROW_MAP[this.plantType] || 0;
  const totalDays = this.scene.gameData.plants[this.plantType]?.growthDays || 1;

  let col;
  if (this.state === 'READY') {
    col = 4; // fully grown frame
  } else {
    const progress = 1 - (this.daysRemaining / totalDays);
    col = Math.min(Math.floor(progress * 4), 3);
  }

  const frame = (row * 5) + col;
  this.plantSprite.setFrame(frame);

  // Double harvest badge
  if (this.doubleHarvest) {
    if (!this.doubleBadge) {
      this.doubleBadge = this.scene.add.text(
        this.x + 12, this.y - 20, '×2',
        { fontSize: '10px', color: '#ffaa00', stroke: '#000', strokeThickness: 2 }
      ).setDepth(6);
    }
  } else if (this.doubleBadge) {
    this.doubleBadge.destroy();
    this.doubleBadge = null;
  }
}
```

---

## Step 11 — Work Station as Chest Visual

Replace chest rectangle with work_station sprite:

```javascript
// In GameScene, where chest is created:
this.chestSprite = this.add.image(CHEST_POS.x, CHEST_POS.y, 'work_station')
  .setScale(2).setDepth(4);

// Chest open animation (scale tween since work_station is single frame):
openChest() {
  this.scene.tweens.add({
    targets: this.chestSprite,
    scaleY: 1.6,
    duration: 150,
    yoyo: true,
    onComplete: () => {
      EventBus.emit('upgrade:opened');
      this.scene.scene.launch('UpgradeScene');
    }
  });
}
```

---

## Deliverables Checklist

```
[ ] All files copied to C:\dev\seedkeeper\assets\images\
[ ] All assets load in BootScene without 404 errors
[ ] Garden ground shows bright grass tiles not green rectangle
[ ] Forest ground shows darker grass tiles not dark rectangle
[ ] Deep forest pockets show darkest grass variant
[ ] River shows animated water tiles cycling at 4fps
[ ] Water tiles stagger animation start so they don't all sync
[ ] Bridges show wooden bridge sprites at all 3 crossing points
[ ] Garden fence shows real fence sprites on all 4 sides
[ ] Fence corners use corner pieces (frames 16-19)
[ ] Gate sprites visible at all 4 garden openings
[ ] Gates animate open/close on zone transition
[ ] Trees show real tree sprites not rectangles
[ ] Deep forest trees use darker variant (frame 1)
[ ] Mushrooms scattered near seed spawn zones
[ ] Purple mushrooms in deep forest glowshroom areas
[ ] Blue flowers near water/stream areas
[ ] Sunflowers in meadow zones
[ ] Rocks scattered throughout forest
[ ] Garden beds show farming plant sprites at correct growth stage
[ ] Tiny sprout on day 1, growing plant on day 2+, full plant when ready
[ ] Work station sprite visible as chest
[ ] All sprites scaled 2x to match camera zoom level
[ ] Depth sorting correct — player renders above all props and ground
[ ] npm run dev — zero console errors
[ ] No 404s in browser network tab for any asset
[ ] Game looks like a real pixel art game not placeholder geometry

git checkout dev
git merge feature/sprint-10d-tileset-art
git push origin dev
```

Commit: `feat: sprint-10d real tileset art grass water river bridge fence farming plants`
