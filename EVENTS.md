# Seedkeeper — EventBus Event Registry

All cross-system communication goes through `src/core/EventBus.js` (singleton
pub/sub). Modules never import each other directly. This file is the registry of
event names, their payloads, and who emits / consumes them.

> Note: this registry was intended to be created in Economy Sprint 1. It was
> seeded in Economy Sprint 2 starting with the economy events below; older events
> are catalogued here from the live codebase. Add new events here when you
> introduce them.

---

## Economy (Sprint 2 — dual economy)

Banked coins are the convenience/arsenal currency (gear + capacity). Plant
resources fund the stat trees only. **All banked-coin mutations go through the
single `GameScene.addCoins(amount)` / `spendCoins(amount)` path** — never write
`coins` directly. `spendCoins` refuses to overdraw, so coins never go negative.

| Event | Payload | Emitted by | Consumed by |
|-------|---------|-----------|-------------|
| `coins:changed` | `{ coins, delta }` | `GameScene.addCoins/spendCoins`, `syncHud` | `UIScene` (coin counter), `AchievementSystem` (first_coin / coin_purse — counts positive deltas only) |
| `coins:spent` | `{ coins, amount }` | `GameScene.spendCoins` | (reserved — analytics / future sortie layer) |
| `gear:purchased` | `{ slot, tierId, price }` | `GameScene.grantGearTier` (purchase + cheat) | (reserved — marketplace/UX) |
| `gear:equipped` | `{ slot, tierId }` | `GameScene.grantGearTier` | `AchievementSystem` (the_stick / armed / layered / slot_maxed / full_kit) |
| `capacity:purchased` | `{ tree, tier, price }` | `GameScene.purchaseCapacity` | `AchievementSystem` (satchel_bearer / capacity_maxed) |

`slot` ∈ `weapon | armor | boots | ranged`. `tree` ∈ `seedBag | gardenBeds | watering`.
Catalog + prices live in `src/data/economy.json` (provisional, tunable).

The Sprint 3 marketplace will also emit `plant:sold` (`{ plantType, qty, coins }`)
on the SELL side; selling routes coins through the same `addCoins` path.
`AchievementSystem` already listens for it (first_sale); the listener is inert
until the marketplace SELL emitter merges to dev.

Also consumed off the kill stream: `enemy:died` `{ type }` →
`AchievementSystem` per-type tracks (first_blood / slime_culler / dark_first /
darkwalker / bonecrusher / skeleton_crew / slayer).

---

## Plants / inventory / upgrades

| Event | Payload | Notes |
|-------|---------|-------|
| `bank:updated` | `{ bank }` | plant-resource bank changed |
| `inventory:changed` | `{ slots }` | seed-slot contents/size changed |
| `inventory:swapRequested` / `inventory:swapClosed` | `{ slots, newPlantType }` / — | full-bag swap picker |
| `upgrade:purchased` | `{ plantType, track:'stat', newLevel, cost }` | workshop chest (STAT only in v2) |
| `upgrade:opened` / `upgrade:closed` | — | workshop overlay |
| `plant:harvested` / `bed:planted` / `bed:watered` / `bed:plantPrompt` | varies | garden beds |

## Player / combat

`player:damaged`, `player:healed`, `player:statsChanged`, `player:died`,
`player:zoneChanged`, `player:moved`, `player:waterChanged`,
`player:waterFilled`, `player:waterUsed`, `player:dashed`, `player:slept`,
`dash:enabled`, `ranged:equipped`, `ranged:fired`, `combat:meleeLanded`,
`combat:combo`, `combat:comboEnd`, `enemy:died`, `seed:recovered`.

## Day / world / weather

`day:dayChanged`, `day:advanced`, `day:timerTick`, `day:timerUrgent`,
`day:timerExpired`, `weather:changed`, `worlddetail:opened/closed`,
`dictionary:newEntry/closed`, `minimap:toggle/setVisible`,
`interact:nearObject/leftObject`, `touch:move/attack/dash/ranged/interact`.

## Meta / lifecycle / UI

`game:stateChanged`, `game:started`, `game:pauseRequested`, `save:requested`,
`achievement:unlocked`, `newGamePlus:activated`, `ngplus:status`,
`audio:muteChanged`, `tutorial:hint`, `ui:notice` (`{ text }` — transient HUD
banner; used for the v2 "save reset" notice).

## Dev cheats (only when dev mode is active)

DevMenuScene emits intents; GameScene executes and re-broadcasts canonical events.

`dev:fillBank`, `dev:addBank` (`{ plantType, amount }`), `dev:addCoins`
(`{ amount }`), `dev:day` (`{ delta }`), `dev:grantGear`, `dev:maxStats`,
`dev:fullHeal`, `dev:restoreAmmo`, `dev:spawnEnemy` (`{ type }`),
`dev:clearEnemies`, `dev:clearSave`, `dev:forceSave`.
