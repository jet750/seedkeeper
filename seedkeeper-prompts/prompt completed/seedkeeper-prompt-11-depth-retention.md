# Seedkeeper — Sprint 11: Systemic Depth & Retention Layer

**What this sprint produces:** Weather system with daily modifiers. Discoverable
world detail objects in the forest. Daily special seed tied to real-world date.
Run summary screen after win. Seed dictionary that fills as you explore.
Rock formation obstacles with chase geometry. Character tool-use animations.
These additions make the game feel like a living world with systems the player
doesn't fully control, and give reasons to return across multiple sessions.

**Playtestable result:** Every session feels distinct. Players have reasons to
return daily. Win screen is shareable. Forest rewards exploration.

**Depends on:** Sprint 10 complete and committed to dev.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-11-depth-retention
```

---

## Feature 1 — Weather System

One random weather event per in-game day, announced at wake-up via a toast
notification. Purely a modifier on existing systems — no new mechanics,
no new UI beyond the toast.

### Weather Pool

Add to entities.json:
```json
"weather": [
  {
    "id": "cloudy",
    "name": "Cloudy Day",
    "description": "Overcast skies slow plant growth today.",
    "effect": "growthPenalty",
    "value": 1
  },
  {
    "id": "rain",
    "name": "Rain Overnight",
    "description": "The rain watered everything. All beds get a free charge.",
    "effect": "freeWater",
    "value": 1
  },
  {
    "id": "sunny",
    "name": "Bright Sun",
    "description": "Perfect growing conditions. Growth chance increased today.",
    "effect": "growthBonus",
    "value": 0.15
  },
  {
    "id": "fog",
    "name": "Forest Fog",
    "description": "Enemies are disoriented. Detect range reduced today.",
    "effect": "enemyDetectMult",
    "value": 0.6
  },
  {
    "id": "wind",
    "name": "Strong Wind",
    "description": "Seeds drift further today. Respawn timers shortened.",
    "effect": "respawnMult",
    "value": 0.7
  },
  {
    "id": "clear",
    "name": "Clear Day",
    "description": "Nothing unusual. A good day to explore.",
    "effect": "none",
    "value": 0
  }
]
```

### Weather Selection and Application

In DaySystem.js `advanceDay()`:
```javascript
selectWeather() {
  const pool = this.gameData.weather;
  // Weight "clear" at 3x to keep special weather feeling meaningful
  const weighted = [...pool, ...Array(2).fill(pool.find(w => w.id === 'clear'))];
  this.todayWeather = weighted[Math.floor(Math.random() * weighted.length)];
  EventBus.emit('weather:changed', { weather: this.todayWeather });
}
```

Apply effects via EventBus listeners in GameScene:
- `growthPenalty`: on next `day:advanced`, add 1 to all growing beds' daysRemaining
- `freeWater`: immediately set all beds `watered = true` and emit `bed:watered` for each
- `growthBonus`: add 0.15 to watering accelerate chance for this day only
- `enemyDetectMult`: multiply all enemy detectRange by 0.6 for this day
- `respawnMult`: multiply all seed respawnDelay by 0.7 for this day
- `none`: no effect

### Weather Display

UIScene listens to `weather:changed` and `player:slept`:

On wake-up (after sleep fade-in), show a weather toast that persists
for 5 seconds (longer than achievement toasts):
```
☁️ Cloudy Day
"Overcast skies slow plant growth today."
```

Add a small persistent weather icon in the HUD top-center area next to
the Day counter. Updates each day. Clears on menu return.

Save today's weather ID in save data so it persists on reload:
```json
"todayWeather": "rain"
```

---

## Feature 2 — Discoverable World Details

Small static objects placed at fixed positions in the forest that trigger
a brief text popup on F key interaction. No gameplay effect — pure
environmental storytelling.

### World Detail Objects

Create `/src/entities/WorldDetail.js`:
```javascript
export default class WorldDetail {
  constructor(scene, x, y, config) {
    // config: { sprite, frame, title, text, width }
    this.scene = scene;
    this.sprite = scene.add.image(x, y, config.sprite, config.frame)
      .setDepth(2);
    this.interactRange = 56;
    this.config = config;
    this.popupVisible = false;
  }

  checkInteract(player) {
    const dist = Phaser.Math.Distance.Between(
      player.x, player.y, this.sprite.x, this.sprite.y
    );
    if (dist < this.interactRange) {
      EventBus.emit('interact:nearObject', {
        type: 'world_detail',
        label: `[F] Examine`
      });
    }
  }

  interact() {
    EventBus.emit('worlddetail:opened', {
      title: this.config.title,
      text: this.config.text
    });
  }
}
```

UIScene listens to `worlddetail:opened` and shows a small centered panel:
```
[Title]
────────────────
[Text — max 3 sentences, italic, naturalist voice]

              [Close]
```

Auto-closes after 6 seconds or on F/ESC.

### World Detail Placements

Place these at fixed world coordinates in the forest. Use props sprites
from Mystic Woods or Sprout Lands for the visual — pick the closest
matching sprite for each:

```javascript
const WORLD_DETAILS = [
  {
    x: /* near forest entrance */,
    sprite: 'props_forest', frame: /* fence post frame */,
    title: "An Old Marker",
    text: "A weathered post, half-rotted into the soil. Something is carved into the wood — initials, maybe, or a tally. It's been here longer than the overgrowth."
  },
  {
    x: /* mid forest, near water area */,
    sprite: 'props_forest', frame: /* rock frame */,
    title: "Stacked Stones",
    text: "Seven flat stones balanced deliberately on top of each other beside the stream. Someone took care with this. The moss on the bottom stone is years old."
  },
  {
    x: /* deep forest */,
    sprite: 'props_forest', frame: /* fallen log frame */,
    title: "A Fallen Giant",
    text: "The tree must have come down in a storm — the root ball is still half-raised from the earth, trailing soil like a torn hem. New saplings are already growing from the trunk."
  },
  {
    x: /* near skeleton zone */,
    sprite: 'props_forest', frame: /* gravestone frame or rock */,
    title: "Something Buried",
    text: "A flat stone lies flush with the ground, deliberate in a way that natural stones aren't. Whatever was placed here was placed with intention."
  },
  {
    x: /* glowshroom area, deep forest */,
    sprite: 'props_garden', frame: /* small object frame */,
    title: "A Rusted Can",
    text: "A watering can, orange with rust, wedged between two roots. The spout is still pointed at a patch of earth where nothing grows anymore."
  }
];
```

Adjust x/y coordinates to fit your actual world map layout. Each should
be at least 100px from seed spawns and not blocking main pathways.

---

## Feature 3 — Daily Special Seed

One guaranteed rare seed spawns per real-world calendar day at a
semi-random but deterministic position. No backend required — position
seeded from current date string.

In GameScene create():
```javascript
spawnDailySpecialSeed() {
  // Generate deterministic position from today's date
  const dateStr = new Date().toDateString();
  const hash = dateStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

  // Position within deep forest zone, deterministic but varied
  const x = 400 + (hash % (WORLD_WIDTH - 800));
  const y = GARDEN_ZONE_HEIGHT + 600 + (hash % (WORLD_HEIGHT - GARDEN_ZONE_HEIGHT - 800));

  // Plant type — cycles through rarer types
  const rarePlants = ['glowshroom', 'green_herb', 'glowshroom', 'green_herb', 'blue_flower'];
  const plantType = rarePlants[hash % rarePlants.length];

  // Spawn with distinctive visual
  const seed = new Seed(this, x, y, plantType, this.gameData);
  seed.setScale(1.4); // slightly larger than normal
  seed.setTint(0xffffff); // white tint to make it glow
  seed.isDailySpecial = true;

  // Pulsing glow effect
  this.tweens.add({
    targets: seed,
    alpha: 0.6,
    duration: 800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

  // Custom name tag
  seed.nameTagOverride = '✨ Today\'s Gift';
}
```

Daily special seed does NOT respawn — once collected it's gone until
tomorrow. Track in save data:
```json
"dailySeedCollected": "Fri Jun 20 2026"
```

On game load: if `dailySeedCollected === new Date().toDateString()`,
do not spawn the daily seed. Otherwise spawn it.

UIScene: on first forest entry each day, show a brief toast:
"✨ A special seed has appeared somewhere in the forest today."
Only show once per day — flag in save data.

---

## Feature 4 — Run Summary Screen

After demo win or full win, before showing the win screen buttons,
display a one-page run summary. Add to WinScene.

```
═══════════════════════════════
      YOUR RUN — DAY [N]
═══════════════════════════════

Days Survived          [N]
Enemies Defeated       [N]  (Green [N] · Dark [N] · Skeleton [N])
Seeds Collected        [N]
Plants Grown           [N]
Times Died             [N]
Upgrades Purchased     [N]

First Plant Grown      [Plant Name]
Rarest Find            [Plant Name] (based on weight table)

═══════════════════════════════
```

Data sources: all from save stats already being tracked. Add to save schema:
```json
"stats": {
  "killCount": 0,
  "killsByType": { "green_slime": 0, "dark_slime": 0, "skeleton": 0 },
  "seedsCollected": 0,
  "upgradesPurchased": 0,
  "firstPlantGrown": null,
  "deathCount": 0
}
```

Emit stat increments via EventBus in the relevant systems — they're already
tracking most of this for achievements, just needs save persistence.

Add `[N] / 31 Achievements` line at the bottom as a secondary hook.

Display runs for 4 seconds automatically then reveals the win screen buttons,
OR add a [View Details] button on the win screen that shows this panel on demand.

---

## Feature 5 — Seed Dictionary

A second interactive object in the garden — a small journal or book on a
stand near the signpost. F key opens the Seed Dictionary overlay.

### New Scene: /src/scenes/SeedDictScene.js

Full-screen overlay, same style as SignpostScene.

**Header:** "SEED DICTIONARY" — "[N] / 6 Discovered"

**Layout:** 6 plant entries in a 2×3 grid. Each entry:
- **Discovered:** Full color plant icon + name + where it grows + growth days +
  "Used for: [upgrade tree name]" + count grown ever
- **Undiscovered:** Silhouette icon + "???" — unlocks when first seed of that
  type is collected

```javascript
// Unlock condition: first time seed:collected fires for a new plant type
EventBus.on('seed:collected', ({ plantType }) => {
  if (!saveData.discoveredPlants.includes(plantType)) {
    saveData.discoveredPlants.push(plantType);
    EventBus.emit('dictionary:newEntry', { plantType });
    // Show small toast: "📖 New entry: Red Mushroom"
  }
});
```

Add to save schema: `"discoveredPlants": []`

Add journal/book object to garden zone. Visually distinct from signpost —
use a different prop sprite if available, or label it "FIELD NOTES" with
a text sign above it.

ESC or [Close] to dismiss.

---

## Feature 6 — Rock Formation Obstacles

Place 4-6 rock formation clusters in the forest as physics obstacles.
These create natural cover geometry — players can break line of sight
with enemies by routing around rocks.

```javascript
createRockFormations() {
  const formations = [
    { x: 800,  y: GARDEN_ZONE_HEIGHT + 400, count: 3 },
    { x: 2400, y: GARDEN_ZONE_HEIGHT + 800, count: 4 },
    { x: 1200, y: GARDEN_ZONE_HEIGHT + 1200, count: 3 },
    { x: 2800, y: GARDEN_ZONE_HEIGHT + 600, count: 5 },
  ];

  formations.forEach(({ x, y, count }) => {
    for (let i = 0; i < count; i++) {
      const rx = x + (Math.random() - 0.5) * 120;
      const ry = y + (Math.random() - 0.5) * 80;
      const rock = this.physics.add.staticImage(rx, ry, 'props_forest', /* rock frame */);
      rock.setDepth(3);
      rock.refreshBody();
      this.physics.add.collider(this.player, rock);
      this.physics.add.collider(this.enemies, rock);
    }
  });
}
```

Adjust positions to ensure rocks don't block seed spawn points or make
areas unreachable. Each cluster should feel like a natural geographic
feature, not a random obstacle.

---

## Feature 7 — Character Tool-Use Animations

If the Sprout Lands character sheet contains tool-use animation rows
(watering, digging, interacting), wire them to the appropriate actions.

Check spriteConfig.json for available animation frames. If tool animations
exist:

**Watering animation:** Play when F is pressed at a garden bed while holding
water charges. Duration matches the watering action (~600ms). Return to idle
after completion.

**Interact animation:** Play briefly (300ms) when F is pressed at any
interactable. A short reach-out or examine gesture.

If animations don't exist in the sheet: skip this feature entirely.
Do not substitute with scale tweens — the idle bob from Sprint 9 is enough.

---

## Deliverables Checklist

```
[ ] Weather event selected each day on advanceDay()
[ ] Weather toast shows on wake-up with icon and description
[ ] Weather icon persists in HUD for current day
[ ] Weather effects apply correctly (test cloudy/rain/fog at minimum)
[ ] 5 world detail objects placed in forest at varied positions
[ ] F key near world detail shows title and 3-sentence text panel
[ ] Panel auto-closes after 6 seconds
[ ] Daily special seed spawns at deterministic position each calendar day
[ ] Daily seed is larger and glowing vs normal seeds
[ ] "✨ A special seed has appeared" toast shows on first forest entry
[ ] Daily seed tracks collection in save — does not respawn same day
[ ] Run summary shows after win before win screen buttons
[ ] Summary shows correct kill counts by type
[ ] Summary shows seeds collected, plants grown, deaths, upgrades
[ ] Seed dictionary object in garden zone, F key opens overlay
[ ] Undiscovered plants show as silhouette + ???
[ ] Discovering new seed type unlocks dictionary entry with toast
[ ] Dictionary shows grow time, upgrade use, count grown for discovered plants
[ ] 4-6 rock formation clusters in forest with physics colliders
[ ] Player collides with rocks — cannot walk through
[ ] Enemies collide with rocks — chase routes around them
[ ] Rocks don't block seed spawn positions or create unreachable areas
[ ] Tool-use animations play on water/interact if frames available
[ ] All Sprint 1-10 gameplay functional — zero regressions
[ ] npm run dev — zero console errors
```

Commit with message: `feat: sprint-11 weather system daily seed run summary seed dictionary rock obstacles`
