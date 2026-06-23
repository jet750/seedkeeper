# Economy Sprint 5 — Enemy leveling (1–5 per type, markers, zone inheritance)

## Context
Add a level (1–5) to each enemy type so the map has a difficulty gradient, the player has a
measuring stick for their own growth, and — critically — so the daily chests (Sprint 6) can
scale guard difficulty and payout off enemy level. Level drives stats, a visual read, and
behavior complexity. This sprint must land before chests.

## Hard rules
- Do NOT touch the economy (coins/gear/marketplace), day timer, weather, achievements, or
  save schema beyond what leveling requires.
- Build on Sprint 4's telegraph behaviors — leveling *scales and complicates* them, it does
  not replace them.
- All level stats/multipliers live in `entities.json` under the `enemies` key (provisional,
  tunable). No hardcoded level math in systems. The entities split did not land as a barrel;
  enemy data is still in `src/data/entities.json`.
- Respect the mobile perf budget (pooling, capped effects, no per-frame allocations).

## Builds on
- Sprint 4 (telegraphs) must be merged to dev first: base telegraph behaviors and the
  respawn cooldown exist; enemy data is in `src/data/entities.json`.
- The current `handleEnemyScaling(dayNumber)` in GameScene scales enemies by day number.
  Reconcile with explicit per-type levels: levels become the primary difficulty driver; fold
  day-scaling into the level assignment or retire it — do not leave two competing scaling
  systems running.

## Tasks

1. Branch: `git checkout dev && git pull && git checkout -b feature/enemy-leveling`

2. **Per-type level bands (1–5).** Each enemy type (green slime, dark slime, skeleton) has
   its own base stats and a 1–5 multiplier curve in `enemies.json`, tuned so the types
   overlap in power: roughly a lvl-5 green ≈ lvl-2–3 dark ≈ lvl-1 skeleton. Level affects
   HP, damage, and speed.

3. **Level = stats + visual + behavior complexity.**
   - Stats: the multiplier above.
   - Visual: subtle tint/size step per level so a higher-level enemy reads as more dangerous
     at a glance, plus a level marker (pips or a small number) above the health bar.
   - Behavior: higher levels add complexity to the Sprint 4 telegraphs — e.g., a lvl-1 green
     slime hops slowly with a single lunge; a lvl-5 green hops faster and lunges twice; a
     high-level dark slime splits into more pieces (keep the total-slime cap from Sprint 4);
     a high-level skeleton's overhead is faster or followed up. Drive these thresholds from
     `enemies.json`.

4. **Danger marker color (player-relative).** Color the level marker by how the enemy
   compares to the player's current power: green = safe, yellow = risky, red = dangerous.
   The player has no single "level," so derive a provisional **player-power level (1–5)** from
   total stat-tree tiers across the six trees plus equipped gear tier (formula in a constants
   block, tunable). Rule (provisional): green if enemyLevel ≤ playerPower, yellow if
   playerPower+1, red if ≥ playerPower+2. This is a heuristic to tune later, not a
   commitment.

5. **Zone inheritance with a procedural fallback.** An enemy's level comes from the zone it
   spawns in. The hand-built LDtk world will carry a per-zone level property; until that
   lands, derive level in the current procedural world from distance-from-home (further =
   higher, clamped 1–5) so the gradient exists now. Read a zone `level` property if present,
   else fall back to the distance heuristic. Guards can sit slightly above/below their zone
   level (a small spread), so a zone isn't perfectly uniform — Sprint 6 relies on this spread
   for chest guard variety.

## Verification (must pass before merge)
- Enemies spawn at varied levels with a visible marker (pips/number) and a tint/size step.
- Marker color tracks player power: weak early player sees red on high-level enemies; after
  upgrades, the same enemies read yellow/green.
- A lvl-5 green slime is meaningfully tougher than a lvl-1, and the cross-type overlap holds
  (a lvl-5 green is roughly a lvl-1 skeleton).
- Only one scaling system is active (no leftover day-scaling double-counting).
- In the procedural world, level rises with distance from home; the code reads a zone
  `level` property when one exists.
- Economy, day timer, weather, achievements, and Sprint 4 telegraph feel unchanged.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: enemy leveling 1-5 — per-type bands, level markers with player-relative color, zone inheritance"
git checkout dev
git merge feature/enemy-leveling
git push origin dev
```
Do NOT merge or push to main.
