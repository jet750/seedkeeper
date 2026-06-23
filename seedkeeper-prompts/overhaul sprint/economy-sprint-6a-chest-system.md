# Economy Sprint 6a — Chest system & combat coin faucets

## Context
Make combat pay. This sprint adds the daily treasure chests, enemy coin drops, and the
cold-start tutorial chest. Earnings route through the banked-coin path for now so the
whole system is testable on its own; Sprint 6b will reroute them into the pending/escrow
sortie loop.

## Builds on
- Sprint 2: coins, the `addCoins/spendCoins` path, `economy.json`.
- Sprint 5: enemy levels and zone-level inheritance (chests scale off these).
Both must be merged to dev before this runs.

## Hard rules
- Do NOT modify the marketplace, stat trees, day timer internals, weather, or save schema
  beyond adding chest/daily-reward state.
- All rates, payouts, and guard compositions live in `economy.json` (provisional, tunable).
- Respect the mobile perf budget (pool guards and reward effects).
- Route every coin gain through `addCoins()` from Sprint 2 — no scattered `coins += x`.

## Tasks

1. Branch: `git checkout dev && git pull && git checkout -b feature/chest-system`

2. **Enemy coin drops.** On enemy death, award coins by type and level from `economy.json`
   (provisional: green 2–3, dark 5–7, skeleton 12–18, scaled by level). Route through
   `addCoins()`.

3. **Daily chests (three per in-game day).** Spawn three chests each day, keyed to
   `dayNumber`, refreshed when the day advances. Each chest is locked behind a guard pack;
   defeating the guards unlocks the claim.
   - Guards are drawn from the chest's zone level (Sprint 5) with the small spread that
     sprint provides, so guard difficulty varies by placement.
   - **Payout = a formula off realized guard threat**, not a fixed table:
     `threat = sum over guards of (typeBaseValue x level)`; chest coins and plant count
     scale off `threat` (coefficients in `economy.json`). A high-level-zone heavy pack pays
     far more than a low-level light pack — pushing your luck into harder zones is what
     makes the reward worth it. Include plant rewards (provisional 2/3/4 by rough tier, with
     a rare-plant chance on the richest).
   - Placement is data-driven from a config list so it works in the current procedural world
     now; the LDtk world will supply real coordinates later. Do not hardcode chests to
     specific tiles.

4. **Cold-start tutorial chest.** On a new game (day 1), spawn a special low-guard chest very
   near the garden entrance (1–2 lowest-tier slimes) with an inflated coin payout — enough to
   afford the first weapon (the Stick). After the player claims it, fire a tutorial nudge
   (reuse `TutorialSystem`): head home to the market and buy your first weapon. This is the
   intended on-ramp: kill a couple of slimes, pop the chest, go arm yourself.

5. **Claim flow.** Defeating all guards enables claim; claiming awards coins via `addCoins()`
   and plants into the bank, then despawns the chest for the day. (Sprint 6b will reroute
   these awards into pending/escrow.)

## Verification (must pass before merge)
- Killing enemies grants coins scaled by type and level; HUD updates.
- Three guarded chests spawn per day and refresh on day advance; clearing the guards lets you
  claim coins + plants; payout is visibly larger for tougher/higher-level guard packs.
- New game spawns the tutorial chest by the garden; clearing it gives enough to buy the Stick
  and triggers the market nudge.
- Chest placement reads from config (not hardcoded tiles); works in the procedural world.
- Marketplace, stat trees, weather, and day timer unchanged; no mobile frame drops in a
  guard fight.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: chest system + combat coin faucets — daily guarded chests, threat-based payout, enemy drops, cold-start tutorial chest"
git checkout dev
git merge feature/chest-system
git push origin dev
```
Do NOT merge or push to main.
