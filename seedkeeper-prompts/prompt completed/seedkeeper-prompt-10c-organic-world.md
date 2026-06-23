# Seedkeeper — Sprint 10c Revised: Organic World Design

**What this replaces:** The straight-line biome delineation from Sprint 10c.
This sprint builds an organic, natural-feeling world with irregular biome
boundaries, a winding river that forks into two creeks, multiple bridges,
and three pockets of deep forest at the bottom of the map.

**The world should feel like a real forest — not a grid.**

**Depends on:** Fix/planting-zoom-settings merged to dev first.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-10c-organic-world
```

---

## World Design Philosophy

Do not use horizontal rectangle zones. Instead, use a point-based system
where each geographic feature is defined by a polygon or a set of influence
points. The biome at any given coordinate is determined by which zone's
influence points are closest.

This produces organic, irregular boundaries that look hand-crafted.

---

## Zone Architecture — Influence Point System

```javascript
// src/systems/WorldZoneSystem.js
export default class WorldZoneSystem {
  constructor(gameData) {
    // Each zone defined by center points and radius of influence
    // Multiple points per zone = irregular shape
    this.zones = {
      meadow: [
        { x: 800,  y: 1000, r: 350 },
        { x: 2400, y: 900,  r: 300 },
        { x: 1600, y: 1150, r: 250 },
        { x: 500,  y: 1300, r: 200 },  // isolated meadow pocket left
        { x: 2700, y: 1400, r: 220 },  // isolated meadow pocket right
      ],
      mid_forest: [
        { x: 1600, y: 1300, r: 400 },
        { x: 800,  y: 1500, r: 300 },
        { x: 2400, y: 1500, r: 300 },
        { x: 1200, y: 1700, r: 250 },
        { x: 2000, y: 1700, r: 250 },
      ],
      deep_forest: [
        // Three pockets — bottom-left, bottom-center, bottom-right
        { x: 500,  y: 2100, r: 400 },  // bottom-left pocket
        { x: 1600, y: 2200, r: 350 },  // bottom-center pocket
        { x: 2700, y: 2100, r: 400 },  // bottom-right pocket
        { x: 400,  y: 1900, r: 250 },  // upper reach of left pocket
        { x: 2800, y: 1900, r: 250 },  // upper reach of right pocket
      ]
    };
  }

  // Returns zone name for any world position
  getZoneAt(x, y) {
    if (y < GARDEN_ZONE_HEIGHT) return 'garden';

    let closestZone = 'mid_forest'; // default
    let closestDist = Infinity;

    for (const [zoneName, points] of Object.entries(this.zones)) {
      for (const point of points) {
        const dist = Math.hypot(x - point.x, y - point.y);
        const normalizedDist = dist / point.r;
        if (normalizedDist < closestDist) {
          closestDist = normalizedDist;
          closestZone = zoneName;
        }
      }
    }
    return closestZone;
  }

  // Returns color for zone (used for placeholder background)
  getZoneColor(zoneName) {
    const colors = {
      garden:      0x5a8f3c,
      meadow:      0x4a7a30,
      mid_forest:  0x2d5a1a,
      deep_forest: 0x1a3a0a,
      river:       0x2255aa
    };
    return colors[zoneName] || 0x2d5a1a;
  }
}
```

## World Background Rendering

Replace solid rectangle zones with a pixel-sampled background that produces
organic zone blending:

```javascript
createOrganicBackground(scene, worldZoneSystem) {
  // Sample the world at 64px intervals and draw colored rectangles
  // This creates a pixelated but organic-looking zone map
  const SAMPLE_SIZE = 64;

  for (let x = 0; x < WORLD_WIDTH; x += SAMPLE_SIZE) {
    for (let y = GARDEN_ZONE_HEIGHT; y < WORLD_HEIGHT; y += SAMPLE_SIZE) {
      const zone = worldZoneSystem.getZoneAt(x + SAMPLE_SIZE/2, y + SAMPLE_SIZE/2);

      // Check if near river
      const nearRiver = this.isNearRiver(x, y, scene.riverPath);

      const color = nearRiver
        ? 0x2255aa
        : worldZoneSystem.getZoneColor(zone);

      scene.add.rectangle(x, y, SAMPLE_SIZE, SAMPLE_SIZE, color)
        .setOrigin(0, 0).setDepth(0);
    }
  }

  // Garden stays solid
  scene.add.rectangle(0, 0, WORLD_WIDTH, GARDEN_ZONE_HEIGHT, 0x5a8f3c)
    .setOrigin(0, 0).setDepth(0);
}
```

---

## River System — Winding Path with Fork

The river is defined as a polyline path, not a rectangle.
It winds across the map, forks into two creeks, with bridges at each crossing.

### River Path Definition

```javascript
defineRiverSystem() {
  // Main river path — defined as control points for a curved path
  // Winds from left to right across the mid-section of the map
  this.mainRiverPath = [
    { x: 0,          y: 1480 },   // enters from left edge
    { x: 400,        y: 1520 },   // curves down-right
    { x: 700,        y: 1490 },   // curves back up
    { x: 950,        y: 1550 },   // FORK POINT — main river continues right
    //                              second fork splits off here going down-left
    { x: 1300,       y: 1500 },
    { x: 1600,       y: 1530 },   // main bridge crossing point
    { x: 1900,       y: 1480 },
    { x: 2200,       y: 1550 },
    { x: 2500,       y: 1510 },
    { x: 2750,       y: 1560 },
    { x: 3200,       y: 1490 },   // exits to right edge
  ];

  // Left creek — forks from main river at x:950 y:1550
  // Winds down toward bottom-left deep forest pocket
  this.leftCreekPath = [
    { x: 950,  y: 1550 },   // fork origin
    { x: 800,  y: 1650 },
    { x: 650,  y: 1750 },
    { x: 500,  y: 1820 },
    { x: 350,  y: 1900 },   // left creek bridge point
    { x: 200,  y: 2000 },
    { x: 100,  y: 2100 },   // flows into left deep forest
  ];

  // Right creek — branches off main river at x:2200 y:1550
  // Winds toward bottom-right deep forest pocket
  this.rightCreekPath = [
    { x: 2200, y: 1550 },   // branch origin
    { x: 2350, y: 1650 },
    { x: 2500, y: 1780 },
    { x: 2650, y: 1870 },   // right creek bridge point
    { x: 2800, y: 1950 },
    { x: 2950, y: 2050 },   // flows into right deep forest
  ];

  // Bridge positions
  this.bridges = [
    { x: 1600, y: 1515, angle: 5,   width: 120, label: 'main' },
    { x: 350,  y: 1900, angle: -30, width: 80,  label: 'left-creek' },
    { x: 2650, y: 1870, angle: 30,  width: 80,  label: 'right-creek' },
  ];
}
```

### River Rendering

Draw each river path as a series of wide overlapping circles to create
a natural-looking curved water band:

```javascript
renderRiver(scene) {
  const RIVER_WIDTH = 80;  // main river width
  const CREEK_WIDTH = 48;  // creek width

  const drawPath = (path, width, color) => {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16);
      for (let t = 0; t <= steps; t++) {
        const px = Phaser.Math.Linear(a.x, b.x, t / steps);
        const py = Phaser.Math.Linear(a.y, b.y, t / steps);
        scene.add.circle(px, py, width / 2, color).setDepth(1);
      }
    }
  };

  drawPath(this.mainRiverPath,  RIVER_WIDTH, 0x2255aa);
  drawPath(this.leftCreekPath,  CREEK_WIDTH, 0x3366bb);
  drawPath(this.rightCreekPath, CREEK_WIDTH, 0x3366bb);

  // Render bridges on top
  this.bridges.forEach(bridge => {
    scene.add.rectangle(bridge.x, bridge.y, bridge.width, 48, 0x8b6914)
      .setDepth(2).setAngle(bridge.angle);
  });
}
```

### River Collision — Polygon-Based

Create static physics bodies that follow the river path, leaving gaps only
at bridge positions:

```javascript
createRiverCollision(scene) {
  this.riverColliders = scene.physics.add.staticGroup();

  const addSegmentCollider = (x1, y1, x2, y2, width) => {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    const body = this.riverColliders.create(cx, cy, null);
    body.setSize(len, width).setAngle(Phaser.Math.RadToDeg(angle));
    body.refreshBody().setVisible(false);
  };

  // Add colliders for each river segment
  // Skip segments near bridges
  const addPathColliders = (path, width) => {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;

      // Check if this segment overlaps a bridge
      const nearBridge = this.bridges.some(bridge =>
        Math.hypot(midX - bridge.x, midY - bridge.y) < bridge.width
      );

      if (!nearBridge) {
        addSegmentCollider(a.x, a.y, b.x, b.y, width - 16);
      }
    }
  };

  addPathColliders(this.mainRiverPath,  80);
  addPathColliders(this.leftCreekPath,  48);
  addPathColliders(this.rightCreekPath, 48);

  scene.physics.add.collider(scene.player, this.riverColliders);
  scene.physics.add.collider(scene.enemies, this.riverColliders);
}

isNearRiver(x, y, paths) {
  const allPaths = [
    ...(paths?.mainRiverPath || []),
    ...(paths?.leftCreekPath || []),
    ...(paths?.rightCreekPath || [])
  ];
  return allPaths.some(p => Math.hypot(x - p.x, y - p.y) < 60);
}
```

---

## Tree Distribution — Organic Clusters

Replace straight tree rows with organic cluster placement:

```javascript
createOrganicTrees(scene, worldZoneSystem) {
  this.treeColliders = scene.physics.add.staticGroup();

  // Tree clusters — each cluster has a center, density, and radius
  const TREE_CLUSTERS = [
    // Meadow border clusters (sparse, no collision — decorative)
    { x: 300,  y: 1050, r: 150, density: 0.3, collide: false },
    { x: 2800, y: 950,  r: 120, density: 0.3, collide: false },
    { x: 1100, y: 1200, r: 100, density: 0.25, collide: false },

    // Mid-forest tree barriers (denser, with collision)
    { x: 600,  y: 1350, r: 180, density: 0.6, collide: true },
    { x: 1300, y: 1400, r: 160, density: 0.55, collide: true },
    { x: 2000, y: 1350, r: 170, density: 0.6, collide: true },
    { x: 2600, y: 1420, r: 150, density: 0.5, collide: true },

    // Deep forest pockets (very dense)
    { x: 500,  y: 2000, r: 300, density: 0.8, collide: true },
    { x: 1600, y: 2100, r: 280, density: 0.75, collide: true },
    { x: 2700, y: 2000, r: 300, density: 0.8, collide: true },

    // Scattered individual trees between clusters
    { x: 900,  y: 1600, r: 80,  density: 0.4, collide: true },
    { x: 1900, y: 1600, r: 80,  density: 0.4, collide: true },
    { x: 1200, y: 1900, r: 100, density: 0.5, collide: true },
    { x: 2100, y: 1900, r: 100, density: 0.5, collide: true },
  ];

  // Poisson-disk-like placement within each cluster
  TREE_CLUSTERS.forEach(cluster => {
    const treeCount = Math.floor(Math.PI * cluster.r * cluster.r * cluster.density / 2000);

    for (let i = 0; i < treeCount; i++) {
      // Random position within cluster radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * cluster.r; // sqrt for uniform distribution
      const tx = cluster.x + Math.cos(angle) * dist;
      const ty = cluster.y + Math.sin(angle) * dist;

      // Don't place trees in river
      if (this.isNearRiver(tx, ty)) continue;
      // Don't place trees in garden
      if (ty < GARDEN_ZONE_HEIGHT + 50) continue;

      // Tree visual
      const treeHeight = 28 + Math.random() * 12;
      scene.add.rectangle(tx, ty, 18, treeHeight, 0x1a4a0a)
        .setDepth(3);
      // Canopy
      scene.add.circle(tx, ty - treeHeight/2, 16 + Math.random() * 8, 0x2a6a1a)
        .setDepth(3);

      if (cluster.collide) {
        const trunk = this.treeColliders.create(tx, ty + 4, null);
        trunk.setSize(14, 12).refreshBody().setVisible(false);
      }
    }
  });

  scene.physics.add.collider(scene.player, this.treeColliders);
  scene.physics.add.collider(scene.enemies, this.treeColliders);
}
```

---

## Seed Repositioning to Organic Zones

Seeds should now be placed to match the organic zone layout:

```javascript
const SEED_POSITIONS = [
  // Meadow pockets (easy reach, entrance seeds)
  { type: 'green_herb',   x: 700,  y: 1050 },
  { type: 'green_herb',   x: 2500, y: 950  },
  { type: 'sunflower',    x: 1500, y: 1100 },
  { type: 'sunflower',    x: 400,  y: 1280 },
  { type: 'sunflower',    x: 2750, y: 1350 },

  // Mid forest (moderate risk)
  { type: 'red_mushroom', x: 600,  y: 1400 },
  { type: 'red_mushroom', x: 2000, y: 1380 },
  { type: 'red_mushroom', x: 1400, y: 1450 },
  { type: 'blue_flower',  x: 250,  y: 1480 },  // near left creek
  { type: 'blue_flower',  x: 2950, y: 1460 },  // near right bank
  { type: 'golden_wheat', x: 1100, y: 1350 },
  { type: 'golden_wheat', x: 2200, y: 1400 },

  // Deep forest pockets (high risk)
  { type: 'glowshroom',   x: 450,  y: 2050 },  // left pocket
  { type: 'glowshroom',   x: 1650, y: 2150 },  // center pocket
  { type: 'glowshroom',   x: 2750, y: 2000 },  // right pocket
  { type: 'red_mushroom', x: 1200, y: 1900 },
  { type: 'blue_flower',  x: 2100, y: 1950 },
];
```

---

## Enemy Spawn Zones Using WorldZoneSystem

Update enemy spawning to respect organic zones:

```javascript
spawnEnemiesForDay(dayNumber) {
  const greenSlimeCount = Math.min(4 + Math.floor(dayNumber * 0.5), 10);
  const darkSlimeCount  = dayNumber >= 3 ? Math.min(Math.floor((dayNumber - 2) / 2), 4) : 0;
  const skeletonCount   = dayNumber >= 5 ? 1 : 0;

  // Spawn green slimes in meadow and mid-forest
  for (let i = 0; i < greenSlimeCount; i++) {
    const pos = this.getSpawnPositionInZone(['meadow', 'mid_forest']);
    this.spawnSlime('green_slime', pos.x, pos.y);
  }

  // Spawn dark slimes in mid-forest
  for (let i = 0; i < darkSlimeCount; i++) {
    const pos = this.getSpawnPositionInZone(['mid_forest']);
    this.spawnSlime('dark_slime', pos.x, pos.y);
  }

  // Spawn skeletons in deep forest pockets
  for (let i = 0; i < skeletonCount; i++) {
    const pos = this.getSpawnPositionInZone(['deep_forest']);
    this.spawnSkeleton(pos.x, pos.y);
  }
}

getSpawnPositionInZone(zoneNames) {
  // Try random positions until one lands in the right zone
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = 100 + Math.random() * (WORLD_WIDTH - 200);
    const y = GARDEN_ZONE_HEIGHT + 100 + Math.random() * (WORLD_HEIGHT - GARDEN_ZONE_HEIGHT - 200);
    const zone = this.worldZoneSystem.getZoneAt(x, y);
    if (zoneNames.includes(zone) && !this.isNearRiver(x, y)) {
      return { x, y };
    }
  }
  // Fallback if no valid position found
  return { x: WORLD_WIDTH / 2, y: GARDEN_ZONE_HEIGHT + 400 };
}
```

---

## Minimap Update for Organic World

The minimap from 10c needs updating to show the organic layout.
Instead of horizontal color bands, sample the WorldZoneSystem:

```javascript
createMinimap() {
  const MAP_W = 120;
  const MAP_H = 90;
  const SAMPLE = 8; // sample every 8 minimap pixels

  const graphics = scene.add.graphics().setScrollFactor(0).setDepth(50);

  const scaleX = MAP_W / WORLD_WIDTH;
  const scaleY = MAP_H / WORLD_HEIGHT;
  const MAP_X = VIRTUAL_WIDTH - MAP_W - 16;
  const MAP_Y = 16;

  // Draw sampled zone colors
  for (let mx = 0; mx < MAP_W; mx += SAMPLE) {
    for (let my = 0; my < MAP_H; my += SAMPLE) {
      const wx = mx / scaleX;
      const wy = my / scaleY;
      const zone = this.worldZoneSystem.getZoneAt(wx, wy);
      const nearRiver = this.isNearRiver(wx, wy);
      const color = nearRiver ? 0x2255aa : this.worldZoneSystem.getZoneColor(zone);

      graphics.fillStyle(color, 0.85);
      graphics.fillRect(MAP_X + mx, MAP_Y + my, SAMPLE, SAMPLE);
    }
  }

  // Border
  graphics.lineStyle(1, 0x888888, 1);
  graphics.strokeRect(MAP_X, MAP_Y, MAP_W, MAP_H);

  // Player dot
  this.minimapPlayer = scene.add.circle(MAP_X, MAP_Y, 3, 0x00ffff)
    .setScrollFactor(0).setDepth(52);
}
```

---

## Deliverables Checklist

```
[ ] World has organic zone boundaries — no straight horizontal lines
[ ] Meadow areas feel open and distinct from forest
[ ] Two isolated meadow pockets visible (left side and right side)
[ ] Main river winds across map with natural curves
[ ] River forks at one point into two creeks
[ ] Three bridges — one main, one per creek
[ ] Player cannot cross river except at bridges
[ ] Enemies cannot cross river except at bridges
[ ] Three deep forest pockets — bottom-left, bottom-center, bottom-right
[ ] Deep forest visually darker than mid-forest
[ ] Trees placed in organic clusters not straight rows
[ ] Tree clusters denser in deep forest pockets
[ ] Trees have collision — player routes around them
[ ] Tree clusters have navigable gaps — not impassable walls
[ ] Seeds positioned in correct organic biome zones
[ ] Glowshroom only in deep forest pockets
[ ] Green herb and sunflower near meadow zones
[ ] Green slimes spawn in meadow and mid-forest
[ ] Skeletons spawn only in deep forest pockets
[ ] Minimap reflects organic zone layout
[ ] Player dot on minimap tracks correctly
[ ] All prior collision systems still working
[ ] npm run dev — zero console errors

git checkout dev
git merge feature/sprint-10c-organic-world
git push origin dev
```

Commit: `feat: sprint-10c organic world river fork creek bridges deep forest pockets`
