// WorldZoneSystem.js
//
// Organic world layout (Sprint 10c revised). Replaces the old straight-line
// biome bands with an influence-point system: every forest coordinate belongs to
// whichever zone has the nearest influence point (distance normalised by that
// point's radius), so boundaries come out irregular and hand-crafted rather than
// gridded. It also owns the winding river — a main channel that forks into two
// creeks — plus the three bridge crossings.
//
// Pure data + geometry: it imports nothing from Phaser and holds no scene state,
// so GameScene (world build, collisions, spawns) and UIScene (minimap) can each
// construct their own identical copy and sample it the same way.

import { WORLD_WIDTH, WORLD_HEIGHT, GARDEN_ZONE_HEIGHT } from '../core/Constants.js';

const ZONE_COLORS = {
  garden: 0x5a8f3c,
  meadow: 0x4a7a30,
  mid_forest: 0x2d5a1a,
  deep_forest: 0x1a3a0a,
  river: 0x2255aa
};

// River channel widths (px). The "near river" test and the water render both key
// off these, so the visual band and the no-spawn band stay in lockstep.
export const RIVER_WIDTH = 80;
export const CREEK_WIDTH = 48;

export default class WorldZoneSystem {
  constructor() {
    // Each zone is a set of influence points {x, y, r}. More points (and bigger
    // radii) pull more territory toward that zone; overlapping reaches between
    // zones are where the irregular borders fall.
    this.zones = {
      meadow: [
        { x: 800, y: 1000, r: 350 },
        { x: 2400, y: 900, r: 300 },
        { x: 1600, y: 1150, r: 250 },
        { x: 500, y: 1300, r: 200 }, // isolated meadow pocket, left
        { x: 2700, y: 1400, r: 220 } // isolated meadow pocket, right
      ],
      mid_forest: [
        { x: 1600, y: 1300, r: 400 },
        { x: 800, y: 1500, r: 300 },
        { x: 2400, y: 1500, r: 300 },
        { x: 1200, y: 1700, r: 250 },
        { x: 2000, y: 1700, r: 250 }
      ],
      deep_forest: [
        // Three pockets across the bottom — left, center, right.
        { x: 500, y: 2100, r: 400 },
        { x: 1600, y: 2200, r: 350 },
        { x: 2700, y: 2100, r: 400 },
        { x: 400, y: 1900, r: 250 }, // upper reach of the left pocket
        { x: 2800, y: 1900, r: 250 } // upper reach of the right pocket
      ]
    };

    // Per-zone difficulty level (Sprint 5). The procedural world has none yet, so
    // this stays null and GameScene falls back to a distance-from-home gradient.
    // The hand-built LDtk world will populate this map (zoneName → level 1-5),
    // at which point getZoneLevelAt() starts returning it.
    this.zoneLevels = null;

    this.defineRiverSystem();
  }

  // The authored level for the zone at (x, y), or null when none is defined (the
  // procedural world). GameScene uses this when present, else a distance heuristic.
  getZoneLevelAt(x, y) {
    if (!this.zoneLevels) return null;
    const lvl = this.zoneLevels[this.getZoneAt(x, y)];
    return typeof lvl === 'number' ? lvl : null;
  }

  // --- River geometry -------------------------------------------------------
  // Each channel is a polyline of control points. The main river winds left→right
  // across the mid-section and forks: the left creek peels off near x:950 toward
  // the bottom-left deep-forest pocket, the right creek near x:2200 toward the
  // bottom-right pocket. Bridges sit at the three intended crossings.
  defineRiverSystem() {
    this.mainRiverPath = [
      { x: 0, y: 1480 }, // enters from the left edge
      { x: 400, y: 1520 },
      { x: 700, y: 1490 },
      { x: 950, y: 1550 }, // FORK — left creek splits off here
      { x: 1300, y: 1500 },
      { x: 1600, y: 1530 }, // main bridge crossing
      { x: 1900, y: 1480 },
      { x: 2200, y: 1550 }, // right creek branches off here
      { x: 2500, y: 1510 },
      { x: 2750, y: 1560 },
      { x: WORLD_WIDTH, y: 1490 } // exits to the right edge
    ];

    this.leftCreekPath = [
      { x: 950, y: 1550 }, // fork origin
      { x: 800, y: 1650 },
      { x: 650, y: 1750 },
      { x: 500, y: 1820 },
      { x: 350, y: 1900 }, // left creek bridge
      { x: 200, y: 2000 },
      { x: 100, y: 2100 } // flows into the left deep forest
    ];

    this.rightCreekPath = [
      { x: 2200, y: 1550 }, // branch origin
      { x: 2350, y: 1650 },
      { x: 2500, y: 1780 },
      { x: 2650, y: 1870 }, // right creek bridge
      { x: 2800, y: 1950 },
      { x: 2950, y: 2050 } // flows into the right deep forest
    ];

    // Crossings. `angle` orients the plank visual along the path; `span` is the
    // gap (px) opened in the river collision so the player/enemies can cross.
    this.bridges = [
      { x: 1600, y: 1530, angle: 6, length: 150, label: 'main', span: 150 },
      { x: 350, y: 1900, angle: -32, length: 96, label: 'left-creek', span: 110 },
      { x: 2650, y: 1870, angle: 32, length: 96, label: 'right-creek', span: 110 }
    ];

    // Width lookup so a single helper can walk any channel at the right scale.
    this._channels = [
      { path: this.mainRiverPath, width: RIVER_WIDTH },
      { path: this.leftCreekPath, width: CREEK_WIDTH },
      { path: this.rightCreekPath, width: CREEK_WIDTH }
    ];
  }

  get channels() {
    return this._channels;
  }

  // --- Zone lookup ----------------------------------------------------------

  // The biome at any world coordinate: garden above the fence line, otherwise the
  // zone whose nearest influence point has the smallest radius-normalised
  // distance. Normalising by r lets a small-radius pocket hold its ground next to
  // a large-radius neighbour.
  getZoneAt(x, y) {
    if (y < GARDEN_ZONE_HEIGHT) return 'garden';

    let closestZone = 'mid_forest';
    let closestDist = Infinity;
    for (const zoneName of Object.keys(this.zones)) {
      const points = this.zones[zoneName];
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const dist = Math.hypot(x - p.x, y - p.y) / p.r;
        if (dist < closestDist) {
          closestDist = dist;
          closestZone = zoneName;
        }
      }
    }
    return closestZone;
  }

  getZoneColor(zoneName) {
    return ZONE_COLORS[zoneName] ?? ZONE_COLORS.mid_forest;
  }

  // --- River proximity ------------------------------------------------------

  // True when (x, y) is within the water (plus `margin`) of any channel. Measured
  // against the line SEGMENTS, not just the sparse control points, so the gaps
  // between control points still read as river — important for keeping trees and
  // seeds out of the water and for colouring the minimap.
  isNearRiver(x, y, margin = 0) {
    for (let c = 0; c < this._channels.length; c++) {
      const { path, width } = this._channels[c];
      const reach = width / 2 + margin;
      for (let i = 0; i < path.length - 1; i++) {
        if (pointToSegmentDist(x, y, path[i], path[i + 1]) <= reach) return true;
      }
    }
    return false;
  }

  // True when (x, y) sits inside a bridge's crossing gap — used to keep the river
  // collision (and tree placement) clear of the crossings.
  isOnBridge(x, y) {
    for (let i = 0; i < this.bridges.length; i++) {
      const b = this.bridges[i];
      if (Math.hypot(x - b.x, y - b.y) <= b.span / 2 + 8) return true;
    }
    return false;
  }
}

// Shortest distance from point (px, py) to the segment a→b.
function pointToSegmentDist(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
