# Seedkeeper — Sprint 13: Perceived Value Polish & Production Ship

**What this sprint produces:** The details that make players say "I can't
believe this was built with AI in days." Screenshake profiles. Enemy death
variety. Garden visual lifecycle. A credits screen. Performance audit.
Production build verified. Pushed to seedkeeper.jaxontravis.com as v1.0.

**The standard:** Ship it. This is the version you send to friends,
embed in your portfolio, and tag as v1.0-release.

**Depends on:** Sprint 12 complete and on dev.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/sprint-13-polish-and-ship
```

---

## Feature 1 — Screenshake Profiles

Currently all screenshake is the same. Different hits should feel different.

In GameScene, replace the single screenshake call with a profile system:

```javascript
const SHAKE_PROFILES = {
  player_hit:      { duration: 250, intensity: 0.004 },
  player_death:    { duration: 500, intensity: 0.010 },
  sword_hit:       { duration: 120, intensity: 0.003 },
  dagger_hit:      { duration: 80,  intensity: 0.002 },
  hands_hit:       { duration: 60,  intensity: 0.001 },
  skeleton_hit:    { duration: 180, intensity: 0.005 }, // hitting a big enemy
  day_timer_expire:{ duration: 400, intensity: 0.006 },
  bundle_collect:  { duration: 80,  intensity: 0.002 },
  upgrade_purchase:{ duration: 150, intensity: 0.003 },
};

shake(profile) {
  const p = SHAKE_PROFILES[profile];
  if (p) this.cameras.main.shake(p.duration, p.intensity);
}
```

Wire each event to the right profile:
- `player:damaged` → `player_hit`
- `player:died` → `player_death`
- Enemy hit by sword → `sword_hit`
- Enemy hit by dagger → `dagger_hit`
- Enemy hit by bare hands → `hands_hit`
- Skeleton specifically takes a hit → `skeleton_hit`
- `day:timerExpired` → `day_timer_expire`
- `bundle:collected` → `bundle_collect`
- `upgrade:purchased` → `upgrade_purchase`

Timer expiry shake is the most impactful new one — players will feel
the moment the forest gets dangerous.

---

## Feature 2 — Enemy Death Variety

Currently all enemies fade out the same way. Add variety by enemy type.

**Green Slime death:**
Current fade is fine. Add a small "splat" — 4 colored blobs (matching
slime color) burst radially 20-30px and shrink to nothing over 400ms.
Feels like a slime popping.

**Dark Slime death:**
Purple particles burst + brief screen desaturate flash (0.15 alpha
dark overlay that fades in 100ms and out over 300ms). Bigger enemy,
bigger moment.

**Skeleton death:**
Bones scatter — 3-4 white rectangles (representing bones) fly outward
at random angles, spin via rotation tween, and fade over 600ms.
Add a brief "rattle" screenshake (`skeleton_hit` profile).
If sfx_death_enemy has a variant for skeleton, use it here — otherwise
play at slightly lower pitch (rate: 0.7) to distinguish from slime death.

All death particles should emit FROM the enemy's position, not the player's.

---

## Feature 3 — Garden Visual Lifecycle

The garden should feel alive and reactive to player investment.

### Planted Bed Growth Stages

GardenBed already tracks daysRemaining. Use this to show three visual
growth stages even before READY state:

```javascript
updateGrowthVisual() {
  const progress = 1 - (this.daysRemaining / this.totalGrowthDays);

  if (progress < 0.33) {
    // Stage 1: tiny sprout — small green circle, 6px
    this.growthSprite.setScale(0.3);
  } else if (progress < 0.66) {
    // Stage 2: growing — medium, 12px
    this.growthSprite.setScale(0.6);
  } else {
    // Stage 3: almost ready — full size, gentle pulse begins
    this.growthSprite.setScale(0.9);
    // Start subtle pulse if not already pulsing
    if (!this.prePulse) {
      this.prePulse = true;
      this.scene.tweens.add({
        targets: this.growthSprite,
        scaleX: 1.0, scaleY: 1.0,
        duration: 800,
        yoyo: true,
        repeat: -1
      });
    }
  }
}
```

Call `updateGrowthVisual()` on plant, on day advance, and on water.

### Harvest Flourish

When a plant is harvested, don't just return the bed to EMPTY instantly.
Add a 400ms flourish first:
- 6 colored particles burst upward from the bed
- Bed briefly flashes white (100ms)
- Then transitions to EMPTY

This makes harvesting feel rewarding rather than transactional.
The particle burst is distinct from the standard harvest burst — 
these should travel upward with gravity (speedY negative, gravityY positive)
so they arc like confetti.

### Watered Bed Visual

When a bed is watered, add a brief water ripple effect:
- 3 expanding circles (using Phaser Graphics) originate from bed center
- Each circle expands from 4px to 24px over 600ms while fading
- Staggered 100ms apart
- Color: `0x44aaff` (water blue)

Currently watering is invisible beyond the float text. This makes it feel
physical.

---

## Feature 4 — Ambient Life in the Garden

Small details that make the safe zone feel inhabited.

### Drifting Particles in Garden

Very subtle floating dust motes or pollen particles in the garden zone:
```javascript
const gardenAmbient = this.add.particles(0, 0, null, {
  // Use a 2x2 white pixel or smallest available texture
  x: { min: 0, max: WORLD_WIDTH },
  y: { min: 0, max: GARDEN_ZONE_HEIGHT },
  speedY: { min: -8, max: -20 },
  speedX: { min: -5, max: 5 },
  scale: { start: 0.8, end: 0 },
  alpha: { start: 0.3, end: 0 },
  lifespan: { min: 3000, max: 6000 },
  frequency: 1200,
  quantity: 1,
  tint: [0xffffaa, 0xaaffaa, 0xffddaa], // warm pollen colors
  depth: 6
});
```

This reads as pollen or dust floating in warm garden light.
Extremely subtle — if it's distracting, reduce frequency to 2000.

### Bee or Butterfly (Optional — if sprite available)

If any asset pack contains a small flying creature sprite (butterfly,
bee, firefly), add 1-2 that drift lazily through the garden zone on
slow random paths. No interaction, no physics — purely ambient life.

If no sprite found: skip this item entirely.

---

## Feature 5 — Combo Counter (Combat Feel)

Track rapid successive hits and show a combo multiplier. Resets on
any 2-second gap between hits or on player taking damage.

```javascript
// In CombatSystem.js
this.comboCount = 0;
this.comboTimer = 0;
const COMBO_RESET_TIME = 2000;

onHitLanded(damage) {
  this.comboCount++;
  this.comboTimer = COMBO_RESET_TIME;

  if (this.comboCount >= 3) {
    // Show combo text in UIScene
    EventBus.emit('combat:combo', { count: this.comboCount, damage });
  }
}

update(delta) {
  if (this.comboCount > 0) {
    this.comboTimer -= delta;
    if (this.comboTimer <= 0) {
      this.comboCount = 0;
      EventBus.emit('combat:comboEnd', {});
    }
  }
}
```

UIScene displays combo as a large temporary text near center-right:
- "3 HIT" — white
- "5 HIT" — yellow
- "10 HIT" — orange, slightly larger
- "MAX!!" at 15+ — red, largest, brief screen flash

Text bounces in (scale 1.3 → 1.0) and fades out if no new hit within
1 second. Each new hit refreshes it. Combo counter resets on player damage.

---

## Feature 6 — Credits Screen

Accessible from the main menu (small "Credits" text link, bottom-left).
Also shown briefly (3 seconds, skippable) on first win before the win screen.

```
SEEDKEEPER
────────────────────────────────────
Design, Development & Creative Direction
  Jaxon Travis

AI-Assisted Development
  Claude (Anthropic) — claude.ai

────────────────────────────────────
ART

Sprout Lands Premium
  Cup Nooble — cupnooble.itch.io

Mystic Woods
  Game Endeavor — game-endeavor.itch.io

Anokolisa Top-Down RPG Pack
  Anokolisa — anokolisa.itch.io

KayKit Forest Nature Pack
  KayKit — kaykit.itch.io

────────────────────────────────────
AUDIO

[List each audio file with creator and source]
All audio CC0 from freesound.org / Pixabay Music

────────────────────────────────────
BUILT WITH

Phaser 3  — phaser.io
Vite      — vitejs.dev

────────────────────────────────────
Made in Carlsbad, California
June 2026

[Close]
```

Read CREDITS.md for the complete audio attribution list and include all
entries. This is a legal requirement for the CC0 audio with credit terms.

---

## Feature 7 — Performance Audit & Optimization

Before shipping, run a full performance pass. Target: stable 60fps on a
mid-range laptop with all effects active.

```javascript
// Add FPS monitor in dev mode only
if (DEV_MODE) {
  this.fpsText = this.add.text(10, 10, '', {
    fontSize: '12px', color: '#00ff00'
  }).setScrollFactor(0).setDepth(1000);
}

update() {
  if (DEV_MODE && this.fpsText) {
    this.fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
  }
}
```

Audit and fix these common performance issues:

**Object pooling verification:** Confirm particles, float text, and
projectiles are pooled (not created/destroyed each frame). If any new()
calls exist inside update loops for these, convert to pool pattern.

**Slime AI throttle:** Confirm slime direction recalculation is throttled
to every 200ms not every frame. Check both wander and the detectRange
distance calculation.

**Static physics bodies:** Rock formations and zone walls should be
staticGroup not dynamic. Verify they're not running physics calculations
every frame.

**Particle emitter cleanup:** Confirm all particle emitters created in
create() are properly destroyed in scene shutdown. Leaked emitters are
the most common Phaser memory issue.

**EventBus listener cleanup:** Audit all scenes for EventBus.on() calls
and confirm matching EventBus.off() calls exist in each scene's shutdown()
or destroy() method.

Run Chrome DevTools Performance tab for 60 seconds of active gameplay
(combat + zone transitions + harvest) and confirm:
- No frame drops below 55fps during normal play
- Memory stays below 150MB over a 10-minute session
- No memory leak trend (memory should plateau, not continuously rise)

---

## Feature 8 — Production Build & Ship

### Pre-Ship Checklist (run manually before tagging)

```powershell
# 1. Ensure DEV_MODE is false for production
# In src/core/Constants.js: export const DEV_MODE = false;
# (Dev menu still accessible via ?dev=true URL param for your own testing)

# 2. Clean build
npm run build
# Confirm: zero errors, zero warnings (Phaser chunk size warning is acceptable)

# 3. Local production test
npx serve dist
# Open in browser, play through:
# - New game start, tutorial hints fire
# - Forest entry, combat, seed collect
# - Return home, plant, water, sleep
# - Open chest, buy an upgrade
# - Confirm no console errors in production build
# - Confirm all audio plays
# - Confirm save persists on page reload

# 4. Iframe test
# Wrap dist/index.html in a simple iframe test page and confirm scaling
```

### vite.config.js — Verify Production Config

```javascript
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser']   // split Phaser into its own chunk for caching
        }
      }
    }
  }
});
```

### Ship Sequence

```powershell
# Merge to dev and verify
git checkout dev
git merge feature/sprint-13-polish-and-ship
git push origin dev
npm run dev  # final local verify

# Set DEV_MODE = false in Constants.js
git add src/core/Constants.js
git commit -m "chore: set DEV_MODE false for production"

# Promote to production
git checkout main
git merge dev
git push origin main   # triggers Vercel production deploy at seedkeeper.jaxontravis.com

# Tag the release
git tag -a v1.0-release -m "Seedkeeper v1.0 — complete, polished, shipped. Built in days."
git push origin --tags

# Verify live
# Open seedkeeper.jaxontravis.com in browser
# Play through the full new player loop
# Confirm on mobile browser (basic layout check)
# Check Vercel dashboard — deployment status green
```

---

## Deliverables Checklist

```
[ ] Screenshake profiles implemented — different hits feel different
[ ] Timer expiry screenshake fires
[ ] Upgrade purchase has subtle shake
[ ] Green slime death has splat particles
[ ] Dark slime death has purple burst + desaturate flash
[ ] Skeleton death has bone scatter particles
[ ] Garden beds show 3 visual growth stages
[ ] Stage 3 bed has pre-pulse before READY state
[ ] Harvest has confetti flourish before returning to EMPTY
[ ] Watering shows ripple circles on bed
[ ] Garden ambient particles (pollen/dust) visible but subtle
[ ] Combo counter shows at 3+ hits
[ ] Combo text scales with hit count (white/yellow/orange/red)
[ ] Combo resets on player damage or 2s gap
[ ] Credits screen accessible from main menu
[ ] Credits lists all asset pack attributions from CREDITS.md
[ ] Credits lists all audio files with creator attribution
[ ] FPS counter visible in DEV_MODE, hidden in production
[ ] No frame drops below 55fps during combat + effects
[ ] Memory stays below 150MB over 10 minutes
[ ] No memory leak trend confirmed in DevTools
[ ] EventBus listeners cleaned up in all scene shutdown() methods
[ ] DEV_MODE = false before production build
[ ] npm run build — zero errors
[ ] npx serve dist — game plays correctly from production build
[ ] All audio plays in production build
[ ] Save persists on page reload in production build
[ ] git push origin main — Vercel deploy triggered
[ ] seedkeeper.jaxontravis.com loads and plays correctly
[ ] git tag v1.0-release pushed
[ ] Zero console errors in production at live URL
[ ] Game is playable on mobile browser (basic layout check)
```

Commit: `feat: sprint-13 polish screenshake enemy deaths garden lifecycle combo credits ship`

**This is v1.0. Ship it.**
