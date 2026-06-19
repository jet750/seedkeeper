# Seedkeeper — Sprint 7: Enemy Drops, Polish & V1.0 Lock

**What this sprint produces:** Enemy plant bundle drops from dark slimes and skeletons. Hard garden boundary that fully prevents slimes from entering the safe zone. An inventory swap picker so players choose which seed to drop when slots are full. Minor polish fixes accumulated across the build. After this sprint passes its checklist, the game is tagged v1.0 and pushed to production.

**Playtestable result:** Complete, polished V1.0. Every system works as designed. Ready for public play at seedkeeper.jaxontravis.com and to send to friends as an MVP.

**Depends on:** Sprint 6 complete and all checklist items passing.

---

You are continuing development of Seedkeeper. This is Sprint 7: Enemy Drops, Polish, and V1.0 Lock. Do not modify any existing systems unless explicitly instructed. This sprint is about targeted fixes and additions only — no architectural changes.

## Sprint 7 Goal

Four focused additions: enemy plant bundle drops, slime zone confinement, inventory swap picker, and a V1.0 polish pass. After checklist passes, tag and ship.

---

## Feature 1 — Enemy Plant Bundle Drops

Dark slimes and skeletons have a chance to drop a "Plant Bundle" — a pre-grown plant that goes directly to the bank, bypassing the grow cycle. This rewards high-risk combat and provides a shortcut for expensive late-game upgrades.

### Bundle Drop Logic — Update Slime.js and Skeleton.js

In `die()` before calling `dropSeeds()`, check for bundle drop:

```javascript
dropBundle() {
  const roll = Math.random();
  const threshold = this.slimeType === 'dark_slime'
    ? this.scene.gameData.enemies.dark_slime.bundleDropChance   // 0.5
    : this.scene.gameData.enemies.skeleton.bundleDropChance;    // 0.7

  if (roll > threshold) return; // no drop

  // Pick a plant type weighted toward expensive ones
  const weights = {
    red_mushroom: 20,
    blue_flower: 20,
    golden_wheat: 15,
    green_herb: 25,   // higher weight — herb is slow-grow and high value
    glowshroom: 15,
    sunflower: 5
  };
  const plantType = this.weightedRandom(weights);

  // Spawn bundle object at death position
  new PlantBundle(this.scene, this.x, this.y, plantType, this.scene.gameData);
}
```

Add to entities.json under each enemy:
```json
"dark_slime": { "bundleDropChance": 0.5, ... },
"skeleton":   { "bundleDropChance": 0.7, ... }
```

### New File: /src/entities/PlantBundle.js

Visually distinct from seeds — use a small rectangle with a glowing pulse tween instead of a circle. Color matches the plant type. Add a small "×1" label above it.

On player overlap:
- Does NOT go into seed slots
- Directly increments `scene.plantBank[plantType]++`
- Emits `bank:updated` with new bank state
- Emits `bundle:collected` `{ plantType, position }` — triggers a green float text "+1 [Plant Name]" and a small particle burst
- Emits `achievement` check for any bank-related achievements
- Self-destructs after collection

Respawn: none. Bundle drops are one-time at enemy death position.

Despawn: bundle auto-destroys after 45 seconds if not collected (slightly longer than seed recovery window). Shrink tween over final 10 seconds as visual warning.

---

## Feature 2 — Slime Zone Confinement Fix

Slimes currently use behavioral avoidance to stay in the forest but can drift into the garden zone. Replace with a hard physics boundary.

### Option A — Physics World Bounds (preferred)

In GameScene, after spawning slimes, add a static physics group as an invisible wall at the zone boundary:

```javascript
createZoneBoundary() {
  // Invisible wall at GARDEN_ZONE_HEIGHT — blocks slimes, not player
  this.slimeBoundary = this.physics.add.staticGroup();
  const wall = this.slimeBoundary.create(
    WORLD_WIDTH / 2,
    GARDEN_ZONE_HEIGHT + 8,
    null   // no texture — invisible
  );
  wall.setSize(WORLD_WIDTH, 16).refreshBody();
  wall.setVisible(false);

  // Add collider for slimes only, not player
  this.physics.add.collider(this.slimes, this.slimeBoundary);
  this.physics.add.collider(this.skeletons, this.slimeBoundary);
}
```

Also add a respawn guard: if any enemy's `y` position is ever detected above `GARDEN_ZONE_HEIGHT` in their update loop, teleport them back to `GARDEN_ZONE_HEIGHT + 50`. This is a safety net for any edge case the wall doesn't catch.

---

## Feature 3 — Inventory Swap Picker

Currently when seed slots are full and player presses F near a new seed, the oldest seed is dropped automatically (FIFO). Replace with a simple visual picker so the player chooses which seed to drop.

### Swap Picker UI — Add to UIScene.js

When `inventory:full` event fires while player is near a collectible seed:

1. Pause seed auto-collection
2. Show a small popup panel near the player's screen position:

```
Swap which seed?
[🔴 Red Mushroom]  [🔵 Blue Flower]  [🟡 Golden Wheat]
[Cancel]
```

Show only filled slots as options. Each button shows the plant color and name.

3. Player clicks a slot button OR presses the number key matching the slot position (1, 2, 3... up to 7)
4. Selected seed drops at player feet as a world Seed object
5. New seed auto-collects into that slot
6. Panel closes

Cancel: closes panel, does not collect the new seed, player can walk away.

Timeout: if player walks more than 80px from the seed before choosing, panel closes automatically and collection is cancelled.

### EventBus changes

Add new event `inventory:swapRequested` `{ newPlantType, position }` — emitted by Seed.js when overlap occurs and slots are full, replacing the old direct FIFO drop.

UIScene listens and shows the picker. On selection, UIScene emits `inventory:swapConfirmed` `{ dropSlotIndex, newPlantType }`. GameScene listens and executes the swap.

---

## Feature 4 — V1.0 Polish Pass

Small targeted fixes only. Do not refactor working systems.

### 4A — Garden Zone Visual Polish
- Ensure the fence boundary line between garden and forest is visually clear — minimum 8px thick colored line or fence tile row if tileset available
- Garden zone background should be noticeably lighter/warmer than forest zone
- If using placeholder colored rects: garden = `#4a7c3f`, forest = `#2d4a2d`

### 4B — HUD Spacing
- Confirm all HUD elements have at least 12px padding from screen edges
- Seed slot row bottom-left: ensure slots don't overlap the screen edge on narrower viewports
- Timer top-right: ensure it doesn't clip on 1280px wide viewports

### 4C — Death Sequence Polish
- On player death, briefly show "Seeds dropped — 30 seconds to recover" text in center screen
- Text fades out after 3 seconds
- This is a UIScene addition listening to `player:died`

### 4D — Menu Polish
- Occupied save slots should show a small row of plant progress icons (6 small colored dots, filled = at least 1 grown, empty = none grown yet)
- Loaded from save metadata — already available in `getSlotsMetadata()`

### 4E — Console Zero Tolerance
- Before tagging v1.0, run `npm run build` and `npm run dev` and confirm zero console errors and zero console warnings
- Fix any warnings found (common: missing physics body cleanup, EventBus listeners not unsubscribed on scene shutdown)

---

## V1.0 Tag and Ship Protocol

After all checklist items pass:

```powershell
# Merge to dev, verify preview
git checkout dev
git merge feature/sprint-7
git push origin dev
npm run dev   # final local verify

# Promote to production
git checkout main
git merge dev
git push origin main   # triggers Vercel production deploy

# Tag the release
git tag -a v1.0-launch -m "Seedkeeper V1.0 — complete game, all systems, achievement system, enemy drops, polished and shipped"
git push origin --tags

# Clean up sprint branches (optional)
git branch -d feature/sprint-1
git branch -d feature/sprint-2
# etc.
```

Verify at `seedkeeper.jaxontravis.com` that:
- Game loads within 3 seconds
- All 5 sprints of content accessible
- No console errors in production build
- Save system persists across page reload
- iframe embed works if portfolio is pointing to subdomain

---

## Deliverables Checklist

```
[ ] Dark slime drops plant bundle on death (50% chance)
[ ] Skeleton drops plant bundle on death (70% chance)
[ ] Plant bundle visually distinct from seed (rectangle, glowing pulse)
[ ] Bundle goes directly to bank on collection — no seed slot used
[ ] "+1 [Plant Name]" float text on bundle collect
[ ] Bundle despawns after 45 seconds with shrink warning
[ ] Slimes cannot enter garden zone — hard physics wall at boundary
[ ] If slime somehow crosses: teleports back to forest immediately
[ ] Full inventory now shows swap picker panel
[ ] Swap picker shows all filled slots as options
[ ] Number keys 1-N select slot to drop
[ ] Cancel option works — no seed dropped, new seed not collected
[ ] Picker closes if player walks away from seed
[ ] Garden zone visually warmer/lighter than forest zone
[ ] Fence boundary clearly visible
[ ] HUD elements all have 12px+ padding from edges
[ ] Death message "Seeds dropped — 30 seconds to recover" appears center screen
[ ] Save slot buttons on menu show plant progress dots
[ ] npm run build — zero errors, zero warnings
[ ] npm run dev — zero console errors, zero console warnings
[ ] git tag v1.0-launch pushed to origin
[ ] seedkeeper.jaxontravis.com loads and plays correctly in production
[ ] No regressions from any prior sprint
```
