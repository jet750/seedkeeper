# Seedkeeper — Sprint 10: UI Asset Replacement & Forest Enrichment

**What this sprint produces:** Sprout Lands UI pack replaces all rectangle-based
UI elements. Well, bed, and chest get real sprites. Forest gets a parallax
background layer, scattered atmospheric props, and falling leaves particles.
Game looks finished rather than prototyped.

**Playtestable result:** Open the game and it looks like a real commercial
pixel game. UI reads as intentional design not placeholder geometry.

**Depends on:** Sprint 9 complete and committed to dev.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-10-ui-and-forest
```

---

## Before Starting — Asset Scan

Run this first and report what is found before touching any code:

```powershell
Get-ChildItem "C:\dev\seedkeeper\assets\images\" -Recurse | Select-Object Name, FullName
Get-ChildItem "C:\dev\game design assets\seedkeeper-assets\" -Recurse -Include "*.png" | Select-Object Name, FullName
```

Also check specifically for these files by searching the raw asset folders:
- Any file with "UI", "interface", "panel", "button", "slot", "icon" in the name
- Any file with "well", "chest", "bed", "sleep" in the name
- Any file with "background", "parallax", "far", "mid", "fog" in the name
- Any file with "leaf", "leaves", "particle" in the name
- Any file with "grave", "log", "fallen", "dead tree", "mushroom" in the name

Build the entire sprint around what is ACTUALLY present. For any element
where the source asset cannot be found, keep the existing placeholder and
add a TODO comment. Do not break working systems chasing missing files.

Copy any needed files from the raw asset path to
`C:\dev\seedkeeper\assets\images\` with clean descriptive names before
loading them in code. Quote all paths with spaces in PowerShell.

---

## Section 1 — Sprout Lands UI Pack Integration

Priority order: do these in sequence, verify each works before moving on.

### 1A — Seed Slot Frames
Find the inventory slot sprite in the UI pack — typically a wooden or
stone frame, square, designed to hold an item icon.

Replace the grey rectangle seed slots in UIScene with the actual slot frames:
```javascript
// In UIScene, seed slot rendering
// OLD: this.add.rectangle(x, y, 32, 32, 0x444444)
// NEW: this.add.image(x, y, 'ui_slot_frame')
```

The colored plant circle should render ON TOP of the slot frame when filled.
Empty slots show just the frame. Slot frame should be ~36px, plant circle ~20px
centered inside it.

Load as: `this.load.image('ui_slot_frame', './assets/images/ui_slot_frame.png')`
Or as a spritesheet if multiple slot variants exist.

### 1B — Upgrade Panel / Chest UI Background
Find the panel or scroll background in the UI pack — parchment, wood, or
stone panel designed as a UI container.

In UpgradeScene, replace the `rgba(0,0,0,0.85)` dark overlay background
with the actual panel sprite scaled to fit:
```javascript
// Use as a 9-slice or scaled image behind each upgrade tree panel
this.add.image(centerX, centerY, 'ui_panel').setScale(scaleToFit)
```

If the panel is a 9-slice (designed to scale without distortion), use
Phaser's NineSlice: `this.add.nineslice(x, y, 'ui_panel', null, w, h, left, right, top, bottom)`

### 1C — Buttons
Find button sprites in the UI pack — typically normal, hover, and pressed states.

Replace BUY buttons in UpgradeScene:
```javascript
// Create a button container with the sprite as background
const btn = this.add.image(x, y, 'ui_button_normal')
  .setInteractive()
  .on('pointerover', () => btn.setTexture('ui_button_hover'))
  .on('pointerout',  () => btn.setTexture('ui_button_normal'))
  .on('pointerdown', () => btn.setTexture('ui_button_pressed'));
```

Add button label text on top of the sprite.

### 1D — HUD Background Bar
If the UI pack includes a HUD bar or banner element, use it as the background
behind the top HUD (HP bar, day, zone, timer) instead of the plain dark
rectangle added in Sprint 7.

If no HUD bar sprite found: keep the existing dark rectangle — it works fine.

### 1E — Plant / Item Icons
If the UI pack includes a nature icon set or item icons that match the 6
plant types (mushroom, flower, wheat, herb, glowing mushroom, sunflower),
use them as the seed slot fill icons instead of the colored circles.

Map icons to plant types:
```javascript
const PLANT_ICONS = {
  red_mushroom: 'icon_mushroom',
  blue_flower:  'icon_flower',
  golden_wheat: 'icon_wheat',
  green_herb:   'icon_herb',
  glowshroom:   'icon_glowshroom',
  sunflower:    'icon_sunflower'
};
```

If no matching icons found: keep colored circles — they work and are readable.

### 1F — Watering Can HUD Icon
Find the watering can sprite in the Sprout Lands objects sheet.
Use it as the icon prefix for the water charge display "💧 2/4" in UIScene.
Replace the emoji with the actual sprite at ~20px height.

---

## Section 2 — Garden Object Sprites

### 2A — Well Sprite
Find the well object in Sprout Lands objects sheet.
Replace the well rectangle in GameScene with the actual well sprite.
Keep existing F key interaction logic — only the visual changes.
Position the interaction zone to match the new sprite bounds.

### 2B — Sleep Bed Sprite
Find the bed object in Sprout Lands objects sheet.
Replace the sleep rectangle with the actual bed sprite.
Same interaction zone logic, visual replacement only.

### 2C — Chest Sprite
Find the chest object in Sprout Lands objects sheet.
The chest open animation from Sprint 9 should already be wired —
connect it to the actual chest sprite frames if the sheet has
open/closed variants. If single frame: keep the tween approach from Sprint 9.

### 2D — Garden Fence Gate
Find the gate or opening variant in the Sprout Lands fence tiles.
Replace the colored boundary line at the garden/forest transition with
an actual gate sprite at the center of the boundary (world center X,
GARDEN_ZONE_HEIGHT). Flanked by fence tiles on each side.
This is the visual entry point to the forest — it should look intentional.

---

## Section 3 — Mystic Woods Forest Enrichment

### 3A — Parallax Background Layer (Highest Priority in this Section)

Find background layer images in Mystic Woods — typically named "background",
"far_trees", "sky", or similar. Should be a wide image designed to tile or
scroll behind the main game world.

In GameScene, add behind all other layers:
```javascript
// Parallax far layer — moves at 30% of camera speed
this.farBackground = this.add.tileSprite(
  0,
  GARDEN_ZONE_HEIGHT, // start at forest zone
  WORLD_WIDTH * 2,
  WORLD_HEIGHT,
  'forest_background_far'
).setOrigin(0, 0).setScrollFactor(0.3, 0.5).setDepth(-10);

// Update in GameScene update():
this.farBackground.tilePositionX = this.cameras.main.scrollX * 0.3;
```

If two background layers exist (far + mid), add both with different
scroll factors (0.3 and 0.6). This creates depth perception that makes
the forest feel vast.

If no background image found: skip this item, do not fake it with a
colored rectangle — the existing forest ground tile is fine as-is.

### 3B — Atmospheric Forest Props

Find in Mystic Woods objects/props sheet:
- Dead or gnarled tree variants
- Fallen log sprites
- Mushroom cluster sprites
- Gravestone sprites (if present)

Scatter these as static decorative objects in the forest zone.
Placement rules:
- At least 40px clearance from all seed spawn positions
- At least 60px clearance from enemy spawn positions
- No physics bodies — purely visual, depth sorted below player
- Graveyard cluster (2-3 gravestones) placed in deep forest near skeleton zone
- Fallen logs and dead trees scattered throughout mid-forest
- Mushroom clusters near glowshroom seed spawn zones (geographic hint)

Use `setDepth(1)` on props, `setDepth(5)` on player and enemies so
props render behind entities.

Place 20-30 total props across the full forest zone. Comment each cluster
with its geographic zone: `// deep forest — gravestone cluster near skeleton zone`

### 3C — Falling Leaves Particle Emitter

If Mystic Woods includes a leaf sprite or small particle sprite:

```javascript
// In GameScene create(), after forest zone setup
const leafEmitter = this.add.particles(0, 0, 'leaf_particle', {
  x: { min: 0, max: WORLD_WIDTH },
  y: GARDEN_ZONE_HEIGHT,
  speedY: { min: 15, max: 35 },
  speedX: { min: -15, max: 15 },
  angle: { min: 0, max: 360 },
  rotate: { min: 0, max: 360 },
  scale: { min: 0.4, max: 0.8 },
  alpha: { start: 0.7, end: 0 },
  lifespan: { min: 4000, max: 7000 },
  frequency: 800,   // one leaf every 800ms — very sparse
  quantity: 1,
  depth: 8          // above props, below player
});
```

Very sparse — this should be ambient atmosphere, barely noticeable.
If no leaf sprite found: skip entirely. Do not substitute with rectangles.

---

## Section 4 — Anokolisa Pack Integration

### 4A — Additional Enemy Sprites
Search Anokolisa pack for any enemy sprites that could work as forest
creatures with palette adjustment:
- Spider — excellent forest enemy candidate
- Any crawler or crawling creature sprite

If found, add as a purely visual variant — do not add new enemy types
or mechanics in this sprint. A spider sprite with Slime.js behavior
(green tint removed, brown tint applied) gives visual variety without
code complexity.

Load and use the sprite in GameScene for 2-3 enemy instances as a
visual variant of the green slime. Same AI, different art.

### 4B — Equipment Icons in Upgrade UI
Anokolisa weapon/equipment icons should already be partially integrated.
Verify they are showing in the upgrade chest for weapon and gear tiers.
If any gear track is still showing text-only with no icon, find the
matching icon in the Anokolisa pack and wire it up.

---

## Deliverables Checklist

```
[ ] Asset scan ran first — full report of what was found
[ ] Seed slot frames use UI pack sprites not grey rectangles
[ ] Plant color circles or icons centered inside slot frames
[ ] Upgrade chest UI uses panel sprite not dark rectangle (if found)
[ ] BUY buttons use sprite not plain rectangle (if found)
[ ] Watering can uses sprite icon in HUD not emoji
[ ] Well is a real sprite not a rectangle
[ ] Sleep bed is a real sprite not a rectangle
[ ] Chest is a real sprite with open/close animation
[ ] Garden fence has gate sprite at zone boundary center
[ ] Parallax forest background layer scrolls at 30% camera speed (if asset found)
[ ] 20-30 atmospheric props scattered across forest zone
[ ] Props have correct depth — render behind player and enemies
[ ] Props have 40px+ clearance from seed spawns
[ ] Gravestone cluster in deep forest near skeleton zone (if sprites found)
[ ] Mushroom clusters near glowshroom spawn zones
[ ] Falling leaves particle emitter active in forest (if leaf sprite found)
[ ] Any Anokolisa enemy sprite variants placed as green slime visual alt
[ ] All gear track icons showing in upgrade chest
[ ] All existing gameplay functional — zero regressions
[ ] npm run dev — zero console errors
[ ] Game looks visually finished and intentional
```

Commit with message: `feat: sprint-10 ui asset replacement and forest enrichment`
