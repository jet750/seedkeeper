# Economy Sprint 3d — Plant rendering fix, expanded catalog, skeleton wiring

## Context
Three distinct fixes that must land before Sprints 6a/6b:
1. Plants show brown dirt instead of growth sprites — asset pipeline broken
2. Skeletons never spawn — zone threshold mismatch with WorldZoneSystem
3. Skeleton animations not wired to correct frame sizes in the manifest

All plant PNGs have been pre-extracted to `assets/images/plants/` by the
`slice_plants.py` tool. The manifest entries and plants stubs are at
`assets/images/plants/_manifest_entries.json` and `_plants_stubs.json`.

## Hard rules
- Do NOT modify combat feel, economy values, marketplace, save schema beyond
  adding new plant keys, day timer, or weather.
- All new plant data goes in `entities.json` under `plants` and `upgrades`.
- All skeleton frame sizes come from the actual PNG dimensions confirmed below.
- Regression guard: existing 6 plants keep working; new plants add alongside them.

## Builds on
dev post-Sprint 3c. `assets/images/plants/` exists with 28 extracted PNGs.

## Tasks

### 1. Branch
```
git checkout dev && git pull && git checkout -b feature/plant-rendering-fix
```

### 2. Fix assetManifest.json

**A — Add all 28 plant spritesheets.** Read
`assets/images/plants/_manifest_entries.json` and add every entry to the
`spritesheets` array in `src/data/assetManifest.json`. Each entry already has
correct `key`, `path`, `frameWidth: 16`, `frameHeight` (16 for standard,
32 for tall plants: corn, sunflower, beanstalk, pineapple, tomato).

**B — Fix skeleton frame sizes.** The existing skeleton entries use
`frameWidth: 16` which is wrong. Update to the correct dimensions:
- `skeleton_idle`:  frameWidth=32,  frameHeight=32  (128×32px  → 4 frames)
- `skeleton_run`:   frameWidth=64,  frameHeight=64  (384×64px  → 6 frames)
- `skeleton_death`: frameWidth=96,  frameHeight=64  (768×64px  → 8 frames)

**C — Remove the old `farming_plants` entry** (key: `farming_plants`,
path: `assets/images/Farming Plants.png`) — replaced by individual plant keys.

### 3. Fix GardenBed.js plant sprite system

The current system uses a shared `farming_plants` spritesheet with a
`PLANT_ROW_MAP` lookup. Replace with individual per-plant texture keys:

- Each plant now has its own loaded spritesheet key matching its name
  (e.g. `red_mushroom`, `sunflower`, `carrots`).
- Update `usePlantSprite` check: instead of checking `farming_plants` frameTotal,
  check `scene.textures.exists(this.plantType)`.
- Update `applyPlantSprite`: use `this.plantSprite.setTexture(this.plantType)`
  and set frame by growth column only (no row calculation needed).
- Frame mapping: 7 frames per plant (columns 0–6).
  - col 0: just planted (seed)
  - cols 1–2: early sprout
  - cols 3–4: mid growth  
  - cols 5–6: ready to harvest (use col 6 for READY state)
  - For PLANTED state use col 0; for GROWING interpolate cols 1–4 by progress;
    for READY use col 6.
- Tall plants (corn, sunflower, beanstalk, pineapple, tomato) have
  `frameHeight: 32` — set `PLANT_SPRITE_ORIGIN_Y = 0.85` for these so they
  root to the soil correctly. Standard plants keep `PLANT_SPRITE_ORIGIN_Y = 0.78`.
- Remove `PLANT_ROW_MAP`, `PLANT_SHEET_COLS`, and all references to
  `farming_plants` texture key from GardenBed.js.

### 4. Update entities.json — expanded plant catalog

Read `assets/images/plants/_plants_stubs.json` as the base. Add/update the
`plants` object in `entities.json` with ALL 28 plants using this schema:

```json
"corn": {
  "name": "Corn",
  "growthDays": 1,
  "color": "#F4D03F",
  "foundNear": "meadow",
  "seedRespawn": 90000,
  "statTree": "attack",
  "sellValue": 3,
  "isTall": true
}
```

Use these groupings (uniform growthDays and sellValue within each tree):

**Speed tree (growthDays: 1, sellValue: 3) — statKey: speedMult:**
carrots, purple_carrot, white_carrots
Theme: root vegetables, underground and fast

**Defense tree (growthDays: 1, sellValue: 3) — statKey: hpMult:**
cauliflower, purple_cauliflower, red_lettuce
Theme: brassicas and dense leafy crops, hardy and protective

**Crit tree (growthDays: 2, sellValue: 7) — statKey: critBonus:**
corn, sunflower, wheat
Theme: tall grain and seed crops, reach high strike true

**Attack tree (growthDays: 2, sellValue: 7) — statKey: attackMult:**
tomato, eggplant, beanstalk
Theme: bold aggressive plants and climbers

**Harvest tree (growthDays: 2, sellValue: 7) — statKey: timerBonus:**
pumpkin, cucumber, bok_choy
Theme: garden classics, patience and abundance

**Magic tree (growthDays: 3, sellValue: 12) — statKey: harvestRange:**
blue_flower_2, red_berry, pineapple
Theme: colorful, exotic, otherworldly

**Sell-only (no statTree, growthDays: 3, sellValue: 15):**
watermelon, blue_melon, green_melon

**Reserved/discarded (extract to assets/images/plants/ but do NOT wire
into entities.json or upgrades — available for future paths):**
cabbage, purple_beets, horseradish, sweet_potatoes, parsnip

**CRITICAL — blue_flower key migration:**
The old `blue_flower` key no longer has a matching asset. Replace ALL
references to `blue_flower` throughout the codebase (entities.json, upgrades,
achievements, save schema, GardenBed, UIScene, GameScene) with `blue_flower_2`.
This is a key rename not an addition — do not leave `blue_flower` as a
dangling reference anywhere. Bump save to v3 with a clean wipe on mismatch
(saves are disposable).

**Existing keys to retire** (referenced in old save/achievement data, no longer
used as growable plants — remove from entities.json plants and upgrades,
audit achievements to repoint or remove):
red_mushroom → retired (no matching asset in new pack)
golden_wheat → retired (wheat is the new key)
green_herb → retired (no direct equivalent, parsnip is reserved)
glowshroom → retired (no matching asset)

Each retired key's stat tree is now covered by the new plant groupings above.
Wire the new plants into the upgrade system using the same stat structure as
the retired plant they replace:
- carrots/purple_carrot/white_carrots → speedMult (was golden_wheat)
- cauliflower/purple_cauliflower/red_lettuce → hpMult (was blue_flower)
- corn/sunflower/wheat → critBonus (was glowshroom)
- tomato/eggplant/beanstalk → attackMult (was red_mushroom)
- pumpkin/cucumber/bok_choy → timerBonus (was green_herb)
- blue_flower_2/red_berry/pineapple → harvestRange (was sunflower)

### 5. Update entities.json — upgrade trees for new plants

Each stat tree currently has one plant feeding it. Expand so all 3 plants in
each tree feed the same stat upgrade. In the `upgrades` object, add entries for
each new plant that mirrors the stat structure of its tree's existing plant:

All three plants in each tree share identical stat structure (same levels,
perLevelBonus, costs) — copy from the retired plant that owned that tree:

- tomato, eggplant, beanstalk → attackMult (copy red_mushroom stat block)
- cauliflower, purple_cauliflower, red_lettuce → hpMult (copy blue_flower stat block)
- carrots, purple_carrot, white_carrots → speedMult (copy golden_wheat stat block)
- corn, sunflower, wheat → critBonus (copy glowshroom stat block)
- pumpkin, cucumber, bok_choy → timerBonus (copy green_herb stat block)
- blue_flower_2, red_berry, pineapple → harvestRange (copy sunflower stat block)

Sell-only plants (watermelon, blue_melon, green_melon) get no upgrades entry.
Reserved plants (cabbage, purple_beets, horseradish, sweet_potatoes, parsnip)
get no upgrades entry.

Remove the retired plant upgrade entries entirely:
red_mushroom, blue_flower, golden_wheat, green_herb, glowshroom
(sunflower stays — it's now in the crit tree under wheat's visual family).

### 6. Fix skeleton spawn threshold

In `GameScene.js`, `DEEP_FOREST_THRESHOLD = 0.7` requires skeletons to spawn
below y=3360 on a 4800px world. But `WorldZoneSystem` places deep_forest
influence points at y=1900–2200 (only 46% of world height). These never overlap,
so skeletons never spawn.

Fix: replace the hardcoded threshold spawn logic with a zone query:
```javascript
// Instead of: const deepMinY = Math.ceil(WORLD_HEIGHT * DEEP_FOREST_THRESHOLD);
// Use the zone system directly:
const pos = this.getSpawnPositionInZone(['deep_forest']);
```
`getSpawnPositionInZone` already queries WorldZoneSystem correctly — the spawn
logic just needs to use it instead of the raw Y threshold. Remove
`DEEP_FOREST_THRESHOLD` from Constants.js if it has no other references.

### 7. Wire skeleton animations in Skeleton.js

With corrected frame sizes, ensure the Skeleton entity uses the right animation
keys and frame ranges:
- Idle: `skeleton_idle`, frames 0–3 (4 frames at 32×32)
- Run:  `skeleton_run`,  frames 0–5 (6 frames at 64×64)  
- Death: `skeleton_death`, frames 0–7 (8 frames at 96×64)

If animations are already defined with the old 16px frame size, recreate them
with the corrected dimensions. The sprite display size should stay at 2x scale
(matching the rest of the game) regardless of source frame size.

## Verification (must pass before merge)
- `npm run dev`: plant beds show correct growth sprites for all 6 existing plant
  types; planting corn/carrots/sunflower (via cheat or normal play) shows the
  new sprites progressing through 7 growth stages.
- Tall plants (corn, sunflower) render rooted to soil, not floating.
- Skeletons spawn in deep forest zones — confirm by running past day 5 or using
  the dev menu spawn command.
- Skeleton idle/run/death animations play correctly at 2x scale.
- No brown-dirt placeholder beds on any plant type.
- Existing 6 plant keys still work; save loads cleanly; achievements fire.

## Merge sequence (never main)
```
git add -A
git commit -m "fix: plant rendering (individual PNGs, 7-frame mapping), expanded plant catalog, skeleton spawn threshold + animation frames"
git checkout dev
git merge feature/plant-rendering-fix
git push origin dev
```
Do NOT merge or push to main.
