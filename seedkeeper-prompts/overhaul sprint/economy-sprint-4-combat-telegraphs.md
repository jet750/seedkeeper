# Economy Sprint 4 — Combat depth pass 1: enemy telegraphs & attack patterns

## Context
Current combat is swing/dash/shoot against enemies that only wander, chase, and touch for
contact damage. Coins will soon come from combat (chests), so combat must be worth doing
for its own sake BEFORE that ships. This sprint gives each enemy a readable *tell* and a
*threat*, turning fights from a math problem into a timing conversation. No new art assets
— tells are built from tint, flash, and squash/scale on existing sprites.

## Hard rules
- Do NOT touch the economy (coins, gear, marketplace), the world/zones, day timer, weather,
  achievements, or save data. This sprint is enemy behavior + telegraph visuals only.
- Preserve existing game feel (hit stop, knockback, combo counter, screenshake) — add to
  it, don't alter it.
- Respect the mobile perf budget: enemy AI is already throttled (every-3rd-frame). Pool any
  spawned objects (e.g., split slimes), cap simultaneous telegraph effects, and do not add
  per-frame allocations.

## Builds on
dev post-Sprint 2. Note: the entities split (Sprint 1) did not land as a separate barrel —
enemy data still lives in `src/data/entities.json`. Add all new telegraph timings and
respawn config there under the `enemies` key (provisional, tunable). No hardcoded ms values
in systems.

## Tasks

1. Branch: `git checkout dev && git pull && git checkout -b feature/combat-telegraphs`

2. **Add a telegraph state to the enemy attack cycle.** Each threatening action runs:
   `idle/chase → WIND-UP (visible tell, enemy committed) → STRIKE → recover`. The wind-up is
   dodgeable with the player dash. Drive all timings from `enemies.json`.

3. **Green Slime — the dodge tutor.** Hops toward the player; at attack range it telegraphs
   a lunge: squash down (scale Y down ~300ms, provisional) then leap at the player's
   position at lock-in. If the player dashes during the squash, the lunge whiffs. Low damage,
   teaches the rhythm.

4. **Dark Slime — the commitment decision.** On death it splits into two smaller slimes,
   each with ~half HP and reduced damage (pool these; cap total slimes so a chain can't
   explode on mobile). Creates "do I commit to the kill or back off" pressure through
   numbers. (Per-level split scaling comes in Sprint 5; here, base behavior is a 2-way split.)

5. **Skeleton — the skill-expression enemy.** Winds up a heavy overhead strike with a clear
   ~500ms tell (red flash + raise) before a high-damage hit. Landing it hurts; dodging it
   opens a long punish window. This is the fight that rewards reading the tell.

6. **Telegraph visual language (consistent across all enemies):** a brief color/flash shift
   and/or squash during wind-up so the player learns one visual grammar. Keep it legible at
   the 2.5 camera zoom and on mobile.

7. **Enemy respawn cooldown.** Playtesting showed enemies respawning ~30s after death, which
   is too fast — the player can't clear an area without it immediately refilling. Add a
   per-enemy `respawnCooldownMs` value to `entities.json` (provisional: 180000ms / 3 full
   in-game minutes as a starting point — tune from there). Enemies that die should not
   respawn until that cooldown has elapsed. This is a tuning constant, not a design
   commitment; it will be revisited when the sortie/extraction loop ships.

## Verification (must pass before merge)
- Each enemy shows a clear, consistent wind-up before its threatening action.
- A well-timed dash cleanly avoids the green slime lunge and the skeleton overhead.
- Dark slime splits into two pooled smaller slimes on death; total active slimes is capped;
  no mobile frame drops during a multi-slime fight.
- Hit stop, knockback, combo counter, and screenshake feel exactly as before.
- Killed enemies do not respawn until the cooldown elapses; cooldown reads from
  `entities.json` (no hardcoded value).
- No economy/world/day/save behavior changed; telegraph timings read from `entities.json`.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: enemy telegraphs — slime lunge tell, dark slime split, skeleton overhead wind-up"
git checkout dev
git merge feature/combat-telegraphs
git push origin dev
```
Do NOT merge or push to main.
