# Seedkeeper — Sprint 12: New Player Experience & First Impression

**What this sprint produces:** A polished title screen with animated elements.
A gentle first-run tutorial layer that teaches without interrupting. A proper
game logo treatment. Smooth scene transitions throughout. An options/settings
menu. Controller-feel input buffering. The first 90 seconds of a new player's
experience goes from "what do I do" to "oh I get it, this is fun."

**The standard:** A stranger picks this up with zero context and understands
the loop within 2 minutes without reading anything.

**Depends on:** Sprints 10 and 11 complete and on dev.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-12-new-player
```

---

## Feature 1 — Title Screen Overhaul

The current menu is functional. It needs to feel like the opening of a game
people want to play.

### Animated Title Treatment

In MenuScene, replace the plain "SEEDKEEPER" text with a layered title:

```javascript
create() {
  // Background: animated garden scene — soft parallax of garden tiles
  // scrolling slowly left, giving depth behind the title
  this.bgLayer = this.add.tileSprite(0, 0, 1600, 900, 'tileset_garden')
    .setOrigin(0, 0).setScrollFactor(0).setAlpha(0.4);

  // Animate bg
  this.tweens.add({
    targets: this.bgLayer,
    tilePositionX: 200,
    duration: 20000,
    repeat: -1,
    ease: 'Linear'
  });

  // Title text — drop in from above with bounce
  const title = this.add.text(800, -100, 'SEEDKEEPER', {
    fontFamily: 'monospace',
    fontSize: '72px',
    color: '#f5f0e8',
    stroke: '#2a3a1a',
    strokeThickness: 6,
    shadow: { offsetX: 3, offsetY: 3, color: '#000', blur: 8, fill: true }
  }).setOrigin(0.5);

  this.tweens.add({
    targets: title,
    y: 180,
    duration: 800,
    ease: 'Bounce.easeOut',
    delay: 200
  });

  // Subtitle — fade in after title lands
  const subtitle = this.add.text(800, 240,
    'Tend the garden. Brave the forest. Restore the world.',
    {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#b8d4a0',
      alpha: 0
    }
  ).setOrigin(0.5);

  this.tweens.add({
    targets: subtitle,
    alpha: 1,
    duration: 600,
    delay: 900
  });

  // Animated seed icon floating above title (use plant sprite or colored circle)
  const seedIcon = this.add.circle(800, 130, 8, 0x88cc66);
  this.tweens.add({
    targets: seedIcon,
    y: 122,
    duration: 1200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
}
```

### Save Slot UI Polish

Replace plain text buttons with proper slot cards:

```
┌─────────────────────────────┐
│  SLOT 1                     │
│  Day 7  •  23m played       │
│  🌱🌸🌾🌿💜🌻  (progress)  │
│  [CONTINUE]    [DELETE]     │
└─────────────────────────────┘
```

Empty slots:
```
┌─────────────────────────────┐
│         NEW GAME            │
│      [START]                │
└─────────────────────────────┘
```

Delete button: small, red, requires hold-to-confirm (hold 1.5 seconds,
button fills with red, then deletes). Prevents accidental saves loss.
This is a $5 game standard detail — cheap games have instant delete.

---

## Feature 2 — First-Run Tutorial Layer

**Philosophy:** Never pause the game for a tutorial. Never show a wall of text.
Teach through contextual hints that appear exactly when relevant and never again.

### Tutorial System

Create `/src/systems/TutorialSystem.js`:

```javascript
const TUTORIAL_HINTS = [
  {
    id: 'movement',
    trigger: 'game:started',       // fires immediately on first game start
    text: 'WASD to move',
    position: 'center',
    duration: 3000,
    condition: (save) => save.dayNumber === 1 && save.stats.totalSteps === 0
  },
  {
    id: 'forest_gate',
    trigger: 'player:nearGate',    // emit when player within 80px of gate
    text: 'Walk through the gate to enter the forest',
    position: 'above_player',
    duration: 4000,
    condition: (save) => save.dayNumber === 1
  },
  {
    id: 'first_seed',
    trigger: 'player:enteredForest',
    text: 'Walk into glowing seeds to collect them',
    position: 'top_center',
    duration: 4000,
    condition: (save) => save.stats.seedsCollected === 0
  },
  {
    id: 'slots_full',
    trigger: 'inventory:full',
    text: 'Slots full — press F near a seed to swap',
    position: 'above_player',
    duration: 4000,
    condition: (save) => !save.tutorialsSeen.includes('slots_full')
  },
  {
    id: 'return_home',
    trigger: 'inventory:firstFill',  // emit when all slots filled for first time
    text: 'Head back through the gate to plant your seeds',
    position: 'top_center',
    duration: 5000,
    condition: (save) => save.dayNumber === 1
  },
  {
    id: 'plant_bed',
    trigger: 'player:enteredGarden',
    text: 'Press F near a garden bed to plant',
    position: 'top_center',
    duration: 4000,
    condition: (save) => save.stats.plantsPlanted === 0
  },
  {
    id: 'sleep',
    trigger: 'bed:planted',
    text: 'Sleep to advance the day and grow your plants',
    position: 'above_sleep',       // UIScene positions above sleep object
    duration: 5000,
    condition: (save) => save.dayNumber === 1 && save.stats.timesSlept === 0
  },
  {
    id: 'chest',
    trigger: 'plant:harvested',
    text: 'Spend harvested plants at the workshop chest',
    position: 'above_chest',
    duration: 5000,
    condition: (save) => save.stats.upgradesPurchased === 0
  },
  {
    id: 'attack',
    trigger: 'player:firstEnemyContact',  // emit on first slime overlap
    text: 'SPACE to attack',
    position: 'above_player',
    duration: 3000,
    condition: (save) => save.stats.killCount === 0
  },
  {
    id: 'timer',
    trigger: 'day:timerWarning',
    text: 'Timer running low — head back to the garden',
    position: 'top_center',
    duration: 4000,
    condition: (save) => save.dayNumber <= 2
  }
];
```

Each hint:
- Only shows once per save slot (tracked in `save.tutorialsSeen` array)
- Renders as a small semi-transparent pill label — NOT a modal, NOT blocking
- Fades in over 300ms, holds, fades out over 500ms
- Never overlaps another hint — queued with 500ms gap between
- Gone forever once seen — players who know the game never see them again

Add to save schema: `"tutorialsSeen": []`

### Arrow Indicators (First Run Only)

For the first forest entry only, add a subtle pulsing arrow pointing toward
the nearest seed if the player stands still for 5 seconds without collecting
anything. Arrow disappears the moment they move toward a seed.

---

## Feature 3 — Scene Transitions

Currently scenes cut or fade. Every transition should feel intentional.

### Transition Types

**Sleep → Wake:** Already has fade-to-black. Add a brief hold at full black
(300ms) before fade-in. Currently it can feel too fast. Also add a soft
"morning light" warm flash at the end of the fade-in (quick white overlay
at 20% alpha that fades over 400ms) — the visual equivalent of opening
your eyes.

**Menu → Game:** Iris wipe transition — circular mask that expands from center
to reveal the game world. Phaser has built-in camera effects for this:
```javascript
this.cameras.main.fadeIn(800, 0, 0, 0);
// Or use a custom graphics mask tween for iris effect
```

**Death → Respawn:** The current fade is good. Add a brief red vignette
(dark red border overlay, 30% alpha) that pulses once on death, before
the camera fade starts. Communicates "that was bad" viscerally.

**Win → Summary:** Don't hard-cut to the summary screen. Fade the game world
to a soft warm white (not black — feels celebratory not grim) then fade in
the summary screen.

**Gate crossing:** Add a brief screen-edge flash (white, 10% alpha, 200ms)
when the player crosses the garden/forest boundary in either direction.
Subtle zone transition acknowledgment.

---

## Feature 4 — Settings / Options Menu

Add a settings button to the main menu (gear icon, bottom-right corner).
Opens a settings overlay.

```
SETTINGS
────────────────────────────────
Music Volume     [━━━━━●────] 50%
SFX Volume       [━━━━━━━━●─] 80%
Master Volume    [━━━━━━━━━●] 100%

Mute All         [ OFF / ON ]

Controls
  WASD / Arrows  — Move
  SPACE          — Attack
  F              — Interact
  R              — Ranged (once unlocked)
  SHIFT          — Dash (once unlocked)
  ~              — Dev Menu (dev builds only)
  ESC            — Pause / Close
  M              — Mute toggle

────────────────────────────────
            [Close]
```

Volume sliders: click and drag. Values persist in save settings object
(already in save schema from Sprint 5). Apply immediately on change.

Also accessible from the pause menu (ESC in-game — see Feature 5).

---

## Feature 5 — Pause Menu

ESC key during gameplay currently does nothing useful. Add a proper pause.

```javascript
// In GameScene
this.input.keyboard.on('keydown-ESC', () => {
  if (GameState.is('PLAYING')) {
    GameState.transition('PAUSED');
    this.physics.pause();
    this.scene.launch('PauseScene');
  }
});
```

### New Scene: /src/scenes/PauseScene.js

Small centered overlay, semi-transparent dark background:
```
         PAUSED
    ─────────────────
    [Resume]
    [Settings]
    [Return to Menu]
    ─────────────────
    Day 4  •  Forest
```

Resume: close PauseScene, resume physics, transition back to PLAYING.
Settings: launch settings overlay from within PauseScene.
Return to Menu: auto-save first, then transition to MenuScene.

Show current day and zone as context so player remembers where they are.

---

## Feature 6 — Input Buffering (Controller Feel)

Currently if you press SPACE just before your attack cooldown expires,
nothing happens and you have to press again. Input buffering holds the
input for 120ms and fires the attack the moment cooldown clears.

In Player.js:
```javascript
this.attackBuffer = false;
this.attackBufferTimer = 0;
const BUFFER_WINDOW = 120; // ms

update(dt) {
  // Check for attack input
  if (Phaser.Input.Keyboard.JustDown(this.keys.attack)) {
    if (this.attackCooldownRemaining <= 0) {
      this.performAttack();
    } else {
      // Buffer the input
      this.attackBuffer = true;
      this.attackBufferTimer = BUFFER_WINDOW;
    }
  }

  // Drain buffer timer
  if (this.attackBuffer) {
    this.attackBufferTimer -= dt * 1000;
    if (this.attackCooldownRemaining <= 0) {
      this.performAttack();
      this.attackBuffer = false;
    } else if (this.attackBufferTimer <= 0) {
      this.attackBuffer = false; // window expired
    }
  }
}
```

Apply same buffering to dash (Shift key) — buffer window 100ms.
This single change makes combat feel dramatically more responsive
without changing any numbers.

---

## Feature 7 — Visual Consistency Pass

A final audit of anything that still reads as placeholder.

### Check and fix each of these:

**Font consistency:** Every text element in the game should use the same
font family. Audit UIScene, UpgradeScene, MenuScene, WinScene, SignpostScene,
SeedDictScene for any default Phaser Arial/sans-serif text and replace with
the monospace font used in the title.

**Color consistency:** All UI panels should use the same dark background color.
Audit all scene overlays — any that use slightly different rgba values should
be normalized to a single constant defined in Constants.js:
```javascript
export const UI_PANEL_COLOR = 0x1a2410;
export const UI_PANEL_ALPHA = 0.88;
export const UI_BORDER_COLOR = 0x4a6a30;
```

**Text sizing:** Audit all in-game text for consistent sizing hierarchy:
- Headers: 22px
- Body/labels: 16px
- Small/captions: 13px
- Micro/HUD: 12px

Fix any text that is dramatically off this scale.

**HUD alignment:** All HUD elements should be pixel-perfectly aligned to
the same margin from screen edges (16px). Audit and fix any that are at
different offsets.

---

## Deliverables Checklist

```
[ ] Title screen has animated background, bouncing title, subtitle
[ ] Floating seed icon animates above title text
[ ] Save slot cards show day, playtime, plant progress dots
[ ] Empty slots show clean NEW GAME card
[ ] Delete requires 1.5s hold-to-confirm — not instant
[ ] Tutorial hint system fires correct hint at correct moment
[ ] Each hint shows once per save slot and never again
[ ] tutorialsSeen persists in save data
[ ] Movement hint shows on game start (day 1 only)
[ ] Attack hint shows on first enemy contact
[ ] Timer warning hint shows on first timer warning (days 1-2)
[ ] All hints are pill labels not modals — game never pauses for tutorial
[ ] Sleep transition has morning light warm flash on wake
[ ] Menu-to-game has smooth fade-in
[ ] Death has red vignette pulse before fade
[ ] Win transition fades to warm white not black
[ ] Gate crossing has brief edge flash
[ ] Settings menu accessible from main menu
[ ] Volume sliders work and persist across save/reload
[ ] Controls reference visible in settings
[ ] ESC in-game opens pause menu
[ ] Pause menu has Resume, Settings, Return to Menu
[ ] Return to Menu auto-saves before exiting
[ ] Attack input buffering — pressing SPACE just before cooldown clears fires immediately
[ ] Dash input buffering works the same way
[ ] All text uses consistent font family throughout
[ ] UI panel colors normalized to constants
[ ] Text sizing follows hierarchy (22/16/13/12px)
[ ] HUD elements all at 16px margin from screen edges
[ ] npm run dev — zero console errors
[ ] All prior systems functional — zero regressions

git checkout dev
git merge feature/sprint-12-new-player
git push origin dev
```

Commit: `feat: sprint-12 new player experience title screen tutorial pause settings`
