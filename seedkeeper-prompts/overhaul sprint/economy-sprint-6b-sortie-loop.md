# Economy Sprint 6b — Sortie / extraction loop (escrow, overtime, death-drop recovery)

## Context
This is the stakes layer. Coins and loot earned out in the world become "pending" — at risk
until the player returns home. The day timer becomes an extraction clock with a dangerous
overtime window, and dying or timing out drops your haul where you fell, guarded, for one
day. Return-home is the only way to save. This is the meatiest feel sprint in the roadmap;
it needs real playtesting before merge.

## Builds on
- Sprint 6a: chests, enemy drops, the banked claim flow (this sprint reroutes those into
  pending).
- Sprint 2: the `addCoins()` banked path (banking pending calls into it).
Must be merged to dev before this runs.

## Hard rules
- Do NOT alter the chest payout formula, enemy levels, marketplace, stat trees, or weather.
- All timings, spawn-escalation curves, and guard-scaling for drops live in `economy.json`
  (provisional, tunable).
- Respect the mobile perf budget (escalating spawns must stay pooled and capped).

## Tasks

1. Branch: `git checkout dev && git pull && git checkout -b feature/sortie-loop`

2. **Pending / escrow state (runtime, not saved).** Add a runtime `pending` purse (coins +
   plants). Reroute Sprint 6a's chest claims and enemy coin drops to add to `pending` instead
   of calling `addCoins()` directly. `pending` is never written to the save — it exists only
   during a sortie.

3. **Home-zone banking.** When the player enters the garden/home safe zone, move `pending`
   into banked coins/bank via `addCoins()` and clear `pending`. This is the only save action.
   It enables multiple sorties per day: bank a run, head out again with only the new run at
   risk.

4. **Overtime extraction clock.** Extend `DaySystem` so the day timer continues past 0:00
   into the negative down to a −5:00 floor:
   - As time goes more negative, enemy spawn rate escalates and higher-tier enemies bleed
     into lower-level zones (curve in `economy.json`), so getting home becomes a fight.
   - At −4:00, fire a clear warning: ~1 minute to reach home or pass out and lose the day's
     winnings.
   - At −5:00, auto-KO (treated as death): forfeit `pending`, wake at home, day advances like
     a normal wakeup.

5. **Death / timeout drop recovery.** On death or the −5:00 KO, drop the forfeited `pending`
   haul at (approximately) the death coordinates as a recoverable cache that persists for one
   in-game day:
   - Guard the cache in proportion to the lost payout (scaling in `economy.json`): a small
     haul lost to a weak enemy → that enemy plus maybe one more; a large multi-run haul → a
     high-level guard detail, comparable to a rich daily chest.
   - Recovering the cache (defeating its guards) returns the haul to `pending` (then bank it
     by getting home). The cache despawns after one day if not recovered.

6. **HUD.** Show banked coins and the at-risk `pending` amount distinctly, plus the overtime
   clock state (normal / red overtime / final-minute warning) so the risk is always legible.

7. **Reconcile day advance.** Ensure the existing `advanceDay()` and the new overtime KO both
   route to a single, consistent "wake at home, next day" path. No double-advance, no
   competing timers.

## Verification (must pass before merge — playtest, do not rely on build alone)
- Coins/loot earned out in the world show as pending/at-risk; entering the home zone banks
  them and clears pending.
- Two sorties in one day work: bank run one, lose run two to death, and only run two's haul
  is forfeited.
- Past 0:00 the world escalates; the −4:00 warning fires; −5:00 forces a KO and a clean wake
  at home with pending forfeited.
- A forfeited haul appears as a guarded cache at the death spot, guard strength scales with
  the lost amount, recovery returns it to pending, and it despawns after a day.
- HUD clearly distinguishes banked vs at-risk and shows the overtime state.
- Chest payouts, enemy levels, marketplace, stat trees, and weather unchanged; no mobile
  frame drops during escalated overtime spawns.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: sortie/extraction loop — pending escrow, home-zone banking, overtime clock, death-drop recovery"
git checkout dev
git merge feature/sortie-loop
git push origin dev
```
Do NOT merge or push to main.
