# Combined run: merge Sprint 4+5, run Sprint 6 (3d), queue Sprint 7

Execute each step in order. STOP and report if any step fails before continuing.

---

## PRE-FLIGHT — merge pending branches to dev

STEP 0-A: Merge feature/marketplace to dev
The marketplace polish branch was committed in a worktree at
C:\dev\seedkeeper-marketplace. If it was pushed to origin, merge normally.
If not yet on origin, push it first then merge:

  cd C:\dev\seedkeeper-marketplace (if worktree still exists)
  git push -u origin feature/marketplace
  cd C:\dev\seedkeeper
  git checkout dev && git pull
  git merge feature/marketplace
  git push origin dev

If the worktree no longer exists and the branch is already on origin:
  git checkout dev && git pull
  git merge feature/marketplace
  git push origin dev

STEP 0-B: Merge feature/combat-economy-achievements to dev
  git merge feature/combat-economy-achievements
  git push origin dev

STEP 0-C: Stash or discard any uncommitted working-tree changes
  git status
  If anything uncommitted exists unrelated to the next sprint:
  git stash push -m "pre-sprint-6-stray"

STEP 0-D: Fix signpost layout overflow (if not already done)
  Check SignpostScene.js — if the achievement log still uses a fixed 4-column
  layout that overflows at 40+ entries, fix to 5 columns or add scroll.
  git add -A && git commit -m "fix: signpost log layout 40+ achievements" && git push origin dev

Confirm dev SHA after pre-flight before continuing.

---

## SPRINT 6 (was 3d) — plant rendering, expanded catalog, skeleton spawn fix

Read and execute the file at:
"C:\dev\seedkeeper\seedkeeper-prompts\overhaul sprint\economy-sprint-3d-plant-rendering-skeleton.md"

This sprint:
- Wires all 28 extracted plant PNGs from assets/images/plants/
- Rebuilds entities.json with the final locked plant tree assignments
- Retires old plant keys (red_mushroom, golden_wheat, green_herb, glowshroom)
- Renames blue_flower → blue_flower_2 everywhere
- Fixes skeleton spawn threshold so skeletons appear in deep forest zones
- Corrects skeleton animation frame sizes (was 16px, correct sizes are
  idle=32x32, run=64x64, death=96x64)
- Bumps save to v3 with clean wipe on mismatch

OVERRIDE: do NOT merge. Commit to feature/plant-rendering-fix and STOP.
Report: build result, list of files changed, and anything requiring
visual confirmation (plant sprites, skeleton spawn, save wipe behavior).

---

## SPRINT 7 — combat polish (skeleton variants, health bar, cheat menu)

ONLY run if Sprint 6 build is clean.

Read and execute the file at:
"C:\dev\seedkeeper\seedkeeper-prompts\overhaul sprint\sprint-7-combat-polish.md"

OVERRIDE: do NOT merge. Commit to feature/sprint-7-combat-polish and STOP.
Report: build result and list of items requiring playtesting before merge.

---

## Final report must include:
1. Dev SHA after pre-flight merges
2. Sprint 6 branch status and build result
3. Sprint 7 branch status and build result
4. Complete list of items needing human visual review before either merges
5. Any stashed changes and what they contained

Never push to main at any point.
