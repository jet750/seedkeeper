# Economy Sprint 3-polish — Marketplace & HUD cleanup (visual; review before merge)

## Context
Sprint 3 (marketplace) is functional but sits unmerged on `feature/marketplace`. Playtest
surfaced a set of visual/UX fixes plus two small rendering issues. Apply them on that same
branch so the marketplace lands polished. Every change here is visual — verify the build,
then STOP for human review (Claude Code cannot confirm rendering).

## Hard rules
- Do NOT change the working buy/sell *logic* — purchases, selling, coin math, tier
  unlocking all work and must keep working. This pass is layout, color, labels, an asset
  swap, and one bed-rendering fix.
- Do NOT touch combat, day timer, economy values, or save logic.
- Values/labels that already exist come from `economy.json`; don't hardcode prices.

## Builds on
`feature/marketplace` (cut from dev with Sprint 2). It contains the marketplace, the coin
HUD, the bed-spawn logic, and the stat-upgrade station — all editable here.

## Tasks

1. Branch: `git checkout feature/marketplace && git pull --ff-only 2>/dev/null; git status`
   (Work directly on this existing branch.)

2. **Relocate the coin counter.** It currently renders below the minimap (top-right, under
   the map). Move it into the top status bar, alongside the Day / HP readout, so currency
   sits with the other persistent stats. (UIScene HUD.)

3. **Marketplace tab visibility (SELL / BUY).** The active tab is bright red and the inactive
   tab is near-invisible grey. Rework so BOTH tabs are clearly legible: the inactive tab must
   read as a real, clickable tab (visible border/fill, readable label), and the active tab is
   distinguished by a clear but less jarring highlight. The player should immediately see
   there are two tabs.

4. **Reveal all tier contents — remove the "??? ???" silhouettes.** Every purchasable tier
   (gear and capacity) must show its real name, effect, and price regardless of whether it's
   affordable yet. Replace the locked "??? <price>" with the actual item, e.g.
   "6 BEDS — 58c", "Sword — 90c", greyed when not yet purchasable. Keep the three visual
   states distinct: owned (✓), the next affordable tier (highlighted/buyable), and
   future/locked tiers (fully labeled but greyed, not hidden). Rationale: the player should
   be able to judge whether a future upgrade is worth saving for before committing coins.

5. **Row layout / readability.** The cramped two-line "name + BUY x" rows and the element
   overlapping the capacity section (a stray sprite bleeding into the panel) make text
   semi-readable. Give rows breathing room, ensure name + price + state fit cleanly per cell,
   and remove/relocate whatever sprite is overlapping the panel. Target legibility at the
   game's actual render resolution and the 2.5 camera zoom.

6. **Spawned garden-bed rendering bug.** Beds purchased through the capacity tree spawn as a
   bare brown dirt square with no tan/beige frame, unlike the starting beds (which have the
   border). Make newly spawned beds use the exact same sprite/frame composition as the
   initial beds so they're visually identical.

7. **Workbench asset swap (non-blocking).** The stat-upgrade station currently uses a
   treasure-chest sprite; it should use the workbench art. If a workbench asset exists in the
   asset manifest / assets folder, swap the station's sprite to it. If no workbench asset is
   present, leave the station as-is and REPORT that the workbench file needs to be added,
   naming where it should go and what key it should register under — do not block the rest of
   the sprint on this.

## Verification (build only — visual confirmation is the human's job)
- Build is clean (`npm run build`, 0 errors).
- Code review confirms: coin counter moved to the status bar; both market tabs rendered with
  legible styles; all gear/capacity tiers labeled with name+effect+price (no "???"); row
  spacing increased and the overlapping sprite removed; spawned beds reuse the bordered bed
  sprite; workbench swapped if the asset exists (else reported).

## STOP — do not merge
Commit all changes to `feature/marketplace`. Do NOT merge or push. Leave the branch for
human visual review. Report: the build result, the workbench-asset outcome, and a short list
of each file touched.
```
git add -A
git commit -m "polish: marketplace tabs+tier labels+layout, coin HUD to status bar, spawned-bed border, workbench sprite"
```
Do NOT merge. Do NOT push to dev or main.
