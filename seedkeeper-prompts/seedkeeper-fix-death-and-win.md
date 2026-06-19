# Seedkeeper — Fix: Death System & Win Condition Rebalance

**What this fixes:**
1. Seeds not dropping on player death — retained in inventory incorrectly
2. Day does not advance when player dies — should cost one day as consequence
3. Demo win condition too easy — triggering on 1 of each plant, raised to 10 of each
4. New Game+ threshold moved to full upgrade tree completion only

**Branch:** Cut from dev as `fix/death-and-win`

Before writing any code:
```powershell
git checkout dev
git pull origin dev
git checkout -b fix/death-and-win
```

---

## Fix 1 — Seed Drop on Death

In GameScene, the `player:died` listener should drop all carried seeds at the
player's death position. Verify this is wired correctly end to end.

Check the following:
- `player.seedSlots` contains the carried seeds at time of death
- The forEach loop iterating slots and spawning Seed objects is actually executing
- Each spawned seed has `setDespawnTimer(30000)` called on it
- `player.seedSlots` is cleared to null after drops
- `inventory:changed` is emitted after clearing

If the listener exists but seeds aren't dropping, the most likely cause is
`player.seedSlots` being undefined or empty at the time `player:died` fires.
Add a `console.log('death seeds:', this.player.seedSlots)` immediately inside
the listener to confirm the slots state, fix the root cause, then remove the log.

---

## Fix 2 — Day Advances on Death

In GameScene, inside the `player:died` listener, after dropping seeds and
before the respawn sequence, call `daySystem.advanceDay()`.

Sequence should be:
1. Drop all carried seeds at death position with 30s despawn timer
2. Clear seed slots, emit `inventory:changed`
3. Call `daySystem.advanceDay()` — increments day, fires `day:advanced`,
   ticks garden bed growth, resets day timer
4. Camera fade out 500ms
5. Teleport player to garden center
6. Restore player to full HP, emit `player:healed`
7. Camera fade in 500ms

UIScene should show the updated day number after respawn since it listens
to `day:advanced` already.

Add a brief center-screen message during the fade: "Day lost." in red, fades
out with the camera. UIScene listens to `player:died` to show this text.

---

## Fix 3 — Demo Win Condition: 10 of Each Plant

In AchievementSystem.js and WinScene trigger logic, change the demo win
condition from "1 of each plant type grown" to "10 of each plant type grown."

Find every location that checks `plantsGrownEver` for the demo win and update:

```javascript
// OLD
const allGrown = Object.values(saveData.plantsGrownEver).every(count => count >= 1);

// NEW
const allGrown = Object.values(saveData.plantsGrownEver).every(count => count >= 10);
```

Also update the achievement flavor text for `harvest_begins`:
- Old: "Six seeds. Six paths. One forest to restore."
- New: "Ten of each. The forest stirs at last."

Update the achievement trigger condition to match — `harvest_begins` should
fire at 10 of each, not 1 of each.

Update WinScene demo win header text to reflect the new condition:
- "The forest is beginning to remember."

---

## Fix 4 — New Game+ Requires Full Upgrade Tree

New Game+ should only trigger on the FULL win condition (all 12 upgrade tracks
maxed), not the demo win. The demo win should only offer "Continue Playing"
with no New Game+ activation.

In WinScene:

**Demo win screen:**
- Remove "Continue Playing enables New Game+" language entirely
- Buttons: `[Continue Playing]` and `[Return to Menu]`
- Continue Playing: just closes WinScene, game continues normally
- No `newGamePlus:activated` emit on demo win

**Full win screen:**
- `[New Game+]` button activates New Game+ and restarts
- `[Return to Menu]` saves and exits
- `newGamePlus:activated` only emits here

This creates a natural incentive loop: demo win is a mid-game milestone that
says "keep going," full win is the actual completion that rewards the player
with harder content.

---

## Deliverables Checklist

```
[ ] Player dies — all carried seeds drop at death position
[ ] Dropped seeds have 30 second shrink/despawn timer
[ ] Seeds in bank unaffected by death
[ ] Day number increments by 1 on death
[ ] Garden beds tick growth on death same as sleep
[ ] Day timer resets after death same as sleep
[ ] "Day lost." text appears briefly on death screen
[ ] Demo win now requires 10 of each plant type grown
[ ] harvest_begins achievement fires at 10 of each
[ ] Demo win screen has no New Game+ option
[ ] Full win screen is the only path to New Game+
[ ] npm run dev — zero console errors
```

Commit with message: `fix: death seed drop day advance and win condition rebalance`
