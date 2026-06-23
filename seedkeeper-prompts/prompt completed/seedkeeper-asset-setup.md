# Seedkeeper — Asset Setup Guide
## What to copy from your packs, where it goes, and how to name it

Complete this before starting Sprint 1. The game will run with placeholders if files are missing, but completing this first means Sprint 1 produces something that looks real immediately.

---

## Step 1 — Create the Project Folder Structure

Create this folder tree on your machine before touching any asset packs. You can do this in VS Code's Explorer panel or via terminal.

```
seedkeeper/
├── /src/                    ← Claude Code writes all code here
├── /assets/
│   ├── /images/             ← ALL sprite sheets and tilesets go here
│   ├── /tilemaps/           ← Tiled .json map files go here (Sprint 5)
│   └── /audio/              ← ALL music and SFX files go here
├── /public/                 ← Vite will serve these as-is (leave empty for now)
└── CREDITS.md               ← Create this file now, update as you add assets
```

In terminal (inside your project folder):
```bash
mkdir -p src assets/images assets/tilemaps assets/audio public
touch CREDITS.md
```

That's it. Claude Code builds everything inside `/src/`. You populate `/assets/`.

---

## Step 2 — Sprout Lands Premium Pack

**Open your downloaded Sprout Lands folder.** You'll see a structure something like:

```
Sprout_Lands_Asset_Pack_Premium/
├── Characters/
│   └── Basic Charakter Spritesheet.png   ← THIS ONE
├── Tilesets/
│   ├── Grass.png                         ← THIS ONE
│   ├── Water.png
│   ├── Plowed Soil.png
│   ├── Walls.png
│   └── (others)
├── Objects/
│   ├── Basic_Grass_Biom_things.png       ← THIS ONE (plants, rocks, etc.)
│   ├── Fences.png                        ← THIS ONE
│   ├── Chest.png                         ← THIS ONE
│   └── (others)
├── UI/
│   └── (UI pack is separate — see below)
```

**Copy these files → rename → place in /assets/images/:**

| Original filename | Rename to | Why |
|---|---|---|
| `Basic Charakter Spritesheet.png` (or similar) | `player_sheet.png` | Player walking/idle animations |
| `Grass.png` | `tileset_garden.png` | Garden zone ground tiles |
| `Fences.png` | `tileset_fence.png` | Garden boundary fence |
| `Basic_Grass_Biom_things.png` | `props_garden.png` | Plants, flowers, rocks for garden decoration |
| `Chest.png` (or Objects sheet containing chest) | `chest.png` | Upgrade chest object |

**Notes on the character sheet:**
- The Sprout Lands character is 48×48px per frame even though the character appears on a 16×16 grid (extra transparent padding around the sprite)
- The sheet has multiple rows — typically: walk down, walk up, walk left, walk right (or similar)
- When you tell Claude Code the filename, also tell it the frame size: "player_sheet.png, 48x48 frames, 4 directions with 6 frames each walk animation"
- If you're unsure of the exact layout, open the sheet in any image viewer and count the frames

**Sprout Lands UI Pack (separate download):**
If you purchased the UI pack separately:

| Original filename | Rename to | Why |
|---|---|---|
| Main UI sprite sheet | `ui_sproutlands.png` | Buttons, panels, inventory slots |
| Icons sheet | `icons_sproutlands.png` | Plant icons, item icons for HUD |

---

## Step 3 — Mystic Woods Pack

**Open your downloaded Mystic Woods folder.** Structure is roughly:

```
Mystic_Woods/
├── sprites/
│   ├── characters/
│   │   └── player.png            ← character sprite (48×48 frames)
│   ├── enemies/
│   │   ├── slime.png             ← THIS ONE
│   │   └── skeleton.png          ← THIS ONE (paid version)
│   └── objects/
│       ├── objects.png           ← trees, bushes, rocks
│       └── (others)
└── tiles/
    ├── grass.png                 ← THIS ONE  
    ├── water.png                 ← THIS ONE
    ├── tileset.png               ← THIS ONE (main forest tiles)
    └── (others)
```

**Copy these files → rename → place in /assets/images/:**

| Original filename | Rename to | Why |
|---|---|---|
| `slime.png` | `slime_sheet.png` | Green + dark slime (dark slime is same sprite, tinted purple in code) |
| `skeleton.png` (paid) | `skeleton_sheet.png` | Skeleton enemy |
| `tileset.png` or `grass.png` | `tileset_forest.png` | Forest zone ground/environment tiles |
| `water.png` | `tileset_water.png` | Water edges (near blue flower seeds) |
| `objects.png` | `props_forest.png` | Trees, bushes, forest decorations |

**Notes on Mystic Woods sprites:**
- The slime sheet has multiple animation states — walk/idle in 4 directions, death animation
- Tell Claude Code: "slime_sheet.png — check the file dimensions to determine frame size, likely 16×16 or 32×32 per frame"
- The skeleton is in the paid version only — if you're still waiting for the download, use a colored rectangle placeholder

---

## Step 4 — Anokolisa Top-Down RPG Pack (Free)

**Download from:** https://anokolisa.itch.io/dungeon-crawler-pixel-art-asset-pack

This pack is primarily for weapon icons and additional UI elements.

**Copy these files → rename → place in /assets/images/:**

| Original filename | Rename to | Why |
|---|---|---|
| Weapons sprite sheet | `weapons_icons.png` | Weapon icons for upgrade shop UI and HUD |
| Items/icons sheet | `items_icons.png` | Additional item icons |

You don't need to use every sprite in this pack — the weapon icons are the primary use case.

---

## Step 5 — Audio Files (freesound.org CC0)

Go to **freesound.org**, create a free account, and search for each of these. Filter by **CC0** license (zero attribution required — safest for commercial use).

**Search terms and recommended downloads:**

| What you need | Search term on freesound.org | Rename to |
|---|---|---|
| Garden/farm ambient music | "peaceful farm ambient loop" or use Pixabay.com/music | `bgm_garden.mp3` |
| Forest ambient music | "forest birds ambient loop" or Pixabay.com/music | `bgm_forest.mp3` |
| Collecting/pickup sound | "magical pickup chime" or "coin collect" | `sfx_collect.wav` |
| Plant harvest sound | "rustle whoosh soft" | `sfx_harvest.wav` |
| Upgrade/purchase | "upgrade sparkle success" | `sfx_upgrade.wav` |
| Sword swing | "sword swing whoosh" | `sfx_swing.wav` |
| Enemy hit | "thud impact soft" | `sfx_hit_enemy.wav` |
| Player takes damage | "damage impact grunt" | `sfx_hit_player.wav` |
| Enemy death | "creature death short" | `sfx_death_enemy.wav` |
| Player death | "death descending tone" | `sfx_death_player.wav` |
| Zone transition | "ambient transition swoosh" | `sfx_gate.wav` |
| Sleep/rest | "soft chime sleep" | `sfx_sleep.wav` |
| Watering | "water pour soft short" | `sfx_water.wav` |
| Day timer warning | "soft bell single" | `sfx_warning_bell.wav` |
| Day timer urgent | "urgent pulse loop" | `sfx_urgent_pulse.wav` |

**Alternative for music:** Pixabay.com/music has free CC0 music tracks that are longer and higher quality than freesound loops. Search "cozy farm" and "forest adventure" and download as MP3.

**File format note:** `.wav` for short SFX (lower latency), `.mp3` for music loops (smaller file size). Both work in Phaser 3.

---

## Step 6 — Verify Your /assets/ Folder

Before starting Sprint 1, your folder should look like this:

```
/assets/
├── /images/
│   ├── player_sheet.png         ✓
│   ├── slime_sheet.png          ✓
│   ├── skeleton_sheet.png       ✓ (or note as TODO if not yet available)
│   ├── tileset_garden.png       ✓
│   ├── tileset_forest.png       ✓
│   ├── tileset_fence.png        ✓
│   ├── tileset_water.png        ✓
│   ├── props_garden.png         ✓
│   ├── props_forest.png         ✓
│   ├── chest.png                ✓
│   ├── weapons_icons.png        ✓
│   └── items_icons.png          ✓
├── /tilemaps/
│   └── (empty for now — Tiled map created between Sprint 4 and 5)
└── /audio/
    ├── bgm_garden.mp3           ✓
    ├── bgm_forest.mp3           ✓
    ├── sfx_collect.wav          ✓
    ├── sfx_harvest.wav          ✓
    ├── sfx_upgrade.wav          ✓
    ├── sfx_swing.wav            ✓
    ├── sfx_hit_enemy.wav        ✓
    ├── sfx_hit_player.wav       ✓
    ├── sfx_death_enemy.wav      ✓
    ├── sfx_death_player.wav     ✓
    ├── sfx_gate.wav             ✓
    ├── sfx_sleep.wav            ✓
    ├── sfx_water.wav            ✓
    ├── sfx_warning_bell.wav     ✓
    └── sfx_urgent_pulse.wav     ✓
```

If any file is missing: that's fine. The sprint prompts instruct Claude Code to use colored rectangle placeholders for any missing sprite, and to skip missing audio gracefully. Mark missing files as TODO in CREDITS.md.

---

## Step 7 — Sprite Sheet Info You'll Need

Before running Sprint 1, open each sprite sheet in an image viewer and note these values. You'll add them to the Sprint 1 prompt where it says to fill in asset filenames.

**player_sheet.png**
- Total image dimensions: _____ × _____ px
- Frame size per sprite: likely 48×48
- Number of rows: _____ (each row = one animation direction)
- Frames per row: _____ (typically 4–8 frames per walk cycle)

**slime_sheet.png**
- Total image dimensions: _____ × _____ px
- Frame size: likely 16×16 or 32×32
- Number of animations: _____ (idle, walk, death?)

**skeleton_sheet.png**
- Total image dimensions: _____ × _____ px
- Frame size: _____ × _____

**tileset_garden.png and tileset_forest.png**
- Tile size: should be 16×16 px per tile (both Sprout Lands and Mystic Woods are 16×16)

Add these numbers to your Sprint 1 prompt in the "Asset Files" section, like:
> "player_sheet.png — 48×48px per frame, 4 rows (down/up/left/right), 6 frames per row walk animation, first 4 frames are idle"

This tells Claude Code exactly how to slice the sprite sheet for animations, avoiding a very common source of bugs.

---

## Step 8 — CREDITS.md Template

Create this file in your project root now and update it as you add each asset:

```markdown
# Seedkeeper — Asset Credits

## Art

**Sprout Lands (Premium)**  
Artist: Cup Nooble  
URL: https://cupnooble.itch.io/sprout-lands-asset-pack  
License: Commercial license purchased  
Usage: Garden environment tiles, player character, garden objects, fence, chest

**Sprout Lands UI Pack**  
Artist: Cup Nooble  
URL: https://cupnooble.itch.io/sprout-lands-ui-pack  
License: [check purchase page]  
Usage: UI panels, buttons, inventory icons

**Mystic Woods (Paid)**  
Artist: Game Endeavor  
URL: https://game-endeavor.itch.io/mystic-woods  
License: Commercial license purchased  
Usage: Forest environment tiles, slime enemies, skeleton enemy

**Anokolisa Top-Down RPG Pack**  
Artist: Anokolisa  
URL: https://anokolisa.itch.io/dungeon-crawler-pixel-art-asset-pack  
License: Free for commercial use — credit required  
Usage: Weapon icons, item sprites

## Audio

[Add each file as you download it:]
**[filename].wav/mp3**  
Creator: [username on freesound or Pixabay]  
URL: [direct link]  
License: CC0  
Usage: [what it's used for in game]

## Frameworks & Tools

**Phaser 3** — https://phaser.io — MIT License  
**Vite** — https://vitejs.dev — MIT License  
**Tiled Map Editor** — https://mapeditor.org — GPL License (tool only, not in game)

## Development

Built by Jaxon Travis  
AI-assisted development using Claude (Anthropic)  
All design decisions, creative direction, and product vision by the developer
```

---

## Known Asset Gaps (resolved in code)

| Gap | How it's handled |
|---|---|
| Mystic Woods has no bow/weapon animations for character | Weapons rendered as separate rotating sprite objects — not baked into character |
| No projectile arrow sprite in any pack | Simple colored oval/rectangle projectile — functionally correct, visually acceptable |
| Tiled world map doesn't exist yet | Sprints 1–4 use colored rectangle zone placeholders — real map integrated in Sprint 5 |
| Dark slime is same sprite as green slime | Purple color tint applied in code via Phaser's `setTint(0x8833cc)` |

---

## You're Ready When

```
[ ] /assets/images/ has at minimum: player_sheet.png, slime_sheet.png, tileset_garden.png, tileset_forest.png
[ ] /assets/audio/ has at minimum: bgm_garden.mp3, bgm_forest.mp3, sfx_collect.wav
[ ] You know the frame dimensions of player_sheet.png and slime_sheet.png
[ ] CREDITS.md exists and has entries for each asset pack used
[ ] You've added the actual filenames + frame dimensions to the Sprint 1 prompt
[ ] Project folder exists at a path with no spaces (e.g. ~/projects/seedkeeper, not ~/My Projects/Seedkeeper)
```

Open VS Code, open your project folder, open a Claude Code session, and paste seedkeeper-prompt-1.md.
