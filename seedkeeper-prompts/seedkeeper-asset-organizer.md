# Seedkeeper — Asset Organization Session

This is a file management session, not a code session. Your job is to scan the raw asset packs, identify the correct files, copy and rename them into the game's asset structure, measure sprite sheet dimensions, and update the asset manifest and setup guide with real values.

Do not write any game code. Do not modify any files in /src/. This session only touches /assets/ and documentation files.

## Project Location

The Seedkeeper project is at: `C:\dev\seedkeeper\`

The raw (unorganized) asset packs are at: `C:\dev\seedkeeper\assets-raw\`

Expected subfolders:
```
C:\dev\seedkeeper\assets-raw\sprout-lands\     ← Sprout Lands premium pack
C:\dev\seedkeeper\assets-raw\mystic-woods\     ← Mystic Woods pack
C:\dev\seedkeeper\assets-raw\anokolisa\        ← Anokolisa top-down RPG pack
```

The destination asset folder is: `C:\dev\seedkeeper\assets\`

## Step 1 — Scan and Report

First, recursively list all files in `C:\dev\seedkeeper\assets-raw\` and show the full list. Then proceed through the steps below. Do not ask for confirmation between steps — complete all steps and report what you did at the end.

## Step 2 — Create Destination Folders

Ensure these folders exist (create if missing):
```
C:\dev\seedkeeper\assets\images\
C:\dev\seedkeeper\assets\audio\
C:\dev\seedkeeper\assets\tilemaps\
```

## Step 3 — Sprout Lands Assets

Search the sprout-lands folder for the following. For each file, copy it to /assets/images/ with the specified new name. If multiple candidates exist, pick the most likely match and note your reasoning. If a file genuinely cannot be found, log it as MISSING.

### Character Sprite Sheet → player_sheet.png
Look for a file with a name containing any of: "character", "charakter", "player", "basic char", "spritesheet"
It should be a PNG with multiple rows of walking/idle animation frames.
Copy as: `C:\dev\seedkeeper\assets\images\player_sheet.png`

### Grass / Ground Tiles → tileset_garden.png
Look for: "grass", "ground", "terrain", "tileset", "basic tileset"
It should be a tileset PNG (wider than tall, or square grid of 16×16 tiles).
Copy as: `C:\dev\seedkeeper\assets\images\tileset_garden.png`

### Fence Tiles → tileset_fence.png
Look for: "fence", "fences", "border"
Copy as: `C:\dev\seedkeeper\assets\images\tileset_fence.png`

### Garden Props / Objects → props_garden.png
Look for: "objects", "props", "biome things", "grass biom", "decorations", "plants"
Prefer the file with flowers/plants/rocks (not characters).
Copy as: `C:\dev\seedkeeper\assets\images\props_garden.png`

### Chest Object → chest.png
Look for: "chest", "storage"
If it's part of a larger objects sheet rather than standalone, copy the objects sheet as: `C:\dev\seedkeeper\assets\images\chest_sheet.png` and note which region of the sheet contains the chest.
Copy as: `C:\dev\seedkeeper\assets\images\chest.png` (or chest_sheet.png if embedded in sheet)

### Water Tiles → tileset_water_garden.png
Look for: "water", "pond", "river", "stream"
Copy as: `C:\dev\seedkeeper\assets\images\tileset_water_garden.png`

### Sprout Lands UI (if UI pack subfolder exists)
Look for a subfolder or files named: "UI", "interface", "icons", "buttons", "inventory"
If found:
- Main UI sheet → `C:\dev\seedkeeper\assets\images\ui_sproutlands.png`
- Icons sheet → `C:\dev\seedkeeper\assets\images\icons_sproutlands.png`

## Step 4 — Mystic Woods Assets

Search the mystic-woods folder for the following:

### Forest Tileset → tileset_forest.png
Look for: "tileset", "tiles", "terrain", "forest", "ground"
The main environment tileset (not characters or enemies).
Copy as: `C:\dev\seedkeeper\assets\images\tileset_forest.png`

### Water Tiles → tileset_water_forest.png
Look for: "water" in the mystic woods folder
Copy as: `C:\dev\seedkeeper\assets\images\tileset_water_forest.png`

### Slime Sprite Sheet → slime_sheet.png
Look for: "slime", "enemy slime"
Copy as: `C:\dev\seedkeeper\assets\images\slime_sheet.png`

### Skeleton Sprite Sheet → skeleton_sheet.png
Look for: "skeleton", "undead", "bones"
If not found (may be paid version only): log as MISSING — will use placeholder.
Copy as: `C:\dev\seedkeeper\assets\images\skeleton_sheet.png`

### Forest Props / Objects → props_forest.png
Look for: "objects", "trees", "props", "decorations"
The sheet containing trees, bushes, rocks for the forest environment.
Copy as: `C:\dev\seedkeeper\assets\images\props_forest.png`

### Mystic Woods Character (if different from Sprout Lands) → player_sheet_alt.png
If there is a character/player sprite sheet in Mystic Woods that differs from Sprout Lands:
Copy as: `C:\dev\seedkeeper\assets\images\player_sheet_alt.png`
Note: game will use player_sheet.png (Sprout Lands) by default. This is a backup.

## Step 5 — Anokolisa Assets

Search the anokolisa folder for the following:

### Weapons / Items Icons → weapons_icons.png
Look for: "weapons", "items", "icons", "sword", "bow", "equipment"
Prefer a sheet that clearly shows multiple weapon types.
Copy as: `C:\dev\seedkeeper\assets\images\weapons_icons.png`

### Additional icons if present → items_icons.png
If there's a separate general items/icons sheet:
Copy as: `C:\dev\seedkeeper\assets\images\items_icons.png`

## Step 6 — Measure Sprite Sheet Dimensions

For each of the following files that was successfully copied, use an image reading tool or file metadata to get:
- Total image width × height in pixels
- Estimated frame size (look for regular grid — divide width by number of visible columns)
- Number of animation rows (approximate)

Measure these files:
1. `player_sheet.png`
2. `slime_sheet.png`
3. `skeleton_sheet.png` (if found)
4. `tileset_garden.png`
5. `tileset_forest.png`

Report results in this format:
```
player_sheet.png: 192×256px — estimated 48×48 frames, 4 cols × ~5 rows
slime_sheet.png: 128×64px — estimated 16×16 frames, 8 cols × 4 rows
[etc.]
```

## Step 7 — Update assetManifest.json

Create or update `C:\dev\seedkeeper\src\data\assetManifest.json` with all successfully found files:

```json
{
  "images": {
    "player":          "./assets/images/player_sheet.png",
    "slime":           "./assets/images/slime_sheet.png",
    "skeleton":        "./assets/images/skeleton_sheet.png",
    "tileset_garden":  "./assets/images/tileset_garden.png",
    "tileset_forest":  "./assets/images/tileset_forest.png",
    "tileset_fence":   "./assets/images/tileset_fence.png",
    "tileset_water":   "./assets/images/tileset_water_forest.png",
    "props_garden":    "./assets/images/props_garden.png",
    "props_forest":    "./assets/images/props_forest.png",
    "chest":           "./assets/images/chest.png",
    "weapons_icons":   "./assets/images/weapons_icons.png",
    "items_icons":     "./assets/images/items_icons.png",
    "ui_sproutlands":  "./assets/images/ui_sproutlands.png",
    "icons_sproutlands":"./assets/images/icons_sproutlands.png"
  },
  "audio": {
    "bgm_garden":       "./assets/audio/bgm_garden.mp3",
    "bgm_forest":       "./assets/audio/bgm_forest.mp3",
    "sfx_collect":      "./assets/audio/sfx_collect.wav",
    "sfx_harvest":      "./assets/audio/sfx_harvest.wav",
    "sfx_upgrade":      "./assets/audio/sfx_upgrade.wav",
    "sfx_swing":        "./assets/audio/sfx_swing.wav",
    "sfx_hit_enemy":    "./assets/audio/sfx_hit_enemy.wav",
    "sfx_hit_player":   "./assets/audio/sfx_hit_player.wav",
    "sfx_death_enemy":  "./assets/audio/sfx_death_enemy.wav",
    "sfx_death_player": "./assets/audio/sfx_death_player.wav",
    "sfx_gate":         "./assets/audio/sfx_gate.wav",
    "sfx_sleep":        "./assets/audio/sfx_sleep.wav",
    "sfx_water":        "./assets/audio/sfx_water.wav",
    "sfx_warning_bell": "./assets/audio/sfx_warning_bell.wav",
    "sfx_urgent_pulse": "./assets/audio/sfx_urgent_pulse.wav"
  }
}
```

Remove any entries for files that were MISSING. Add a comment above each missing entry: `// MISSING — placeholder used in code`.

## Step 8 — Create spriteConfig.json

Create `C:\dev\seedkeeper\src\data\spriteConfig.json` with the actual measured dimensions from Step 6:

```json
{
  "player": {
    "frameWidth": 48,
    "frameHeight": 48,
    "animations": {
      "walk_down":  { "start": 0,  "end": 3,  "frameRate": 8, "repeat": -1 },
      "walk_left":  { "start": 4,  "end": 7,  "frameRate": 8, "repeat": -1 },
      "walk_right": { "start": 8,  "end": 11, "frameRate": 8, "repeat": -1 },
      "walk_up":    { "start": 12, "end": 15, "frameRate": 8, "repeat": -1 },
      "idle_down":  { "start": 0,  "end": 0,  "frameRate": 1, "repeat": -1 },
      "idle_left":  { "start": 4,  "end": 4,  "frameRate": 1, "repeat": -1 },
      "idle_right": { "start": 8,  "end": 8,  "frameRate": 1, "repeat": -1 },
      "idle_up":    { "start": 12, "end": 12, "frameRate": 1, "repeat": -1 }
    }
  },
  "slime": {
    "frameWidth": 16,
    "frameHeight": 16,
    "animations": {
      "walk_down":  { "start": 0, "end": 3, "frameRate": 6, "repeat": -1 },
      "walk_left":  { "start": 4, "end": 7, "frameRate": 6, "repeat": -1 },
      "walk_right": { "start": 8, "end": 11,"frameRate": 6, "repeat": -1 },
      "walk_up":    { "start": 12,"end": 15,"frameRate": 6, "repeat": -1 },
      "death":      { "start": 16,"end": 19,"frameRate": 6, "repeat": 0  }
    }
  },
  "skeleton": {
    "frameWidth": 16,
    "frameHeight": 16,
    "animations": {
      "walk_down":  { "start": 0, "end": 3, "frameRate": 6, "repeat": -1 },
      "walk_left":  { "start": 4, "end": 7, "frameRate": 6, "repeat": -1 },
      "walk_right": { "start": 8, "end": 11,"frameRate": 6, "repeat": -1 },
      "walk_up":    { "start": 12,"end": 15,"frameRate": 6, "repeat": -1 },
      "death":      { "start": 16,"end": 19,"frameRate": 6, "repeat": 0  }
    }
  },
  "tileset": {
    "tileWidth": 16,
    "tileHeight": 16
  }
}
```

IMPORTANT: Replace the placeholder frame indices above with the actual values based on what you measured in Step 6. If the Sprout Lands character sheet uses a different layout (e.g. 6 frames per row instead of 4), correct the start/end values to match. The frame indices are zero-based and count left-to-right, top-to-bottom across the entire sheet.

If you cannot determine the exact animation layout from file metadata alone, set all frame values to 0 and add a comment: `// VERIFY: open file visually to confirm frame layout`.

## Step 9 — Final Report

Print a summary:

```
ASSET ORGANIZATION COMPLETE
============================

COPIED SUCCESSFULLY:
  player_sheet.png          — [source path]
  slime_sheet.png           — [source path]
  ... (list all)

MISSING (will use placeholders):
  skeleton_sheet.png        — not found in mystic-woods folder
  ... (list all missing)

AUDIO FILES (not yet present — add manually from freesound.org):
  bgm_garden.mp3
  bgm_forest.mp3
  ... (list all audio)

SPRITE DIMENSIONS MEASURED:
  player_sheet.png:  [W]×[H]px — [N]×[N] frames estimated
  slime_sheet.png:   [W]×[H]px — [N]×[N] frames estimated
  ...

FILES CREATED/UPDATED:
  src/data/assetManifest.json   ✓
  src/data/spriteConfig.json    ✓

NEXT STEP:
  Add audio files to /assets/audio/ from freesound.org (see seedkeeper-asset-setup.md)
  Then run seedkeeper-prompt-1.md in a new Claude Code session.
```
