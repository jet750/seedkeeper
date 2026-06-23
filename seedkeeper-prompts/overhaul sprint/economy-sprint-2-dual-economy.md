# Economy Sprint 2 — Dual-economy redesign (rip plant-funded gear/capacity, rebuild on coins)

## Context
This is a deliberate rip-and-rebuild. The live build is a pre-launch showcase with
disposable saves, so we are intentionally removing the current plant-funded gear and
plant-funded capacity systems and rebuilding around the dual-loop economy:

- **PLANTS → stat trees only** (cultivation; the existing "workshop chest" / UpgradeScene)
- **COINS → gear + capacity** (arsenal & convenience; new currency)

Numbers in this sprint are PROVISIONAL and live in `economy.json` so they can be tuned
later without code changes. Build the structure correctly; the values will move.

## Builds on
Economy Sprint 1 (entities split) is merged: data now lives in `plants.json`,
`enemies.json`, `upgrades.json`, `config.json`, and an empty `economy.json` stub, all
re-exported through the `src/data/gameData.js` barrel. This sprint fills in `economy.json`.

## Hard rules
- This sprint IS explicitly authorized to remove the plant-funded gear and plant-funded
  capacity systems. Do NOT touch anything outside the economy: combat feel (hit stop,
  knockback, screenshake), the world/zones, day timer, weather, achievements, particles,
  audio, and tutorials must behave exactly as before.
- Stat-tree math stays identical except that gear is removed from the tree — same six
  plants → six stat trees, same per-level stat costs.
- Saves are disposable: on version mismatch, WIPE to a fresh v2 save. Do NOT write a
  grandfathering/migration shim.
- Provisional values only in `economy.json`; no magic numbers hardcoded in systems.

## Tasks

1. Branch: `git checkout dev && git pull && git checkout -b feature/dual-economy`

2. **economy.json — define the catalogs** (provisional values, tunable):
   - `gear`: ordered tiers per equip slot, each `{ id, name, slot, price, ...stats, flavor }`
     - weapon: `stick` (cheap starter, ~12) → `dagger` (~30) → `sword` (~90).
       Weapon stats: `weaponDamage` (flat bonus on top of base attack) and optional
       `arcDegrees` for heavier weapons. (Player already supports `weaponDamage` and
       `attackArcDegrees`; equip applies these.)
     - armor: `tunic` (~25) → `leather` (~70) → `chainmail` (~160). Stat: damage reduction / defense.
     - boots: `basic_boots` (~25) → `dash_boots` (~85). Stat: move speed / dash bonus.
     - ranged: `sling` (~35) → `bow` (~100). Stats: projectile damage / cooldown.
     - Linear progression (each tier strictly better than the last) — no sidegrades.
     - `flavor`: short "recovered from your father" line per item (optional, can be "").
   - `capacity`: three INDEPENDENT trees, each with its own price array:
     - `seedBag`: carry slots, base 3, +1 per tier up to 8 → 5 purchasable tiers.
     - `gardenBeds`: bed count, base 4, +1 per tier up to 8 → 4 purchasable tiers
       (provisional 30/50/70/100).
     - `watering`: 3 tiers (provisional 35/70/120). Replaces the old blue_flower-funded
       `well_upgrades`.
   - `sellPrices`: plant sell value scaling with grow time (provisional: 1-day = 3,
     2-day = 7, 3-day = 12). Used by the marketplace in Sprint 3.

3. **Rip the plant-funded paths:**
   - Remove the `gear` sub-object from each plant in `upgrades.json` (keep `stat`).
   - Remove/disable `well_upgrades` plant-funding; watering capacity is now a coin tree.
   - Audit `UpgradeScene` ("workshop chest"): it now performs STAT upgrades only.
     Strip any gear/capacity purchase UI and logic from it.

4. **Decouple seed bag from garden beds.** The current garden-bed grid "row-wraps as
   satchel upgrades add beds." Separate these: `seedBagTier` drives carry slots only;
   `gardenBedTier` drives bed count only. Each is bumped by its own coin purchase.

5. **Save schema v2** (`SaveSystem`):
   - Add `coins` (banked, default 0).
   - `upgrades[plant]` keeps `stat`, drops `gear`.
   - Add `seedBagTier` (0), `gardenBedTier` (0), `wateringTier` (0).
   - `equippedGear` is now populated by coin purchases; default all null except whatever
     the design wants at start (start with NO weapon).
   - Bump `SAVE_VERSION` to 2. On loading any save whose version != 2, discard it and
     start a fresh v2 default. Show a one-time "save reset for the new update" notice if
     trivial; otherwise silent is fine.

6. **Player / equip:** ensure `equipWeapon`/armor/boots/ranged apply the coin-gear stats
   from `economy.json`. Base unarmed attack stays (weaponDamage 0 with no weapon).

7. **HUD (`UIScene`):** add a coin counter. Subscribe to `coins:changed`.

8. **EventBus + EVENTS.md:** add and document `coins:changed`, `coins:spent`,
   `gear:purchased`, `gear:equipped`, `capacity:purchased`. Append these to the EVENTS.md
   registry created in Sprint 1.

9. **Cheat menu (`DevMenuScene`) — rewire for testing the new dual economy:**
   - Add "Give +100 coins" and "Give +500 coins".
   - Add "Grant all gear" (equips top tier of every slot via the coin-gear path).
   - Keep "give plants" feeding the stat trees.
   - Audit every existing cheat: any that referenced the deleted plant-gear or
     plant-funded capacity must be repointed at the new structures or removed. No cheat
     should reference a path that no longer exists.
   - (The marketplace UI is Sprint 3; until then, the cheat menu is how we grant
     coins/gear to test this sprint.)

## Forward-compatibility (small, prevents a later refactor)
A future sprint adds a sortie/extraction loop where coins earned out in the world are
"pending" (lost on death) and only become banked `coins` when the player returns to the
home safe zone. To keep that clean, route ALL banked-coin mutations through a single
`addCoins(amount)` / `spendCoins(amount)` path on the coin/economy module (the cheat
menu, plant selling, and purchases all go through it). Do NOT scatter `coins += x` writes
across scenes. This sprint only deals with banked coins (all transactions happen at home);
the pending layer is built later and will sit alongside this path.

## Verification (must pass before merge)
- `npm run dev` builds clean, no new console errors.
- New game: 0 coins, no weapon equipped, base attack still hits and kills a slime.
- Cheat "give coins" increments the HUD counter; "grant all gear" equips items and
  measurably changes combat (damage/arc/speed).
- Stat trees still upgrade by spending plants in the workshop chest; no gear options
  remain there.
- Loading a pre-v2 save cleanly resets to a fresh v2 game (no crash, no stale gear).
- Combat feel, world, day timer, weather, achievements unchanged.

## Merge sequence (never main)
```
git add -A
git commit -m "feat: dual-economy framework — coins for gear+capacity, plants for stats only; save v2; cheat rewire"
git checkout dev
git merge feature/dual-economy
git push origin dev
```
Do NOT merge or push to main.
