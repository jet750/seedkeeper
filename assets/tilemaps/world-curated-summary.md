# World B — "Curated"

**File:** `world-curated.tmx` (native Tiled) / `world-curated.json` (engine-loadable) · **Size:** 400x300 tiles (6400x4800 px) · **Tile:** 16px

## Design philosophy

This world is engineered for pacing and legibility. The homestead sits dead-center and safety radiates outward in clean rings: meadow, then light, mid and deep forest at the edges and corners. A player can orient instantly — distance from home equals danger — and the silhouette reads clearly on a minimap. Playability is prioritized over realism; the symmetry is intentional.

## River routing rationale

Two rivers (Northwater and Southwater) run as horizontal bands across the upper and lower thirds, framing the play space. Each sheds creeks that bend inward specifically to cross the three path spokes, so every main route forces exactly one river-crossing decision early. Six channels total; bridges land on the spokes and ring road where the player will actually be.

## Terrace placement rationale

The fifteen terraces are deliberate, difficulty-ordered rewards. Small 8x8 plots sit just off the homestead inside the meadow ring; 10x12 plots line the mid-forest band; the largest 16x14 and 20x16 terraces are pushed to the edges and corners as end-game destinations. All face a path so they are visible from the route that leads to them.

## Zone distribution rationale

Concentric difficulty: a meadow core and ring of clearings, a light-forest band, a mid-forest band, and deep forest in the four corners (Dark Hollow, The Deep, Wolf Run, The Briars). Mild angular wobble keeps the rings from looking mechanical without breaking the read. Twenty meadow clearings are placed on regular rings so the player always finds open ground at predictable intervals.

## Expected player routing

- Day 1: Leave any gate into the meadow ring; green-herb and sunflower seeds sit within a screen of home. Plant the four beds and sleep. Zero-pressure onboarding.
- Day 5: Take a spoke outward, cross its one bridge, and work the light/mid-forest band for red-mushroom, golden-wheat and blue-flower. Use the dirt ring road to move between spokes without returning home. Claim the near terraces.
- Day 10+: Run the spokes to the corners for glowshroom and the big corner terraces (Wolf Run / The Briars) under skeleton pressure, using the ring road and lake landmarks (Silver Lake NE, Shadowmere SW) to navigate. Clear progression from center to corner.

## Named zones (22)

| Zone | Center (tile) | Size (tiles) | Area | Type |
|---|---|---|---|---|
| Homestead | (200, 150) | 46x38 | 1748 | garden |
| Sunlit Meadow | (200, 108) | 30x18 | 540 | meadow |
| South Meadow | (200, 194) | 30x18 | 540 | meadow |
| East Commons | (250, 150) | 24x20 | 480 | meadow |
| West Commons | (150, 150) | 24x20 | 480 | meadow |
| Whispering Glade | (200, 74) | 34x22 | 748 | light_forest |
| Eastwood | (300, 118) | 34x30 | 1020 | light_forest |
| Westwood | (100, 118) | 34x30 | 1020 | light_forest |
| Southern Glade | (200, 210) | 40x24 | 960 | light_forest |
| Fernwood | (302, 200) | 40x36 | 1440 | mid_forest |
| The Tangles | (98, 200) | 40x36 | 1440 | mid_forest |
| Mistwood | (300, 86) | 38x30 | 1140 | mid_forest |
| Bramblewood | (100, 86) | 38x30 | 1140 | mid_forest |
| Dark Hollow | (40, 40) | 52x40 | 2080 | deep_forest |
| The Deep | (360, 40) | 52x40 | 2080 | deep_forest |
| Wolf Run | (40, 262) | 52x40 | 2080 | deep_forest |
| The Briars | (360, 262) | 52x40 | 2080 | deep_forest |
| Silver Lake Shore | (332, 104) | 44x28 | 1232 | light_forest |
| Shadowmere | (78, 214) | 44x28 | 1232 | mid_forest |
| Stone Ridge | (192, 56) | 12x12 | 144 | terrace |
| Old Terraces | (344, 266) | 20x16 | 320 | terrace |
| Ember Clearing | (236, 150) | 18x14 | 252 | meadow |

## Seed-spawn markers (35)

| Plant | Spawn tiles (x, y) |
|---|---|
| green_herb ×6 | (188, 126)  (212, 126)  (232, 142)  (232, 158)  (168, 142)  (168, 158) |
| sunflower ×8 | (195, 103)  (240, 130)  (240, 170)  (160, 130)  (160, 170)  (200, 192)  (118, 148)  (278, 148) |
| golden_wheat ×6 | (198, 120)  (176, 148)  (224, 148)  (150, 176)  (250, 176)  (200, 176) |
| red_mushroom ×6 | (110, 90)  (290, 90)  (98, 210)  (304, 210)  (200, 233)  (70, 148) |
| blue_flower ×5 | (206, 80)  (108, 158)  (352, 158)  (330, 120)  (88, 202) |
| glowshroom ×4 | (40, 260)  (360, 40)  (360, 270)  (40, 40) |

## Terraces (15)

| ID | Top-left (tile) | Size | Area | Entry side(s) |
|---|---|---|---|---|
| terrace_1 | (192, 104) | 8x8 | 64 | S |
| terrace_2 | (246, 142) | 8x8 | 64 | W |
| terrace_3 | (142, 142) | 8x8 | 64 | E |
| terrace_4 | (266, 92) | 10x10 | 100 | S |
| terrace_5 | (118, 92) | 10x10 | 100 | S |
| terrace_6 | (186, 50) | 12x12 | 144 | S |
| terrace_7 | (296, 142) | 12x12 | 144 | W |
| terrace_8 | (88, 142) | 12x12 | 144 | E |
| terrace_9 | (274, 206) | 14x12 | 168 | N |
| terrace_10 | (102, 206) | 14x12 | 168 | N |
| terrace_11 | (182, 8) | 16x14 | 224 | S |
| terrace_12 | (360, 134) | 16x14 | 224 | W |
| terrace_13 | (16, 134) | 16x14 | 224 | E |
| terrace_14 | (338, 260) | 20x16 | 320 | N, W |
| terrace_15 | (34, 260) | 20x16 | 320 | N, E |

## Bridges (16) — tile coordinates

(56, 239), (67, 213), (72, 203), (88, 212), (104, 150), (113, 203), (162, 150), (199, 61), (200, 38), (200, 72), (200, 108), (201, 26), (238, 150), (329, 110), (338, 238), (346, 150)


## Lakes & ponds

| Feature | Type | Center (tile) | Size |
|---|---|---|---|
| Silver Lake | lake | (332, 104) | 20x13 (radii) |
| Shadowmere | lake | (78, 214) | 20x13 (radii) |
| Pond 1 | pond | (200, 108) | r=6 |
| Pond 2 | pond | (238, 150) | r=5 |
| Pond 3 | pond | (162, 150) | r=5 |

## Interactive object markers (homestead, tile coords)

| Marker | Tile (x, y) |
|---|---|
| player_start | (200, 150) |
| well | (185, 149) |
| work_station (chest) | (215, 149) |
| sleep_bed | (213, 138) |
| signpost | (203, 163) |
| field_notes | (197, 163) |
| gate_north | (200, 132) |
| gate_east | (222, 150) |
| gate_west | (178, 150) |
| garden_bed (starting) | (191, 141) |
| garden_bed (starting) | (197, 141) |
| garden_bed (starting) | (203, 141) |
| garden_bed (starting) | (209, 141) |
| garden_bed (expansion) | (191, 146) |
| garden_bed (expansion) | (197, 146) |
| garden_bed (expansion) | (203, 146) |
| garden_bed (expansion) | (209, 146) |

## At a glance

- Zones: 22 | Terraces: 15 (+17 entry markers) | Seed spawns: 35
- River channels: 6 | Bridges: 16 | Lakes: 2 | Ponds: 3 | Water tiles: 6666
- Tree stamps: 7246 | Stone-path tiles: 1407 | Dirt-path tiles: 1739 | Objects: 122

## What to edit first in Tiled

Open world-curated.tmx in Tiled. Same first pass as the organic world: repaint the terrace/homestead terrain_detail bands with true cliff tiles and add shoreline transitions. Because this layout is radial, it is also the easier of the two to extend — duplicate a terrace into a symmetric slot or widen a ring band and it stays legible.

## Engine integration note

This map is a **static background + markers only** — the Seedkeeper engine still spawns the player, enemies, seeds, plants and particles at runtime. Two things to wire up: (1) the engine currently hardcodes the garden at the world's **top-center** (`GARDEN_X=2800, GARDEN_Y=200` in `src/core/Constants.js`), but this map places the homestead at the **map center** (tile 200,150 = px 3200,2400); point the engine at the `player_start`/`garden_bed`/gate markers instead of the constants. (2) `buildWorld()` in `GameScene.js` is still procedural (it has a TODO to load a Tiled map) — load this JSON via `this.load.tilemapTiledJSON` and map the 17 tilesets by name.
