# Economy Sprint 3 — Marketplace (sell plants for coins, buy gear + capacity)

## Context
With the dual-economy framework in place (Sprint 2), build the player-facing marketplace:
one place with a SELL side (plants → coins) and a BUY side (coins → gear + capacity).
This is where the coin loop becomes real for the player instead of cheat-only.

## Builds on
Economy Sprint 2 is merged: `economy.json` holds the gear catalog, the three capacity
trees (`seedBag`, `gardenBeds`, `watering`), and `sellPrices`; save v2 has `coins`,
`seedBagTier`, `gardenBedTier`, `wateringTier`; events `coins:changed`, `gear:purchased`,
`capacity:purchased` exist.

## Hard rules
- Do NOT modify combat, world/zones, day timer, weather, achievements, or the stat-tree
  workshop chest. This sprint only adds the marketplace and its wiring.
- All prices and sell values come from `economy.json` — no hardcoded numbers.
- Build on the v2 economy structures from Sprint 2; do not reintroduce any plant-funded
  gear/capacity path.

## Tasks

1. Branch: `git checkout dev && git pull && git checkout -b feature/marketplace`

2. **Access point.** The world is mid-rebuild in LDtk, so do NOT hardcode the market to a
   specific world tile. Add a market stall object near the home/garden and open the
   marketplace on interact (reuse the existing F-key `INTERACT_RANGE` pattern used for
   beds/well/sleep). Its placement should be a single config value so it can be moved when
   the LDtk world lands. A `MarketplaceScene` (or a tabbed panel within an existing menu
   scene) is fine — match the existing scene patterns (Upgrade/Settings/SeedDict).

3. **SELL menu (plants → coins):**
   - List the player's harvested plants (the `bank`) with per-plant sell price from
     `economy.json.sellPrices` (scales with grow time).
   - Sell one / sell all controls per plant. Selling deducts from `bank`, adds `coins`,
     emits `coins:changed` and `plant:sold`.
   - Display this nudge prominently on the sell screen (exact wording tunable):
     "Selling plants is the fastest way to earn coins — but these same plants level your
     skill trees. Spend wisely; don't starve your growth to fill your purse."

4. **BUY menu (coins → gear + capacity):**
   - **Gear** grouped by slot (weapon / armor / boots / ranged). Show the next purchasable
     tier with price; already-owned tiers marked owned; future tiers shown as **locked
     silhouettes with their prices visible** (the "always a visible next purchase" rule).
   - **Capacity**: seed bag, garden beds, watering — each its own row showing current
     tier, next tier, and price; future tiers as priced silhouettes.
   - Purchase flow: verify `coins >= price`; on success deduct coins, grant the item.
     - Gear → set `equippedGear[slot]` to the new tier and apply its stats (emit
       `gear:purchased` + `gear:equipped`).
     - Capacity → increment the relevant tier counter; seed bag updates carry-slot count,
       garden beds spawn/enable an additional bed, watering raises watering capacity
       (emit `capacity:purchased`).
   - If `coins < price`, disable/grey the buy and show "not enough coins"; never allow
     negative coins.

5. **Wiring:** all coin changes flow through the Sprint 2 events so the HUD counter stays
   in sync. Buying gear should immediately reflect in combat; buying a seed bag tier should
   immediately raise how many seeds the player can carry out.

## Verification (must pass before merge)
- Interact with the stall → marketplace opens; close returns to gameplay cleanly.
- Sell plants → coins rise, `bank` falls, HUD updates.
- Buy the Stick with starter coins → it equips, base attack noticeably stronger.
- Buy a seed bag tier → carry slots increase; buy a garden bed tier → a new bed appears;
  buy watering → watering capacity rises.
- Locked higher tiers render as silhouettes with prices; cannot buy what you can't afford;
  coins never go negative.
- Combat, world, day timer, weather, achievements, and the stat-tree workshop unchanged.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: marketplace — sell plants for coins, buy gear and capacity; silhouette locked tiers"
git checkout dev
git merge feature/marketplace
git push origin dev
```
Do NOT merge or push to main.
