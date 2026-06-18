# Seedkeeper — Sprint 5: Polish, Win State & Ship

**What this sprint produces:** Win conditions trigger correctly. Full audio throughout. Particle effects on all key moments. Tiled tilemap replaces placeholder geometry. New Game+ implemented. Game builds to /dist/ and runs in a portfolio iframe.

**Playtestable result:** Complete, shippable game from start to win. Ready for portfolio embed.

**Depends on:** Sprint 4 complete and all checklist items passing.

---

You are continuing development of Seedkeeper. This is Sprint 5: Polish, Win State, and Ship. The project is functionally complete from Sprint 4. This sprint brings it from "functional" to "shippable portfolio piece." Do not break any existing systems.

## Sprint 5 Goal

Win conditions, audio, particle polish, tilemap, deployment build. Every player action should have audio and visual feedback. The game should feel finished.

## Win Conditions

### Demo Win — grow one of each 6 plant types

In GardenBed.js harvest logic, after updating `plantsGrownEver`:
```javascript
const allGrown = Object.values(saveData.plantsGrownEver).every(count => count >= 1);
if (allGrown && !saveData.demoWinTriggered) {
  saveData.demoWinTriggered = true;
  EventBus.emit('win:demo', {});
}
```

### Full Win — all 6 upgrade trees with both stat AND gear maxed

In UpgradeScene after any purchase:
```javascript
const allMaxed = Object.entries(gameData.upgrades).every(([plantType, tree]) => {
  const statMaxed = saveData.upgrades[plantType].stat >= tree.stat.levels;
  const gearMaxed = saveData.upgrades[plantType].gear >= (tree.gear.tiers.length - 1);
  return statMaxed && gearMaxed;
});
if (allMaxed) EventBus.emit('win:full', {});
```

## New Scene: /src/scenes/WinScene.js

Launched over GameScene on `'win:demo'` or `'win:full'`. Receives `winType` param.

### Demo Win Content
```
"The forest stirs."

[6 plant icons animate in one by one with a soft chime each]

Days Survived: [N]
Enemies Defeated: [N]  
Upgrades Purchased: [N]
Plants Grown: [list]

[Continue Playing]    [Return to Menu]
```

[Continue Playing]: close WinScene, set `saveData.newGamePlus = true`, save, continue game. Emit `'newGamePlus:activated'`.

[Return to Menu]: save, transition to MenuScene.

### Full Win Content
Slightly more elaborate — garden bloom animation (tween all bed colors to bright), then:
```
"You have become the Seedkeeper."

[All 12 upgrade icons glow in sequence]

[Final Stats Summary]

[New Game]    [Return to Menu]
```

## New Game+

On `'newGamePlus:activated'`:
- `saveData.newGamePlus = true`
- `enemyDensityMult = 1.2` (20% more enemies per day)
- Small persistent HUD indicator (star icon ⭐ or "NG+" text in corner)
- GameScene applies density mult on all future `day:advanced` spawns

Add to entities.json: `"newGamePlus": { "enemyDensityMult": 1.2 }`

## Full Audio Implementation

All audio files should be in /assets/audio/ — see asset checklist. Load via assetManifest.json.

### Music Crossfade (already partially implemented — complete it)
```javascript
// In GameScene, triggered by 'player:zoneChanged'
crossfadeMusic(from, to) {
  this.sound.get(from).setVolume(this.masterVolume * this.musicVolume);
  this.tweens.add({
    targets: this.sound.get(from),
    volume: 0, duration: 1500,
    onComplete: () => this.sound.get(from).pause()
  });
  this.sound.get(to).resume();
  this.sound.get(to).setVolume(0);
  this.tweens.add({ targets: this.sound.get(to), volume: this.masterVolume * this.musicVolume, duration: 1500 });
}
```

### SFX Event Wiring — create /src/systems/AudioSystem.js

AudioSystem listens to EventBus events and plays SFX. Mount in GameScene.

```javascript
// Wire all events to SFX
const sfxMap = {
  'seed:collected':    'sfx_collect',
  'plant:harvested':   'sfx_harvest',
  'upgrade:purchased': 'sfx_upgrade',
  'player:attacked':   'sfx_swing',
  'enemy:damaged':     'sfx_hit_enemy',
  'player:damaged':    'sfx_hit_player',
  'enemy:died':        'sfx_death_enemy',
  'player:died':       'sfx_death_player',
  'player:zoneChanged':'sfx_gate',
  'player:slept':      'sfx_sleep',
  'bed:watered':       'sfx_water',
};

Object.entries(sfxMap).forEach(([event, sfxKey]) => {
  EventBus.on(event, () => this.scene.sound.play(sfxKey, { volume: this.sfxVolume }));
});

// Special: day timer warning events
EventBus.on('day:timerWarning', () => this.scene.sound.play('sfx_warning_bell', { volume: this.sfxVolume }));
EventBus.on('day:timerUrgent', () => {
  // Loop urgent sound until resolved
  if (!this.urgentSound) {
    this.urgentSound = this.scene.sound.add('sfx_urgent_pulse', { loop: true, volume: this.sfxVolume });
    this.urgentSound.play();
  }
});
EventBus.on('day:advanced', () => {
  if (this.urgentSound) { this.urgentSound.stop(); this.urgentSound = null; }
});
```

**Volume settings** — stored in saveData:
```json
"settings": { "masterVolume": 1.0, "sfxVolume": 0.8, "musicVolume": 0.5, "muted": false }
```

M key toggles `settings.muted`. When muted: all sounds pause. UIScene shows mute indicator.

## Particle Effects — Complete ParticleSystem.js

All particles use pooled simple geometry (rectangles or circles) — no external particle library required.

### Seed Collect Burst
6 particles in plant color, burst radially, fade over 500ms. Radius: 30px.

### Plant Harvest Burst
8 green sparkle particles, slightly larger, fade over 700ms. Emit upward bias.

### Upgrade Purchase Burst
10 star-shaped particles (or small diamonds) in plant color from chest position. Larger radius (60px), longer duration (900ms).

### Player Death Burst
8 grey particles, slow burst, 800ms fade.

### Dash Trail (if not already done)
3 ghost images behind player, alpha 0.3, blue-tint, fade over 300ms.

Hook all bursts to EventBus events in GameScene:
```javascript
EventBus.on('seed:collected', (d) => particleSystem.seedCollect(d.position, d.plantColor));
EventBus.on('plant:harvested', (d) => particleSystem.harvestBurst(gardenBedPosition));
EventBus.on('upgrade:purchased', (d) => particleSystem.upgradeBurst(chestPosition, d.plantColor));
EventBus.on('player:died', () => particleSystem.deathBurst(player.x, player.y));
```

## Tiled Tilemap Integration (if world.json is ready)

If `/assets/tilemaps/world.json` exists, replace placeholder geometry with real tilemap:

```javascript
// In GameScene create():
const map = this.make.tilemap({ key: 'world' });
const gardenTiles = map.addTilesetImage('tileset_garden', 'tileset_garden');
const forestTiles = map.addTilesetImage('tileset_forest', 'tileset_forest');
const fenceTiles  = map.addTilesetImage('tileset_fence',  'tileset_fence');

const groundLayer     = map.createLayer('ground',     [gardenTiles, forestTiles]);
const decorLayer      = map.createLayer('decoration', [gardenTiles, forestTiles]);
const collisionLayer  = map.createLayer('collision',  [gardenTiles, forestTiles, fenceTiles]);
collisionLayer.setCollisionByProperty({ collides: true });
this.physics.add.collider(this.player, collisionLayer);
this.physics.add.collider(this.enemies, collisionLayer);

// Extract object layer positions for seeds, beds, gate, chest, well, sleep
const objects = map.getObjectLayer('objects').objects;
objects.forEach(obj => {
  if (obj.type === 'seed_spawn') { /* place seed */ }
  if (obj.type === 'garden_bed') { /* place bed */ }
  // etc.
});
```

**If world.json not yet created:** leave placeholder geometry in place. Add a comment `// TODO Sprint 5: replace with Tiled map`. Tiled is free at mapeditor.org — create the map between Sprint 4 and 5.

## Performance Audit

Before considering Sprint 5 complete, run Chrome DevTools Performance tab for 60 seconds of active gameplay.

Targets: stable 60fps, <3s initial load, <100MB memory.

Common fixes:
- Slime AI: throttle direction recalculation to every 200ms, not every frame
- Particles: ensure pool reuse, not create/destroy per effect
- Ensure no `new` calls inside update loops (except intentional spawns)
- Tilemap static physics bodies (not dynamic)

## Deployment Configuration

**vite.config.js** — ensure relative asset paths for iframe hosting:
```javascript
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
```

**index.html** — add viewport meta:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

**Build command:** `npm run build` → produces `/dist/`

**Test dist locally:** `npx serve dist` → open in browser → verify everything works with no server-side dependencies.

**Verify iframe embed:** test in a simple HTML page:
```html
<iframe src="./dist/index.html" width="1280" height="720" frameborder="0"></iframe>
```

Game should scale correctly and all assets load with relative paths.

**Portfolio embed code** (add to CREDITS.md for reference):
```html
<iframe
  src="https://[your-domain]/games/seedkeeper/"
  width="100%"
  height="600"
  frameborder="0"
  allowfullscreen
  style="max-width: 1600px; aspect-ratio: 16/9; border: none;">
</iframe>
```

## Deliverables Checklist

```
[ ] Demo win triggers when all 6 plant types grown at least once
[ ] Win scene shows stat summary and plant icons animating in
[ ] [Continue Playing] enables New Game+ (NG+ indicator in HUD)
[ ] New Game+ has visibly more enemies from day 1
[ ] Full win triggers when all 12 upgrade tracks maxed
[ ] Full win scene plays distinct sequence
[ ] All SFX play on correct events (test each one)
[ ] Garden/forest music crossfades on zone change
[ ] Urgent timer sound loops until day advances
[ ] M key toggles mute, persists in save
[ ] Particle burst on seed collect (plant color)
[ ] Particle burst on plant harvest (green)
[ ] Particle burst on upgrade purchase (plant color)
[ ] Dash ghost trail visible
[ ] Stable 60fps in DevTools with all effects active
[ ] npm run build completes without errors
[ ] /dist/index.html opens in browser without a dev server
[ ] All assets load correctly from /dist/
[ ] Game fits and scales in a 16:9 iframe
[ ] CREDITS.md is complete with all asset attributions
[ ] No regressions from any prior sprint
[ ] Console has zero errors in production build
```

## Post-Sprint: Deploy to Portfolio

1. Upload `/dist/` contents to your web host at `/games/seedkeeper/`
2. Add iframe embed to your portfolio page
3. Test on Chrome, Firefox, Safari
4. Share URL — you've shipped a game
