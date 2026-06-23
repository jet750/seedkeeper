# Economy Sprint A — Combat & economy achievements (fill the new progression paths)

## Context
The dual-economy rip made the old gear achievements fire on coin events (already done), but
there are no achievements rewarding the new moment-to-moment loops: killing enemies, earning
coins, arming up. Add a graduated set so the player gets a steady drip of recognition as they
play the new systems. This is independent of the marketplace polish and hooks events that
already exist on dev (Sprint 2), so it can run in parallel.

## Hard rules
- Do NOT modify combat, the economy, the marketplace, or save logic beyond registering new
  achievements and their unlock state.
- Do NOT duplicate achievements that already exist — read `achievements.js` first and only
  add ones that fill gaps. Match the existing achievement data shape and signpost-log pattern
  exactly.
- Hook unlocks to EXISTING EventBus events (enemy killed by type, coins changed/earned,
  gear purchased, capacity purchased). Do not invent new gameplay events; if a needed event
  doesn't exist, note it rather than adding emitters to combat/economy systems.

## Builds on
dev (Sprint 2 merged): `coins:changed` / `coins:spent`, `gear:purchased`,
`capacity:purchased`, plus whatever enemy-death event combat already emits. `AchievementSystem`
is null-safe and event-driven after Sprint 2.

## Tasks

1. Branch: `git checkout dev && git pull && git checkout -b feature/combat-economy-achievements`

2. **Identify the existing event hooks.** Find the enemy-death event and confirm it carries
   (or can carry) the enemy type so per-type kill achievements are possible. Confirm the coin
   and purchase events. List what you found.

3. **Add new achievements** (thresholds provisional, in the same data file/shape as existing
   ones, each with its signpost-log entry). Suggested set — adjust to fit existing patterns:
   - Combat, slimes: first slime kill; 5 slimes; 25 slimes; first dark slime kill.
   - Combat, skeletons: first skeleton kill (the "you're armed enough now" milestone);
     5 skeletons.
   - Economy, coins: earn your first coin; 100 coins earned (cumulative, not balance).
   - Economy, trade: sell your first plant; buy your first weapon (the Stick — the cold-start
     payoff); fully upgrade any one gear slot to its top tier; buy your first capacity
     upgrade; max out any one capacity tree.
   Keep them earnable through normal play and through the dev cheat menu (e.g., granting coins
   / gear should trip the relevant economy achievements).

4. **Defer the sortie/chest achievements** — do NOT implement these now; they need Sprint 6.
   Instead, append a short "// TODO Sprint 6 achievements" list in `achievements.js` (or a
   note in EVENTS.md) so they're ready to wire when chests/extraction land: clear your first
   chest; clear a hard chest; survive a full overtime extraction; recover a death-drop; bank
   two sorties in one day.

## Verification (must pass before merge)
- Build clean; `AchievementSystem` does not throw.
- Killing slimes/skeletons trips the kill achievements at the right thresholds; earning coins
  and buying gear/capacity (via market or cheat) trips the economy ones.
- New achievements appear correctly in the signpost log with their entries; existing
  achievements still work.
- No combat/economy/save behavior changed beyond achievement bookkeeping.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: combat + economy achievements for the dual-economy loops; Sprint 6 achievement TODOs stubbed"
git checkout dev
git merge feature/combat-economy-achievements
git push origin dev
```
Do NOT merge or push to main.
