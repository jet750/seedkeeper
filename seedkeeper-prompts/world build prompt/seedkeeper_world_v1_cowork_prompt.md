# Seedkeeper — World Generation & Living-World Wiring (Cowork)

**Run in Claude Cowork inside the `seedkeeper` project.** Cowork has the repo and the
filesystem. This prompt carries the exact context prior runs lacked: pinned filenames with
dimensions, the failure mode to avoid, the path grammar, collision-aware density rules, and
the crop-vs-wildflower boundary. Read it fully, then execute all of it.

---

## 0. Context and non-negotiable rules

**Project:** Seedkeeper — Phaser 3 + Vite (vanilla JS ES modules) top-down farming-combat
RPG. Repo `jet750/seedkeeper`, local `C:\dev\seedkeeper\`, deployed at
`seedkeeper.jaxontravis.com` via Vercel.

**Git discipline (CLAUDE.md):** Work on a new branch `feature/world-v1`. Never commit to
`main`. End by merging to `dev` and pushing. Do NOT modify working gameplay systems
(combat, economy, save, homestead code) unless this prompt explicitly says to.

**THE FAILURE MODE TO AVOID:** Every tree/bush/log in this pack is multi-tile (2×2 up to
2×4). A prior run stamped a fixed 4-tile block, capturing *half of two adjacent trees plus
the fruit below them* — fragmented "half-trees" everywhere. **Never place a tree by
guessing GIDs or copying a fixed block.** Derive each object's true footprint from the
PNG's alpha channel (connected non-transparent regions, bbox snapped out to whole 16px
tiles) and place each as a complete atomic unit — whole, or not at all.

**Canvases:** Build THREE maps (see §7). All 16×16 tiles. The 150×150 pair is the
ship-tonight beta; the 400×400 is the robust long-term world.

---

## 1. FIRST TASK — resolve and verify asset paths (prevents red tiles)

Jaxon reorganized `assets\images\` into categorized subfolders. Stale references currently
cause red/missing tiles in Tiled.

1. For every `.tsx` in `assets\tilemaps\` and every `<image source=...>` in any world TMX,
   check the referenced PNG exists. Rewrite broken `source=` paths to the real current
   location (relative to the referencing file). From `assets\tilemaps\`, a ground tile is
   `../images/ground/<file>`, a nature prop `../images/nature/<file>`, etc.
2. Use the pinned filename→role table in §2 — these are confirmed real filenames.
3. Report a before/after table of every path changed.
4. Report (do not delete) any duplicate or unreferenced PNGs you encounter.

---

## 2. Asset map — pinned filenames, roles, and footprints

All tiles 16×16. Dimensions below are confirmed from disk. For multi-tile nature props,
the footprint column is a hypothesis — **confirm each via alpha-channel bbox before placing.**

### GROUND — `assets\images\ground\` (all 176×112 = 11×7 blob sheets unless noted)
| File | Role |
|---|---|
| `Grass_tiles_v2.png` | **Meadow** grass (bright) |
| `Darker_Grass_Tiles_v2.png` | **Light + Deep forest** grass (one OR-rule on both biome values) |
| `Soil_Ground_Tiles.png` | Tilled/garden soil (homestead beds) |
| `Darker_Soil_Ground_Tiles.png` | Forest/dark soil |
| `Stone_Ground_Tiles.png` | Stone ground (cliffs, hard ground) |
| `Water.png` (64×16, 4 frames) | Animated water fill |
| `Bush_Tiles.png` (176×176) | OUT OF SCOPE for v1 — a bush terrain sheet; do not use as ground fill. |

### PATHS — `assets\images\paths\`  (this is a navigation grammar, not just tiles)
| File | Role |
|---|---|
| `Stone_Path.png` (64×64) | **Main arterial routes.** Connect homestead N/E/W gates outward; the backbone network. |
| `Paths.png` (64×64, wooden look) | **Capillary spurs.** Branch OFF the stone arterials and must TERMINATE at a payload — a fight/encounter zone, a lake/seed-find spot, or a deliberate deep-forest dead-end. Not aimless. |
| `Wooden_Bridge_v2.png` (64×48 = 4×3, multi-orientation) | Bridges. Choose horizontal vs vertical span per crossing from the correct tiles. Generally **one bridge per water crossing**, but place **plentiful crossings** so the world is easy to traverse — Jaxon will remove extras if needed. |

### NATURE PROPS — `assets\images\nature\` (alpha-keyed; detect footprints from alpha)
| File | Dims | Contents / use |
|---|---|---|
| `trees_stumps_bushes.png` | 192×112 (12×7) | Small plain trees (~2×2), fruit trees apple/orange/yellow/pink (~2×2), berry bushes plain/red/purple/blue (1×2–2×2), one hero tree (~2×4, deep-forest anchor, sparse), logs/stumps (2×1–3×1). A thin row of single-tile fruit ICONS exists — DO NOT place those; they are item drops, not world props. |
| `mushrooms_flowers_stones.png` | 192×80 (12×5) | Red/purple mushroom growth stages (1×1, one ~1×2), stones/pebbles (1×1), boulders (2×2, sparse), grass tufts (1×1), yellow flower growth + sunflower (1×2), pink/blue small flower growth pairs. Treat left→right size progressions as ordered growth frames. |
| `Water Objects.png` | 192×32 (12×2) | Water rocks, reeds/cattails, lily pads (one flowering). Scatter ONTO WATER TILES ONLY. Bottom-row blue blobs are optional pond fill — prefer the existing water tiles. |

### STRUCTURES — `assets\images\structures\`
`Fences.png` (128×64), `fence_gate.png` (160×48), `water_well.png` (32×32),
`work_station.png` (32×32), `signs.png` (96×64 — optional, for path-end markers).
Fences/gates/well/work_station belong to the homestead (§3).

### PLANTS — `assets\images\plants\` → **GARDEN ONLY. Not used in wilderness generation.**
~30 crop PNGs (112×16 = 7-frame growth strips; taller ones 112×32) plus
`farming_plants_v2.png` and `farming_plants_watered.png` (112×528). These are FARM crops
for tilled beds, chained to the game engine later as the daily-drop/harvest mechanic. For
THIS run they belong only to the homestead beds you lift from `dev` (§3). **Do not scatter
crops into meadows or forest** — wild flora comes from `mushrooms_flowers_stones.png`. Putting
a cabbage in the forest is the boundary error to avoid.

### EXPLICITLY OUT OF SCOPE (do not read, place, or modify)
`assets\images\character\`, `chests\`, `effects\`, `enemies\`, `ui\`, `furniture\`. These
are runtime/gameplay assets, not world tiles.

---

## 3. Homestead — lift from the working `dev` build, place dead-center

Jaxon does not want to rebuild/recode the garden now.

1. Investigate how the homestead is currently defined on `dev` (procedural code vs tilemap
   data) and reproduce its **layout footprint** centered on each map (150×150 → center
   ~75,75; 400×400 → center ~200,200). The homestead keeps the **same absolute size** on
   every map — it's the same garden.
2. Include garden beds, fences (`Fences.png`), gates (`fence_gate.png`, keep N/E/W open),
   work station, well. Beds use `Soil_Ground_Tiles.png`.
3. Do NOT alter the live homestead code on `dev`; you are copying its layout into the world
   files. Jaxon will redesign the homestead in Tiled later.
4. If clean extraction isn't possible, lay a fenced footprint with marked bed positions +
   well + work station, and flag it in the notes.

---

## 4. World generation — wilderness rules

Preserve the existing biome zoning, rivers, lakes, and path intent already in the base map
where present; otherwise generate consistently. Populate onto these layers (create if absent):
`paths_main`, `paths_spur`, `props_trees`, `props_ground`, `props_water`, and the
`nature_dynamic` object layer (§5).

**Two-tier density (the key rule):** visual fullness comes from NON-colliding understory;
passability comes from keeping colliding trunks sparse.
- **Colliding tier (sparse):** tree trunks / hero trees. Even in deep forest, keep ≥2–3
  walkable tiles between trunks so the player can always thread through once collision is
  on. Tag these so the engine can mark them solid later.
- **Non-colliding tier (dense):** bushes, mushrooms, stones, grass tufts, logs, flowers.
  These fill the scene visually and are walk-through. Layer them generously, especially in
  deep forest, to read as lush without blocking movement.

**Biome density:** deep forest = sparse large/medium trunks + heavy understory; light
forest = looser trunks + moderate understory; meadow = mostly open, occasional edge tree/
bush, more flowers and tufts. Deep forest concentrates toward map edges/perimeter.

**Placement safety:** before placing any stamp, verify its full alpha-derived footprint
lands on valid ground (not water, not path, not homestead interior, not another prop). If
it doesn't fit, skip. This guarantees no overlaps and no fragments.

**Paths (per §2 grammar):** lay `Stone_Path` arterials from the homestead gates outward;
branch `Paths` (wooden) spurs off them, each terminating at a payload (encounter zone, lake/
seed spot, or deep-forest dead-end). Place bridges with correct orientation at every water
crossing the paths make; add extra crossings for traversability.

---

## 5. Living-world data model (static now, animates later)

The world feels alive by cycling growth frames per in-game day, reusing the existing day
counter. Store positions + metadata; Phaser computes the visible frame at runtime. On the
`nature_dynamic` object layer, each dynamic element is an object with properties:

**Flowers & mushrooms (staggered, independent):**
- `kind`: `flower` | `mushroom`; `species`: e.g. `flower_blue`, `mushroom_red`
- `frames`: ordered GID list of that species' growth stages (usually 4)
- `offset`: random int `0..frames.length-1` chosen PER INSTANCE (prevents unison pulsing)
- runtime frame = `frames[(dayCount + offset) % frames.length]`

**Fruit trees (synchronized by season):**
- `kind`: `fruit_tree`; `baseTree`: GID(s) of the plain green tree footprint (visual baseline)
- `fruitType`: `apple` | `orange` | `yellow` | `pink`; `fruitOverlay`: GID(s) of fruited footprint
- No per-tree offset; a global season decides which fruitType is fruiting.
- runtime = fruited overlay if `currentSeason === fruitType`, else baseTree.
- `currentSeason = ['apple','orange','yellow','pink'][Math.floor(dayCount / SEASON_LENGTH) % 4]`,
  `SEASON_LENGTH = 2` (tunable).

Also place each dynamic element's **base/frame-0 sprite** in the prop layers so the map
looks complete before the draw logic is wired — the object layer is the animation source of
truth; the prop tile is the static fallback. Crops are NOT part of this system (garden-only).

---

## 6. Phaser draw logic — write now, keep static-safe

Add `src/world/DynamicNature.js` and wire it into the world/scene load path:
1. On scene create, read the `nature_dynamic` object layer.
2. Compute `currentSeason` and read `dayCount` from the EXISTING day system (reuse; no
   parallel counter). Mark the read with `// SEASON/DAY CYCLING HOOK`.
3. Draw the correct frame per §5 at each object's x/y.
4. **Static-safe:** if the day/season wiring isn't connected, fall back to each marker's
   base/frame-0 sprite with zero errors — world renders correctly today, varies by day once
   the hook is connected (a one-line change).
Do not touch combat, economy, save, or homestead gameplay code. This is additive, isolated
to world rendering.

---

## 7. Produce THREE maps + previews

1. `world_v1_a.tmx` — 150×150, seed A.
2. `world_v1_b.tmx` — 150×150, seed B (different tree/prop distribution & minor zoning) so
   Jaxon can pick the stronger beta base.
3. `world_v1_massive.tmx` — **400×400 tiles (6400×6400px)**, same rules and asset mapping,
   composition scaled up proportionally: more meadow pockets, longer multi-fork rivers,
   heavier deep-forest perimeter, more dynamic markers so the larger world isn't sparse.
   Homestead stays same absolute size, centered ~200,200.

Render a top-down composite preview PNG for each so Jaxon can compare without opening Tiled.
Do not overwrite any map with another. Note: 400×400 is square and taller than the live
6400×4800 world — performance (sprite culling) may need tuning before it ships as live;
flag this in notes, it does not block building it.

---

## 8. Deliverables and git

1. `world_v1_a.tmx`, `world_v1_b.tmx`, `world_v1_massive.tmx` in `assets\tilemaps\`, opening
   clean in Tiled (no red tiles, no fragmented trees, homestead centered).
2. All `.tsx`/image paths resolved (§1) with a before/after report.
3. `src/world/DynamicNature.js` (+ wiring) per §6.
4. Three preview PNGs.
5. `WORLD_V1_NOTES.md`: what was generated, alpha-derived footprint bboxes per prop, the
   `Stone_Path` vs `Paths` assignment confirmation, homestead extraction method/substitutions,
   and tunable constants (`SEASON_LENGTH`, density values, frame counts, crossing counts).
6. Commit on `feature/world-v1`, merge to `dev`, push per CLAUDE.md. `main` untouched.

---

## 9. Verification checklist

- [ ] All three TMX open in Tiled 1.12.2 with zero red/missing tiles.
- [ ] Every tree is whole — no half-trees, no fruit-fragment-in-canopy artifacts.
- [ ] Colliding trunks are sparse with ≥2–3 tile gaps; understory provides the fullness.
- [ ] No prop overlaps; props off water/paths/homestead; water props only on water.
- [ ] `Stone_Path` = arterials from gates; `Paths` = wooden spurs terminating at payloads; bridges oriented correctly with plentiful crossings.
- [ ] No crops in the wilderness; crops confined to homestead beds.
- [ ] Homestead centered and same absolute size on all three maps.
- [ ] `nature_dynamic` layer carries correct `offset` / `fruitType` metadata.
- [ ] Game builds and runs; world renders static base frames; no console errors.
- [ ] Branch pushed to `dev`; `main` untouched.

**If anything is ambiguous (especially homestead extraction or a path-sheet assignment),
make the safest non-destructive choice, flag it in `WORLD_V1_NOTES.md`, and report — do not
guess at gameplay code.**
