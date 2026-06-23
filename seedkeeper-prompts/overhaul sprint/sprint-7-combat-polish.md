# Sprint 7 — Combat polish: skeleton variants, health bar + level UI, cheat menu

## Context
Playtest of Sprints 4+5 surfaced four targeted fixes before the chest system ships:
1. Skeleton is oversized (~32px) and only one variant — split into two distinct types
2. Level indicator (colored circles) is not immediately readable — replace with
   health bar + floating level number
3. Cheat menu missing: double movement speed, no-clip toggle, max capacity upgrades
4. Skeleton telegraph (red flash + jiggle) reads as a glitch not a wind-up — polish later
   when sword assets are available; pin for a future sprint

## Hard rules
- Do NOT modify economy, marketplace, save schema, plant rendering, or day timer.
- Do NOT add sword animation to skeleton yet — that is explicitly deferred until
  weapon sprite assets are imported.
- All skeleton stat values (HP, damage, speed) live in entities.json — no hardcoded numbers.
- Regression guard: existing combat feel (hit stop, knockback, screenshake, combo) unchanged.

## Builds on
dev post-Sprint 6 (3b+3c+3d merged). Enemy leveling (Sprint 5) is merged —
level system, zone inheritance, and player-power heuristic all exist.

## Tasks

### 1. Branch
```
git checkout dev && git pull && git checkout -b feature/sprint-7-combat-polish
```

### 2. Skeleton variants — standard and mega

**Standard skeleton (new):**
- 16×16 source frame size, scaled 2x in-game (32px rendered)
- White tint to visually distinguish from the mega variant
- Spawns in mid-forest and inner deep-forest zones (closer to the garden)
- Levels 1–3 only
- Same patrol/attack behavior as current skeleton but at correct scale
- Key in entities.json: `skeleton`

**Mega skeleton (existing, repurposed):**
- Keep current oversized sprite as-is — it IS the mega variant, not a bug
- Spawn only in outer deep-forest zones (far perimeter)
- Levels 3–5 only
- Higher HP and damage than standard skeleton (multiplier in entities.json)
- Key in entities.json: `skeleton_mega`
- No tint (natural bone color)

Spawn logic: `spawnSkeleton()` in GameScene checks zone distance — inner deep
forest spawns standard, outer deep forest spawns mega. Both use the existing
skeleton spritesheet assets. Standard skeleton uses a 0.9 white tint
(`setTint(0xeeeeee)`); mega uses no tint.

### 3. Replace level indicator with health bar + level number

Remove the colored-circle pip system from all enemy types. Replace with:

**Floating health bar:**
- Thin rectangle above the enemy sprite (width ~32px, height ~4px)
- Green → yellow → red as HP depletes
- Tracks enemy position every frame (setPosition in update)
- Disappears when enemy dies; only visible when enemy has taken damage OR
  player is within interaction range (~120px) — not always-on to reduce clutter

**Floating level number:**
- Small text `"Lv3"` centered above the health bar
- Color matches danger rating relative to player power (green/yellow/red —
  reuse the existing player-power heuristic from Sprint 5)
- Always visible (not damage-gated) so the player can read threat before engaging
- Font size 8px, scaled 2x, bold

Both elements are created in the enemy constructor and destroyed in the death
handler. Use Phaser `Text` and `Rectangle` game objects parented to the enemy
or updated in the enemy's update loop.

### 4. Cheat menu additions (DevMenuScene)

Add three new cheat options:

**Double movement speed toggle:**
- Button: "2X SPEED [ON/OFF]"
- Toggles player `speedMult` between normal and 2x on each press
- Visual indicator shows current state

**No-clip toggle:**
- Button: "NO-CLIP [ON/OFF]"
- Disables all physics body collision for the player (river, trees, fences)
  while active — `player.body.setCollideWorldBounds(false)` and disable
  relevant colliders
- Re-enables on toggle off or on sleep/respawn
- Clearly labeled as dev-only; does not persist to save

**Max capacity (new — fills the gap in existing "grant all gear"):**
- Button: "MAX CAPACITY"
- Purchases all capacity tiers to maximum:
  - seedBagTier → 5 (max 8 slots)
  - gardenBedTier → 4 (max 8 beds)
  - wateringTier → 3 (max tier)
- Routes through the existing `purchaseCapacity` path from Sprint 2 so
  events fire and UI updates correctly — does not bypass the economy system,
  just calls it at max tier directly

### 5. Pin for future sprint (do NOT implement now)
Add a comment block in Skeleton.js:
```javascript
// TODO Sprint N — sword animation on overhead strike:
// When sword sprite assets are imported, add a sword child sprite
// to the skeleton that animates during the WIND_UP → STRIKE states.
// The telegraph (red flash + jiggle) should be replaced with a
// visible weapon raise so the wind-up reads as intentional not glitchy.
```

## Verification (must pass before merge)
- Standard skeleton spawns in inner zones with white tint at levels 1–3;
  mega skeleton spawns at perimeter at levels 3–5, larger, no tint.
- Health bar floats above all enemy types and depletes correctly.
- Level number shows above health bar, color matches danger rating.
- Circles/pips completely removed from all enemies.
- Cheat menu: 2x speed visibly doubles movement; no-clip lets player
  walk through trees and cross rivers; max capacity bumps all three
  capacity trees to their ceilings and updates the marketplace UI.
- Combat feel (hit stop, knockback, screenshake, combo counter) unchanged.
- No hardcoded stat values — all in entities.json.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: skeleton variants (standard+mega), health bar + level display, cheat menu speed/noclip/max-capacity"
git checkout dev
git merge feature/sprint-7-combat-polish
git push origin dev
```
Do NOT merge or push to main.
