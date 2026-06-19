# Seedkeeper — Sprint 8: Asset Integration & Visual Polish

**What this sprint produces:** Real sprite art replaces all placeholder colored
rectangles and circles. Player walks with animated character sprite. Slimes use
actual slime sprites. Garden and forest zones use real tilesets. Game looks like
a real project when shown to friends. Audio plays throughout.

**Playtestable result:** Visually presentable build. All placeholder geometry
replaced with purchased asset pack art. Ready to show as an MVP.

**Depends on:** All fixes passing (fix/death-and-win merged to dev). Sprints 1-7 complete.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-8-assets
```

---

## Before Starting — Read Asset State

First, scan the actual asset files present and report what exists:

```powershell
Get-ChildItem C:\dev\seedkeeper\assets\images\ -Recurse
Get-ChildItem C:\dev\seedkeeper\assets\audio\ -Recurse
```

Also read `src/data/spriteConfig.json` and `src/data/assetManifest.json` to
understand what frame dimensions were measured during the asset organizer session.

Build the entire integration around what is ACTUALLY present. Do not assume
any file exists — verify first. For any file that is missing, keep the existing
placeholder and add a TODO comment. Do not break working gameplay to add art.

---

## Integration Priority Order

Work in this order. Stop and verify gameplay still works after each section
before moving to the next.

### Priority 1 — Player Character (highest visual impact)

Load `player_sheet.png` using frame dimensions from `spriteConfig.json`.

In BootScene, replace placeholder player texture load with:
```javascript
this.load.spritesheet('player', './assets/images/player_sheet.png', {
  frameWidth:  spriteConfig.player.frameWidth,   // from spriteConfig.json
  frameHeight: spriteConfig.player.frameHeight
});
```

In Player.js, create animations from `spriteConfig.player.animations`.
Iterate the animations object and register each:
```javascript
Object.entries(spriteConfig.player.animations).forEach(([key, anim]) => {
  this.scene.anims.create({
    key,
    frames: this.scene.anims.generateFrameNumbers('player', {
      start: anim.start, end: anim.end
    }),
    frameRate: anim.frameRate,
    repeat: anim.repeat
  });
});
```

Play the correct animation based on movement direction and moving/idle state.
If frame layout in spriteConfig looks wrong (character appears as wrong frame
or scrambled), add a `console.log` of the sheet dimensions and adjust frame
indices to match actual layout — do not guess, measure from the file if needed.

### Priority 2 — Slime Sprites

Load `slime_sheet.png` using frame dimensions from spriteConfig.

In Slime.js, replace the colored circle placeholder with the sprite sheet.
Apply `setTint(0x8833cc)` for dark_slime after creation — this is already
in the codebase, just needs to apply to the real sprite instead of the circle.

If the slime sheet has a death animation row, play it in `die()` before the
fade-out tween.

### Priority 3 — Skeleton Sprites

Load `skeleton_sheet.png` if present. Same pattern as slime.
If file is MISSING: keep rectangle placeholder, add TODO, move on.

### Priority 4 — Zone Tilesets (Garden)

Load `tileset_garden.png` as a spritesheet with 16×16 frame size.

Replace the solid green garden rectangle with a tiled background:
```javascript
// Simple repeating tile layer — not a full Tiled map, just a visual fill
const gardenTiles = this.add.tileSprite(
  0, 0,
  WORLD_WIDTH, GARDEN_ZONE_HEIGHT,
  'tileset_garden'
).setOrigin(0, 0);
```

If the tileset has multiple tile types, use frame 0 (first tile) as the base
ground fill. This is a visual improvement only — no collision changes needed.

### Priority 5 — Zone Tilesets (Forest)

Same pattern as garden using `tileset_forest.png`.
Replace solid dark-green forest rectangle with tiled forest ground.

### Priority 6 — Fence / Zone Boundary

Load `tileset_fence.png`.
Replace the colored line at `GARDEN_ZONE_HEIGHT` with a repeating fence sprite row:
```javascript
const fence = this.add.tileSprite(
  0, GARDEN_ZONE_HEIGHT - 8,
  WORLD_WIDTH, 16,
  'tileset_fence'
).setOrigin(0, 0);
```

### Priority 7 — Garden Props

Load `props_garden.png`.
Add scattered decorative props in the garden zone — flowers, rocks, small plants.
These are purely visual, no physics bodies, no interaction.
Place 8-12 props at fixed positions spread across the garden zone.
Use random frames from the props sheet for variety.

### Priority 8 — Forest Props

Same pattern using `props_forest.png`.
Scatter 15-20 props across the forest zone — trees, bushes, rocks.
Do not place props directly on seed spawn positions (check seed positions
from GameScene and maintain at least 40px clearance).

### Priority 9 — Audio

For each audio file present in `/assets/audio/`, verify it loads and plays:

Music:
- `bgm_garden.mp3` — should already be playing in garden, verify volume is 0.4-0.5
- `bgm_forest.mp3` — should crossfade on zone entry, verify 1.5s crossfade works

Key SFX to verify firing on correct events:
- `sfx_collect.wav` on seed collect
- `sfx_harvest.wav` on plant harvest
- `sfx_upgrade.wav` on upgrade purchase
- `sfx_swing.wav` on player attack
- `sfx_hit_enemy.wav` on enemy taking damage
- `sfx_death_enemy.wav` on enemy death
- `sfx_sleep.wav` on player sleep
- `sfx_gate.wav` on zone transition

For any audio file that is present but not playing: check AudioSystem.js
event wiring and fix the connection. Do not add new audio files — only wire
what exists.

---

## UI Polish Pass (no new assets required)

While assets are loading, clean up UI that doesn't need sprites:

**Font rendering:** Ensure all in-game text uses a consistent font.
Phaser default bitmap font is fine — just make it consistent size and color:
- HUD labels: 14px, white `#ffffff`
- Damage float text: 16px bold, red `#ff4444`
- Seed name tags: 12px, white with dark shadow
- Day counter: 18px bold, white

**Chest and sleep object:** Replace plain rectangles with labeled sprites
using props sheets if chest frame is identifiable. If not, add a text label
above each object ("CHEST", "BED") so they're clearly interactive even without
art. These labels should only show when player is within 80px.

**HUD background:** Add a subtle semi-transparent dark bar behind the top HUD
elements (HP bar, day, zone, timer) so they read clearly against any background.
`this.add.rectangle(0, 0, VIRTUAL_WIDTH, 56, 0x000000, 0.45).setOrigin(0,0).setScrollFactor(0)`
Add this in UIScene behind all HUD elements.

**Seed slot bar:** Add a similar dark background bar behind the seed slots
at the bottom-left. Makes slots readable against forest and garden backgrounds.

---

## Depth Sorting

After adding props and tilesets, ensure draw order is correct:
1. Ground tiles (garden + forest) — bottom layer
2. Fence — above ground
3. Props / decorations — above fence
4. Seeds, garden beds, chest, sleep object — above props
5. Player, enemies — above interactive objects
6. Particles, float text — top layer

In Phaser 3 this is controlled by the order `add.*` calls are made in create(),
or by explicitly setting `setDepth(N)` on each object/group. Audit and fix
any z-order issues where player disappears behind props or seeds render above
the player.

---

## Deliverables Checklist

```
[ ] Ran asset scan first — knows exactly what files are present
[ ] Player renders as character sprite not colored square
[ ] Player walk animations play in correct direction
[ ] Player idle animation plays when standing still
[ ] Slime renders as slime sprite not colored circle
[ ] Dark slime is purple-tinted slime sprite
[ ] Garden zone shows tileset texture not solid green rectangle
[ ] Forest zone shows tileset texture not solid dark rectangle
[ ] Fence boundary shows fence sprite row not colored line
[ ] Garden props scattered across garden zone
[ ] Forest props scattered across forest zone
[ ] Props do not cover seed spawn positions
[ ] Garden music audible at correct volume
[ ] Forest music crossfades correctly on zone change
[ ] At least 5 SFX events confirmed playing correctly
[ ] HUD elements have dark background bar for readability
[ ] Seed slot bar has dark background
[ ] Proximity labels on chest and sleep bed if no sprite available
[ ] Draw order correct — player renders above ground tiles and props
[ ] All gameplay still functions — no regressions introduced by art swap
[ ] npm run dev — zero console errors
[ ] Game looks presentable to show to a friend today
```

Commit with message: `feat: sprint-8 asset integration and visual polish`

---

## Post-Sprint: Merge to Main for Friend Demo

After checklist passes:

```powershell
git checkout dev
git merge feature/sprint-8-assets
git push origin dev

# Verify on preview URL — confirm art loads in browser
# Then promote to production:
git checkout main
git merge dev
git push origin main

# Tag it
git tag -a v1.0-demo -m "Seedkeeper v1.0 demo build — assets integrated, ready to show"
git push origin --tags
```
