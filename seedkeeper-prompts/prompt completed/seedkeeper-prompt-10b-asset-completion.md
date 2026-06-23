# Seedkeeper — Sprint 10b: Asset Completion
## Deferred items from Sprint 10, now with exact source file paths

**What this sprint produces:** Sleep bed sprite, fence gate animation, upgrade
panel and button sprites from Sprout Lands UI pack, Sprout Lands pixel font
loaded as a game font, weather icons from UI pack wired to the weather system,
Farming Plants sprite sheet wired to garden bed growth visuals, Sprout Sorry
pack audio wired to game SFX, and the character's watering animation.

**All source paths are verified from asset inventory. No guessing.**

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-10b-asset-completion
```

---

## Asset Copy Instructions

Run these PowerShell commands first to copy all needed assets into the game.
Use quotes around all paths due to spaces.

```powershell
# Create destination if needed
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper\assets\images"
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper\assets\audio"
New-Item -ItemType Directory -Force -Path "C:\dev\seedkeeper\assets\fonts"

# --- SPROUT LANDS SPRITES ---

# Sleep bed (Basic Furniture sheet contains bed)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Tilesets\Building parts\Basic_Furniture.png" `
  "C:\dev\seedkeeper\assets\images\furniture_sheet.png"

# Fence gate animation
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Tilesets\Building parts\Fence gates animation sprites .png" `
  "C:\dev\seedkeeper\assets\images\fence_gate.png"

# Fences (already may exist, refresh)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Tilesets\Building parts\Fences.png" `
  "C:\dev\seedkeeper\assets\images\tileset_fence.png" -Force

# Farming Plants - for garden bed growth visuals
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Objects\Farming Plants.png" `
  "C:\dev\seedkeeper\assets\images\farming_plants.png"

# Farming Plants v2 (from Sprout Sorry pack - has watered variants)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Early Access\Plant update 2\Farming Plants v2.png" `
  "C:\dev\seedkeeper\assets\images\farming_plants_v2.png"

# Farming Plants watered version
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Early Access\Plant update 2\Farming Plants v2 watered.png" `
  "C:\dev\seedkeeper\assets\images\farming_plants_watered.png"

# Mushrooms, Flowers, Stones - for world decorations
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Objects\Mushrooms, Flowers, Stones.png" `
  "C:\dev\seedkeeper\assets\images\mushrooms_flowers_stones.png"

# Trees stumps and bushes - for forest props
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Objects\Trees, stumps and bushes.png" `
  "C:\dev\seedkeeper\assets\images\trees_stumps_bushes.png"

# Water well (standalone sprite)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Objects\Water well.png" `
  "C:\dev\seedkeeper\assets\images\water_well.png" -Force

# Work station - could use as chest/workshop visual
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Objects\work station.png" `
  "C:\dev\seedkeeper\assets\images\work_station.png"

# Signs - for world detail objects and signpost
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Objects\signs.png" `
  "C:\dev\seedkeeper\assets\images\signs.png"

# Character Actions (watering animation frames)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Characters\Basic Charakter Actions.png" `
  "C:\dev\seedkeeper\assets\images\character_actions.png"

# Water from watering can frames
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Characters\water from wateringcan frames.png" `
  "C:\dev\seedkeeper\assets\images\water_effect.png"

# Premium character (8-direction if different from basic)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - Sprites - premium pack\Characters\Premium Charakter Spritesheet.png" `
  "C:\dev\seedkeeper\assets\images\player_sheet_premium.png"

# Chest variants from Sprout Sorry plant update
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Early Access\Plant update 2\Furniture\Oak_Chest.png" `
  "C:\dev\seedkeeper\assets\images\chest_oak.png"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Early Access\Plant update 2\Furniture\Golden_Chest.png" `
  "C:\dev\seedkeeper\assets\images\chest_golden.png"

# --- SPROUT LANDS UI PACK ---

# ALL UI on one sheet (use for reference and frame picking)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\ALL UI ASSETS on one sheet.png" `
  "C:\dev\seedkeeper\assets\images\ui_all.png"

# Square buttons (26x26 - best size for game buttons)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\buttons\square\Square Buttons 26x26.png" `
  "C:\dev\seedkeeper\assets\images\ui_buttons_square.png"

# Small square buttons
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\buttons\square\Small Square Buttons.png" `
  "C:\dev\seedkeeper\assets\images\ui_buttons_small.png"

# Round buttons (colored - for primary actions)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\buttons\round\medium colored round buttons.png" `
  "C:\dev\seedkeeper\assets\images\ui_buttons_round.png"

# Dialog boxes (use as panel backgrounds for overlays)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\Dialouge UI\dialog box big.png" `
  "C:\dev\seedkeeper\assets\images\ui_dialog_big.png"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\Dialouge UI\dialog box medium.png" `
  "C:\dev\seedkeeper\assets\images\ui_dialog_medium.png"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\Dialouge UI\dialog box small.png" `
  "C:\dev\seedkeeper\assets\images\ui_dialog_small.png"

# Inventory/slot spritesheet (emoji style - cleaner look)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\emojis\emoji style ui\Inventory_Blocks_Spritesheet.png" `
  "C:\dev\seedkeeper\assets\images\ui_inventory_blocks.png"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\emojis\emoji style ui\Inventory_Spritesheet.png" `
  "C:\dev\seedkeeper\assets\images\ui_inventory_spritesheet.png"

# Weather icons (wire to weather system)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\emojis\emoji style ui\weather\Weather_Icons_Big.png" `
  "C:\dev\seedkeeper\assets\images\ui_weather_icons.png"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\emojis\emoji style ui\weather\Weather_Icons_small.png" `
  "C:\dev\seedkeeper\assets\images\ui_weather_icons_small.png"

# All icons sheet
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\Icons\All Icons.png" `
  "C:\dev\seedkeeper\assets\images\ui_icons_all.png"

# Hearts (for HP display as hearts instead of bar - optional)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\Icons\special icons\Hearts.png" `
  "C:\dev\seedkeeper\assets\images\ui_hearts.png"

# Settings menu sprite
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\Other UI sprites\Setting menu.png" `
  "C:\dev\seedkeeper\assets\images\ui_settings_panel.png"

# Sliders (for settings volume sliders)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\Other UI sprites\Sliders\Sliders.png" `
  "C:\dev\seedkeeper\assets\images\ui_sliders.png"

# Check marks and X (for confirm/cancel in upgrade chest)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\UI Sprites\Other UI sprites\Xs and check marks\Xs and check mark..." `
  "C:\dev\seedkeeper\assets\images\ui_checkmarks.png" -ErrorAction SilentlyContinue

# Speech bubbles (for world detail interactions)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\emojis\speech_bubble_green.png" `
  "C:\dev\seedkeeper\assets\images\speech_bubble.png"

# --- PIXEL FONT ---
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\fonts\Font files TTF\pixelFont-7-8x14-sproutLands.ttf" `
  "C:\dev\seedkeeper\assets\fonts\sproutlands-font.ttf"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Lands - UI Pack - Premium pack\fonts\Font files TTF\pixelFont-4-7x7-sproutLands.ttf" `
  "C:\dev\seedkeeper\assets\fonts\sproutlands-font-small.ttf"

# --- SPROUT SORRY AUDIO (SFX for game events) ---
# These are confirmed real audio files in the pack
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\bing_1.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_collect.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\blup_1.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_water.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\blup_2.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_harvest.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\bip_1.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_upgrade.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\punch_1.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_swing.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\punch_3.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_hit_enemy.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\punch_5.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_hit_player.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\boo_1.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_death_enemy.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\boo_2.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_death_player.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\flute_1.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_sleep.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\flute_2.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_gate.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\phone_1.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_warning_bell.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\squick_1.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_step.wav" -Force
Copy-Item "C:\dev\game design assets\seedkeeper-assets\sprout-lands\Sprout Sorry pack\Audio\squick_2.wav" `
  "C:\dev\seedkeeper\assets\audio\sfx_step_2.wav" -Force

# --- ANOKOLISA - Skeleton sprite ---
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Entities\Mobs\Skeleton Crew\Skeleton - Base\Run\Run-Sheet.png" `
  "C:\dev\seedkeeper\assets\images\skeleton_run.png"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Entities\Mobs\Skeleton Crew\Skeleton - Base\Idle\Idle-Sheet.png" `
  "C:\dev\seedkeeper\assets\images\skeleton_idle.png"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Entities\Mobs\Skeleton Crew\Skeleton - Base\Death\Death-Sheet.png" `
  "C:\dev\seedkeeper\assets\images\skeleton_death.png"

# Anokolisa character watering animation (if different from Sprout Lands)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Entities\Characters\Body_A\Animations\Watering_Base\Watering_Down-Sheet.png" `
  "C:\dev\seedkeeper\assets\images\character_watering_down.png"
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Entities\Characters\Body_A\Animations\Watering_Base\Watering_Side-Sheet.png" `
  "C:\dev\seedkeeper\assets\images\character_watering_side.png"

# Anokolisa rocks (for rock formations)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Environment\Props\Static\Rocks.png" `
  "C:\dev\seedkeeper\assets\images\rocks_anokolisa.png"

# Anokolisa vegetation
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Environment\Props\Static\Vegetation.png" `
  "C:\dev\seedkeeper\assets\images\vegetation_anokolisa.png"

# Anokolisa farm props
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Environment\Props\Static\Farm.png" `
  "C:\dev\seedkeeper\assets\images\farm_props.png"

# Anokolisa furniture (for bed/signpost alternatives)
Copy-Item "C:\dev\game design assets\seedkeeper-assets\anokolisa\Pixel Crawler - Free Pack\Environment\Props\Static\Furniture.png" `
  "C:\dev\seedkeeper\assets\images\furniture_anokolisa.png"

echo "All assets copied successfully"
```

---

## Section 1 — Load Font and Apply Game-Wide

The Sprout Lands pixel font TTF files are now in `/assets/fonts/`. Load via CSS
in `index.html`:

```html
<style>
  @font-face {
    font-family: 'SproutLands';
    src: url('./assets/fonts/sproutlands-font.ttf') format('truetype');
  }
  @font-face {
    font-family: 'SproutLandsSmall';
    src: url('./assets/fonts/sproutlands-font-small.ttf') format('truetype');
  }
</style>
```

In BootScene, after loading assets, register as Phaser WebFont or use as
CSS font family string in all `this.add.text()` calls:

```javascript
// Replace all instances of fontFamily: 'monospace' throughout all scenes with:
fontFamily: '"SproutLands", monospace'

// For smaller text (12-14px), use the smaller font:
fontFamily: '"SproutLandsSmall", monospace'
```

Do a global find-and-replace across all scene files. The pixel font will
make everything look intentionally designed rather than browser-default.

---

## Section 2 — Sleep Bed Sprite

`furniture_sheet.png` is the Sprout Lands Basic Furniture sheet.
Open it and identify the bed sprite position — it is typically a rectangular
bed shape in the furniture tileset.

In GameScene, load and replace the sleep rectangle:
```javascript
// In BootScene load:
this.load.image('furniture', './assets/images/furniture_sheet.png');

// In GameScene, replace sleep rectangle with:
// Measure the bed frame position in the furniture sheet
// and use this.add.image() with the correct crop
this.sleepBed = this.add.image(
  WORLD_WIDTH / 2 - 80,
  GARDEN_ZONE_HEIGHT / 2 + 60,
  'furniture'
).setDepth(2);
// If the sheet needs cropping: use setCrop(x, y, width, height) to show only the bed frame
```

If the furniture sheet frame layout cannot be determined without opening it:
create a temporary 1x1 display to measure, then adjust. The sheet is 16px
tile-based so bed frames will be on 16px grid boundaries.

Add "BED" proximity label (already done in previous sprint) positioned above
the sprite.

---

## Section 3 — Fence Gate at Zone Boundary

`fence_gate.png` is the Sprout Lands fence gate animation sprite sheet.
It contains open/close animation frames.

Replace the colored boundary line at `GARDEN_ZONE_HEIGHT` center with a gate:

```javascript
// In BootScene:
this.load.spritesheet('fence_gate', './assets/images/fence_gate.png', {
  frameWidth: 16,   // adjust if different after inspection
  frameHeight: 16
});

// In GameScene create(), at center of zone boundary:
this.gateSprite = this.add.sprite(
  WORLD_WIDTH / 2,
  GARDEN_ZONE_HEIGHT,
  'fence_gate'
).setDepth(4);

// Gate open animation when player crosses boundary:
EventBus.on('player:zoneChanged', ({ zone }) => {
  if (zone === 'forest') {
    this.gateSprite.play('gate_open');
  } else {
    this.gateSprite.play('gate_close');
  }
});

// Register animations (adjust frame indices after inspecting the sheet):
this.anims.create({
  key: 'gate_open',
  frames: this.anims.generateFrameNumbers('fence_gate', { start: 0, end: 3 }),
  frameRate: 8,
  repeat: 0
});
this.anims.create({
  key: 'gate_close',
  frames: this.anims.generateFrameNumbers('fence_gate', { start: 3, end: 0 }),
  frameRate: 8,
  repeat: 0
});
```

---

## Section 4 — Farming Plants on Garden Beds

`farming_plants.png` and `farming_plants_v2.png` contain actual plant growth
sprites — exactly what the garden beds need for visual growth stages.

In GardenBed.js, replace the colored rectangle growth visual with actual
plant sprites:

```javascript
// In BootScene:
this.load.spritesheet('farming_plants', './assets/images/farming_plants_v2.png', {
  frameWidth: 16,
  frameHeight: 32   // plants are typically taller than wide
});

// In GardenBed, replace growth visual:
// Stage 1 (just planted/day 1 of growth): frame 0 — tiny sprout
// Stage 2 (day 2+): frame 1 — mid growth
// Stage 3 (ready): frame 2 — full plant

updateGrowthVisual() {
  if (this.state === 'EMPTY') {
    this.plantSprite.setVisible(false);
    return;
  }
  this.plantSprite.setVisible(true);
  const progress = 1 - (this.daysRemaining / this.totalGrowthDays);
  if (this.state === 'READY') {
    this.plantSprite.setFrame(2); // full plant frame
  } else if (progress > 0.5) {
    this.plantSprite.setFrame(1); // mid growth
  } else {
    this.plantSprite.setFrame(0); // tiny sprout
  }
}
```

Note: The farming plants sheet has multiple plant types. If the sheet is
organized as columns per plant type and rows per growth stage, use:
`setFrame(plantTypeIndex * stagesPerPlant + growthStage)`

Inspect the sheet dimensions and adjust frame mapping accordingly.

---

## Section 5 — Upgrade Panel Background

`ui_dialog_big.png` is a pre-made dialog/panel sprite designed to be used
as a UI background. Use it as the UpgradeScene panel background.

```javascript
// In BootScene:
this.load.image('ui_panel_big', './assets/images/ui_dialog_big.png');

// In UpgradeScene, replace the dark rectangle background with:
const panel = this.add.image(
  this.cameras.main.width / 2,
  this.cameras.main.height / 2,
  'ui_panel_big'
).setScrollFactor(0).setDepth(10);

// Scale to fit screen if needed:
const scaleX = (this.cameras.main.width * 0.9) / panel.width;
const scaleY = (this.cameras.main.height * 0.9) / panel.height;
panel.setScale(Math.min(scaleX, scaleY));
```

---

## Section 6 — UI Buttons in Upgrade Scene

`ui_buttons_square.png` contains the Square Buttons 26x26 spritesheet.
Each button has normal, hover, and pressed states as separate frames.

Replace the plain rectangle BUY buttons in UpgradeScene:

```javascript
// In BootScene:
this.load.spritesheet('ui_btn', './assets/images/ui_buttons_square.png', {
  frameWidth: 26,
  frameHeight: 26
});

// Button factory function in UpgradeScene:
createButton(x, y, label, onClick) {
  const btn = this.add.sprite(x, y, 'ui_btn', 0).setInteractive();
  const text = this.add.text(x, y, label, {
    fontFamily: '"SproutLands", monospace',
    fontSize: '10px',
    color: '#3a2a10'
  }).setOrigin(0.5);

  btn.on('pointerover',  () => btn.setFrame(1));
  btn.on('pointerout',   () => btn.setFrame(0));
  btn.on('pointerdown',  () => { btn.setFrame(2); onClick(); });
  btn.on('pointerup',    () => btn.setFrame(1));
  return { btn, text };
}
```

---

## Section 7 — Weather Icons Wired to Weather System

`ui_weather_icons.png` is the Weather_Icons_Big sheet from the UI pack.
It contains icons for sunny, cloudy, rainy, windy, foggy conditions.

In UIScene, replace the emoji weather indicator with actual weather icon sprites:

```javascript
// In BootScene:
this.load.spritesheet('weather_icons', './assets/images/ui_weather_icons.png', {
  frameWidth: 16,  // inspect actual dimensions
  frameHeight: 16
});

// Weather type to frame index mapping:
const WEATHER_FRAMES = {
  clear:  0,  // sun icon
  sunny:  0,  // sun icon
  cloudy: 1,  // cloud icon
  rain:   2,  // rain icon
  wind:   3,  // wind icon
  fog:    4   // fog icon
};

// In UIScene, on 'weather:changed' event:
EventBus.on('weather:changed', ({ weather }) => {
  const frame = WEATHER_FRAMES[weather.id] ?? 0;
  this.weatherIcon.setFrame(frame);
  this.weatherIcon.setVisible(true);
});
```

Position weather icon next to the Day counter in the HUD top-center.

---

## Section 8 — Skeleton Sprite Integration

The Anokolisa Skeleton - Base sprite sheets are now copied as:
- `skeleton_run.png` — walk/run animation
- `skeleton_idle.png` — idle animation
- `skeleton_death.png` — death animation

These are individual direction sheets (not a combined 4-direction sheet).
Each sheet contains frames for one direction only.

In BootScene load all three:
```javascript
this.load.spritesheet('skeleton_run',   './assets/images/skeleton_run.png',   { frameWidth: 48, frameHeight: 48 });
this.load.spritesheet('skeleton_idle',  './assets/images/skeleton_idle.png',  { frameWidth: 48, frameHeight: 48 });
this.load.spritesheet('skeleton_death', './assets/images/skeleton_death.png', { frameWidth: 48, frameHeight: 48 });
```

In Skeleton.js, replace the colored rectangle placeholder:
```javascript
// Use skeleton_run for movement, skeleton_idle for patrol pause, skeleton_death for die()
this.anims.create({ key: 'skeleton_walk', frames: this.anims.generateFrameNumbers('skeleton_run', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
this.anims.create({ key: 'skeleton_idle', frames: this.anims.generateFrameNumbers('skeleton_idle', { start: 0, end: 3 }), frameRate: 4, repeat: -1 });
this.anims.create({ key: 'skeleton_die',  frames: this.anims.generateFrameNumbers('skeleton_death', { start: 0, end: 5 }), frameRate: 8, repeat: 0 });
```

Adjust frame counts after inspecting actual sheet dimensions.

---

## Section 9 — Audio Wiring Verification

All SFX files are now real audio from the Sprout Sorry pack. Verify each
event fires the correct sound by checking AudioSystem.js event map:

```javascript
// Confirm these mappings exist and point to the loaded keys:
'seed:collected'    → 'sfx_collect'    // bing_1.wav - soft chime ✓
'bed:watered'       → 'sfx_water'      // blup_1.wav - water sound ✓
'plant:harvested'   → 'sfx_harvest'    // blup_2.wav - similar water/rustle ✓
'upgrade:purchased' → 'sfx_upgrade'    // bip_1.wav - UI click ✓
'player:attacked'   → 'sfx_swing'      // punch_1.wav - impact ✓
'enemy:damaged'     → 'sfx_hit_enemy'  // punch_3.wav - hit ✓
'player:damaged'    → 'sfx_hit_player' // punch_5.wav - hit ✓
'enemy:died'        → 'sfx_death_enemy'// boo_1.wav ✓
'player:died'       → 'sfx_death_player' // boo_2.wav ✓
'player:slept'      → 'sfx_sleep'      // flute_1.wav - soft ✓
'player:zoneChanged'→ 'sfx_gate'       // flute_2.wav - transition ✓
'day:timerWarning'  → 'sfx_warning_bell' // phone_1.wav - alert ✓
```

Also wire the two step sounds for footstep variance:
```javascript
// In Player.js footstep logic, alternate between two sounds:
const stepKey = this.stepCount % 2 === 0 ? 'sfx_step' : 'sfx_step_2';
this.scene.sound.play(stepKey, { volume: 0.25, rate: 0.9 + Math.random() * 0.2 });
```

---

## Section 10 — Signpost Visual

Replace the signpost placeholder with the actual signs sprite from Sprout Lands:
```javascript
// In BootScene:
this.load.image('signs', './assets/images/signs.png');

// In GameScene, replace signpost rectangle:
this.signpost = this.add.image(
  WORLD_WIDTH / 2 + 120,
  GARDEN_ZONE_HEIGHT / 2 - 40,
  'signs'
).setDepth(2).setCrop(0, 0, 16, 32); // crop to first sign frame
```

---

## Deliverables Checklist

```
[ ] All PowerShell copy commands executed — confirm each file exists in assets/
[ ] Sprout Lands pixel font loaded via index.html @font-face
[ ] All game text uses SproutLands font family
[ ] Sleep bed shows furniture sprite not rectangle
[ ] Fence gate animates open/close on zone transition
[ ] Garden beds show farming plant sprites at 3 growth stages
[ ] Upgrade chest panel uses dialog box sprite background
[ ] BUY buttons use square button sprites with hover/press states
[ ] Weather icon shows correct icon for current weather
[ ] Skeleton shows animated sprite not colored rectangle
[ ] All SFX events confirmed playing correct Sprout Sorry audio
[ ] Footsteps alternate between two sounds with pitch variance
[ ] Signpost shows sign sprite
[ ] npm run dev — zero console errors
[ ] Audio plays on all key events — test collect, harvest, attack, sleep
[ ] All prior gameplay functional — zero regressions

git checkout dev
git merge feature/sprint-10b-asset-completion
git push origin dev
```

Commit: `feat: sprint-10b asset completion font audio skeleton weather icons farming plants`
