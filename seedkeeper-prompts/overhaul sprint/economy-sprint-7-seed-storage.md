# Economy Sprint 7 — Seed storage chest & grow-time display

## Context
Two small quality-of-life additions that round out the economy: a home storage chest for
stockpiling seeds across days, and showing each seed's grow time in the seed info menu so
the player can plan plantings around the day cycle.

## Builds on
- Sprint 2 (save v2). Independent of the combat/chest track; only needs the economy
  framework. Can run any time after Sprint 2 is merged.

## Hard rules
- Do NOT modify combat, the day timer, the marketplace, stat trees, or weather.
- Storage is distinct from the carry satchel (Sprint 2 `seedBagTier`) and from the harvested
  -plant `bank` — it is a separate at-home seed stash. Keep the three concepts separate.
- Persist storage contents in the v2 save.

## Tasks

1. Branch: `git checkout dev && git pull && git checkout -b feature/seed-storage`

2. **Seed storage chest at home.** Add an interactable storage chest in the garden (reuse the
   F-key `INTERACT_RANGE` pattern). Opening it shows a stash the player can deposit seeds into
   and withdraw from, separate from the carry satchel. Deposited seeds persist across days in
   the save. Placement is a single config value so it can be moved when the LDtk world lands.

3. **Grow-time in the seed info menu.** In the seed dictionary / seed info UI, display each
   seed's grow time in days (sourced from `plants.json`), so the player can sequence plantings
   — e.g., start a 3-day crop before a 1-day crop to harvest them together.

## Verification (must pass before merge)
- The storage chest opens at home; seeds deposit and withdraw correctly and survive a
  save/reload and a day advance.
- Storage, carry satchel, and harvested-plant bank remain three distinct stores (no
  cross-contamination of counts).
- The seed info menu shows correct grow times from `plants.json`.
- Combat, day timer, marketplace, stat trees, and weather unchanged.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: seed storage chest + grow-time display in seed info menu"
git checkout dev
git merge feature/seed-storage
git push origin dev
```
Do NOT merge or push to main.
