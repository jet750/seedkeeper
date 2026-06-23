# Seedkeeper — Sprint 9: Game Feel, Watering Overhaul & Water Capacity Upgrade

**What this sprint produces:** Four high-impact game feel additions (hit stop,
magnet collect, contextual F prompts, player idle animation). Watering system
overhauled to have meaningful mechanical depth. Water capacity upgrade path
added to the upgrade chest. Enemy personality micro-tells. Day/night tint.
Contextual chest opening animation. Win condition guard added (forest collect
cannot trigger demo win).

**Playtestable result:** Game feels dramatically more alive and responsive.
Watering is now a meaningful decision not a ritual. Every action has weight.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-9-gamefeel
```

---

## Fix — Win Condition Forest Guard

Before any other changes, add this guard to wherever `plantsGrownEver` is
evaluated for the demo win condition:

```javascript
// Only evaluate win condition when player is in garden zone
checkDemoWin() {
  if (this.player.currentZone !== 'garden') return;
  const allTen = Object.values(this.saveData.plantsGrownEver)
    .every(count => count >= 10);
  if (allTen && !this.saveData.demoWinTriggered) {
    this.saveData.demoWinTriggered = true;
    EventBus.emit('win:demo', {});
  }
}
```

Call `checkDemoWin()` only on `plant:harvested` event — never on
`bundle:collected` or any forest event. Demo win can only trigger
at the moment of harvest in the garden.

---

## Feature 1 — Hit Stop (Highest Priority)

When the player's melee attack connects with an enemy, freeze the game for
4-6 frames (~80ms). This is the single most impactful feel change possible.

In CombatSystem.js, when `enemy.takeDamage()` is called and damage > 0:

```javascript
triggerHitStop(duration = 80) {
  // Pause all physics and tweens
  this.scene.physics.pause();
  this.scene.tweens.pauseAll();

  this.scene.time.delayedCall(duration, () => {
    this.scene.physics.resume();
    this.scene.tweens.resumeAll();
  });
}
```

Call after confirming a hit lands. Do NOT trigger on ranged hits — only melee.
Do NOT trigger on player taking damage — only on player dealing damage.

Scale duration by weapon tier:
- Bare hands: 60ms
- Dagger: 75ms  
- Sword: 90ms

---

## Feature 2 — Magnet Collect (Seeds Arc to Player)

When a seed is within collection range, instead of disappearing on contact,
tween it toward the player over 150ms before destroying.

In Seed.js, on overlap with player:

```javascript
collectWithArc(player) {
  // Disable physics body immediately so it can't double-trigger
  this.body.enable = false;

  // Tween toward player position
  this.scene.tweens.add({
    targets: this,
    x: player.x,
    y: player.y,
    duration: 150,
    ease: 'Quad.easeIn',
    onComplete: () => {
      // Now actually add to inventory
      const added = player.addSeed(this.plantType);
      if (!added) {
        // Slots full — re-enable body and show swap prompt
        this.body.enable = true;
        EventBus.emit('inventory:swapRequested', {
          newPlantType: this.plantType,
          position: { x: this.x, y: this.y }
        });
        return;
      }
      EventBus.emit('seed:collected', {
        plantType: this.plantType,
        position: { x: this.x, y: this.y },
        plantColor: this.scene.gameData.plants[this.plantType].color
      });
      this.destroy();
    }
  });
}
```

Apply same magnet arc to PlantBundle collection.

---

## Feature 3 — Contextual F Prompts

Replace the generic "[F] Interact" with specific contextual text based on
what the player is near and what state it's in.

Create a proximity detection system in GameScene that checks player distance
to all interactable objects each frame and sets the nearest one as "active."
Only one prompt shows at a time — nearest interactable wins.

Prompt text per context:
```javascript
const PROMPTS = {
  bed_empty_has_seed:      '[F] Plant {seedName}',
  bed_empty_no_seed:       'Need a seed to plant',        // shown greyed out
  bed_growing_has_water:   '[F] Water — {days} days left',
  bed_growing_no_water:    '{days} days remaining',       // no F, informational
  bed_watered_already:     'Watered today ✓',             // no F
  bed_ready:               '[F] Harvest {plantName}',
  chest:                   '[F] Open Workshop',
  chest_open:              '[ESC] Close Workshop',
  sleep:                   '[F] Sleep — advance to Day {next}',
  well_no_water:           '[F] Fill watering can',
  well_has_water:          'Watering can full ✓',         // no F
  seed_world:              '[F] Swap for {seedName}',     // only when slots full
  signpost:                '[F] View achievements',
};
```

Render in UIScene as a single text object, center-bottom of screen above the
seed slot bar. Fades in when an interactable is near, fades out when player
walks away. Color: white with dark shadow for readability on any background.

Update existing proximity checks in GardenBed.js, Seed.js, well, chest, sleep
objects to emit `'interact:nearObject'` `{ type, context }` and
`'interact:leftObject'` when player exits range. UIScene listens and updates
the prompt text.

---

## Feature 4 — Player Idle Animation

If the player stands still for 3 seconds without any input, trigger an idle
animation — a gentle bob or look-around.

In Player.js:

```javascript
this.idleTimer = 0;
this.isIdling = false;
this.idleThreshold = 3000; // 3 seconds

update(dt) {
  const moving = /* any WASD key held */;

  if (moving) {
    this.idleTimer = 0;
    this.isIdling = false;
    // play walk animation as normal
  } else {
    this.idleTimer += dt * 1000;
    if (this.idleTimer >= this.idleThreshold && !this.isIdling) {
      this.isIdling = true;
      this.playIdleAnimation();
    }
  }
}

playIdleAnimation() {
  // If sprite sheet has idle frames: play idle_{direction} animation
  // If no idle frames available: do a subtle scale bob tween
  if (this.scene.anims.exists(`idle_${this.facing}`)) {
    this.play(`idle_${this.facing}`);
  } else {
    this.scene.tweens.add({
      targets: this,
      scaleY: 0.92,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }
}
```

Cancel idle on any movement input — stop tween, reset scale to 1.0.

---

## Feature 5 — Enemy Personality Micro-Tells

### Chase Anticipation
Before a slime transitions from WANDER to CHASE, trigger a 150ms pause with
a scale pulse:

```javascript
startChase() {
  // Pause briefly with pulse before chasing
  this.physics.pause(); // pause this enemy only via velocity zero
  this.scene.tweens.add({
    targets: this,
    scaleX: 1.3, scaleY: 1.3,
    duration: 75,
    yoyo: true,
    onComplete: () => {
      this.setState('CHASE');
      // resume movement
    }
  });
}
```

### Wander Personality by Type
- **Green slime:** Long lazy direction holds (3-4s), slow gentle movement,
  occasional full stop (500ms pause mid-wander)
- **Dark slime:** Short sharp direction bursts (0.8-1.2s), pause (400ms),
  burst again. Feels alert and twitchy even when not chasing
- **Skeleton:** Methodical patrol, never deviates, head turns toward player
  when within 200px even while patrolling (setFlipX based on player position)

---

## Feature 6 — Day/Night Tint Shift

On sleep (fade to black → fade in), apply a subtle camera tint based on
day progression. Forest should feel progressively more threatening.

```javascript
applyDayTint(dayNumber) {
  // Garden: warm amber tint that increases slightly each day
  // Forest: cool blue-grey tint that deepens each day
  const gardenWarmth = Math.min(dayNumber * 0.008, 0.06); // caps at 6%
  const forestCool = Math.min(dayNumber * 0.01, 0.08);    // caps at 8%

  // Apply when zone changes
  EventBus.on('player:zoneChanged', ({ zone }) => {
    if (zone === 'garden') {
      this.cameras.main.setTint(
        Phaser.Display.Color.GetColor(
          255,
          Math.floor(255 - gardenWarmth * 50),
          Math.floor(255 - gardenWarmth * 100)
        )
      );
    } else {
      this.cameras.main.setTint(
        Phaser.Display.Color.GetColor(
          Math.floor(255 - forestCool * 80),
          Math.floor(255 - forestCool * 40),
          255
        )
      );
    }
  });
}
```

Subtle — players shouldn't consciously notice, just feel the atmosphere shift.

---

## Feature 7 — Chest Opening Animation

When F is pressed near the chest, play a simple open animation before
launching UpgradeScene.

If chest sprite has a lid frame: tween rotation or frame swap.
If using rectangle placeholder: tween scaleY from 1.0 to 0.85 (lid opens),
hold 200ms, then launch UpgradeScene.

On UpgradeScene close: reverse the animation (lid closes).

Also fix: **ESC key closes UpgradeScene.** In UpgradeScene.js:
```javascript
this.input.keyboard.on('keydown-ESC', () => {
  EventBus.emit('upgrade:closed');
  this.scene.stop();
  this.scene.resume('GameScene');
});
```

---

## Feature 8 — Watering Overhaul

Current watering: cuts remaining time by 33%. This is invisible and
un-engaging. Replace with a probabilistic system that creates excitement
and meaningful decisions.

### New Watering Mechanics

Each time a bed is watered, two independent checks fire:

**Check 1 — Accelerated Growth (always possible)**
```javascript
waterBed(bed) {
  if (bed.daysRemaining <= 0) return; // already ready

  // Base 40% chance to reduce growth by 1 day
  // Scales up with watering can tier
  const canData = player.getWateringCanData();
  const accelerateChance = 0.40 + (canData.tier * 0.10); // 40% / 50% / 60%

  if (Math.random() < accelerateChance) {
    bed.daysRemaining = Math.max(0, bed.daysRemaining - 1);
    EventBus.emit('ui:floatText', {
      x: bed.x, y: bed.y - 20,
      text: '⚡ Grew faster!', color: '#88ff88'
    });
    if (bed.daysRemaining === 0) {
      bed.setState('READY');
      EventBus.emit('ui:floatText', {
        x: bed.x, y: bed.y - 40,
        text: '✓ Ready!', color: '#ffff44'
      });
    }
  }
}
```

**Check 2 — Double Harvest (rare bonus)**
```javascript
  // Separate check: small chance to set doubleHarvest flag
  const doubleChance = 0.08 + (canData.tier * 0.04); // 8% / 12% / 16%

  if (Math.random() < doubleChance) {
    bed.doubleHarvest = true;
    // Visual indicator: small ×2 text floats up, stays near bed
    bed.setDoubleBadge(true); // show a persistent ×2 badge on the bed
    EventBus.emit('ui:floatText', {
      x: bed.x, y: bed.y - 20,
      text: '✨ Double harvest!', color: '#ffaa00'
    });
  }
```

**In GardenBed harvest logic:**
```javascript
harvest() {
  const yield = this.doubleHarvest ? 2 : 1;
  for (let i = 0; i < yield; i++) {
    scene.plantBank[this.plantType]++;
  }
  EventBus.emit('plant:harvested', { plantType: this.plantType, yield });
  EventBus.emit('bank:updated', { bank: { ...scene.plantBank } });
  this.doubleHarvest = false;
  this.setState('EMPTY');
}
```

**Can be watered once per day per bed** — already enforced by existing
`watered` flag that resets on `day:advanced`. No change needed there.

**Visual indicator for double harvest bed:**
Add a small glowing badge (colored dot or ×2 text) above a bed that has
`doubleHarvest = true`. Badge disappears on harvest.

---

## Feature 9 — Water Capacity Upgrade Path

Add a new upgrade track to the sunflower tree (or as a standalone track —
your call, but sunflower's harvest range upgrade feels like the weakest
existing track so this replaces or augments it).

Actually add as a WELL UPGRADES section — upgrade the well itself, not the
can. Thematically cleaner: better well = more water carried per trip.

Add to entities.json:
```json
"well_upgrades": {
  "tiers": [
    { "id": "well_basic",   "name": "Basic Well",    "capacity": 1, "cost": 0,  "currency": null },
    { "id": "well_bucket",  "name": "Deep Bucket",   "capacity": 2, "cost": 4,  "currency": "blue_flower" },
    { "id": "well_cistern", "name": "Rain Cistern",  "capacity": 4, "cost": 10, "currency": "blue_flower" },
    { "id": "well_spring",  "name": "Garden Spring", "capacity": 8, "cost": 18, "currency": "blue_flower" }
  ]
}
```

Blue flower as currency makes thematic sense — blue flower = HP/water/life.

`capacity` = number of watering uses per well visit before needing to return.

In Player.js:
```javascript
this.waterCapacity = 1;   // upgrades increase this
this.waterCharges = 0;    // current charges

fillWater() {
  this.waterCharges = this.waterCapacity;
  EventBus.emit('player:waterFilled', { charges: this.waterCharges, capacity: this.waterCapacity });
}

useWater() {
  if (this.waterCharges <= 0) return false;
  this.waterCharges--;
  EventBus.emit('player:waterUsed', { charges: this.waterCharges, capacity: this.waterCapacity });
  return true;
}
```

UIScene: replace the binary "💧 has water" indicator with a charge counter:
"💧 2/4" showing current charges / max capacity. Updates on both events.

Add well upgrade to UpgradeScene as a 7th panel or as a sub-section of an
existing panel. Use blue_flower as currency.

---

## Feature 10 — Footstep Audio Variance

In Player.js update loop, when player is moving:

```javascript
this.stepTimer += dt * 1000;
if (this.stepTimer >= this.stepInterval) { // stepInterval = 320ms at base speed
  this.stepTimer = 0;
  const pitch = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
  // Play step sound only if sfx_step exists
  if (this.scene.cache.audio.exists('sfx_step')) {
    this.scene.sound.play('sfx_step', { volume: 0.3, rate: pitch });
  }
}
```

Add `sfx_step` to assetManifest.json. If the file doesn't exist in
/assets/audio/ yet, skip silently. Add to CREDITS.md TODO list.

Step interval scales with movement speed — faster boots = faster footstep rate:
`stepInterval = 320 * (baseSpeed / effectiveSpeed)`

---

## Deliverables Checklist

```
[ ] Win condition only evaluates on plant:harvested event in garden zone
[ ] Bundle collect in forest cannot trigger demo win
[ ] Hit stop fires on melee hit — world freezes 60-90ms
[ ] Hit stop duration scales with weapon tier
[ ] Seed arcs toward player before collecting
[ ] Bundle arcs toward player before collecting
[ ] Contextual F prompt shows correct text for each interactable state
[ ] "Need a seed to plant" shows greyed when near empty bed with no seeds
[ ] "[F] Harvest Red Mushroom" shows plant name not generic text
[ ] Player idle animation triggers after 3 seconds of stillness
[ ] Idle cancels immediately on movement
[ ] Green slime wanders lazily with occasional pauses
[ ] Dark slime wanders in sharp bursts with twitchy feel
[ ] Skeleton turns to face player within 200px even while patrolling
[ ] Slimes do scale pulse anticipation before entering chase
[ ] Garden feels subtly warmer than forest in camera tint
[ ] Forest tint deepens slightly with each passing day
[ ] Chest plays open animation before UpgradeScene launches
[ ] ESC key closes upgrade chest correctly
[ ] Watering has 40%+ chance to reduce growth by 1 day
[ ] Accelerated growth shows "⚡ Grew faster!" float text
[ ] Watering has 8%+ chance to set double harvest
[ ] Double harvest shows ×2 badge on bed
[ ] Harvesting double bed gives 2 plants to bank
[ ] Well upgrade track available in upgrade chest using blue flowers
[ ] Well capacity upgrades increase water charges per visit
[ ] HUD shows water charges as "💧 N/Max" not binary indicator
[ ] Footstep sounds play at randomized pitch when moving (if audio file present)
[ ] npm run dev — zero console errors
[ ] All Sprint 1-8 gameplay still functional
```

Commit with message: `feat: sprint-9 game feel watering overhaul water capacity upgrade`
