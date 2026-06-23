# Economy Sprint 1 — Split entities.json (pure refactor, zero behavior change)

## Context
`src/data/entities.json` is a god-file and is about to absorb a full economy layer.
Before that, split it into focused data files. This sprint changes data STRUCTURE only.
The running game must behave **identically** before and after — same values, same
behavior, no visible or functional difference. This is the safe groundwork sprint for
the dual-economy rebuild that follows.

## Hard rules
- **Do not modify any gameplay values or behavior.** This is a structural move only.
- **Do not modify working systems** beyond the import-path changes this split requires.
- No new features. No tuning. No "while I'm here" cleanups outside the split.
- If anything is ambiguous, stop and ask rather than guessing.

## Current state (verified)
- `entities.json` is consumed as a **static ES-module import**:
  `import entitiesData from '../data/entities.json'`
- Known import sites: `src/scenes/UIScene.js`, `src/scenes/GameScene.js`,
  `src/scenes/SeedDictScene.js`, `src/scenes/MenuScene.js`, `src/scenes/WinScene.js`.
  **Grep the whole `src/` tree for every `entities.json` import and handle all of them.**
- Consumers access it by dotted keys: `entitiesData.player`, `.plants`, `.enemies`,
  `.daySystem`, `.upgrades`, `.well_upgrades`, `.weather`, `.newGamePlus`.
  `GameScene` also does `this.gameData = entitiesData`.
- Top-level keys today: `player, newGamePlus, enemies, daySystem, plants, upgrades,
  well_upgrades, weather`.

## Tasks
1. Create a new branch off dev:
   `git checkout dev && git pull && git checkout -b feature/entities-split`

2. Split `src/data/entities.json` into these files in `src/data/`:
   - `plants.json`     ← the `plants` object
   - `enemies.json`    ← the `enemies` object
   - `upgrades.json`   ← the `upgrades` AND `well_upgrades` objects (keep both here for
     now; the dual-economy sprint will relocate capacity items later)
   - `config.json`     ← `player`, `daySystem`, `weather`, `newGamePlus`
   - `economy.json`    ← create as an empty stub `{}` with a one-line header comment
     in an adjacent README note (JSON can't hold comments). This is the home for the
     coin economy added in Sprint 2. Nothing imports it yet.

3. Create a barrel module `src/data/gameData.js` that imports each JSON file and
   re-exports a single default object **with the exact same shape as today's
   entities.json**, so every existing `entitiesData.X` access keeps working unchanged:
   ```js
   import plants from './plants.json';
   import enemies from './enemies.json';
   import config from './config.json';
   import { ... } from './upgrades.json'; // or default import
   import economy from './economy.json';
   // re-export combined object: { ...config, plants, enemies, ...upgradesAndWell, weather, economy }
   ```
   The combined object MUST expose: `player, newGamePlus, enemies, daySystem, plants,
   upgrades, well_upgrades, weather` exactly as before (plus an unused `economy` key).

4. Update **every** import site found in step 1 to import from the barrel:
   `import entitiesData from '../data/gameData.js'` (adjust relative path per file).
   Do not change any other line in those files.

5. Delete the old `src/data/entities.json` once all imports point at the barrel.

## Verification (must pass before merge)
- `npm run dev` builds with no errors and no new console warnings.
- Load the game: title → start → garden loads, plants/enemies/day timer/upgrades all
  behave exactly as before. Spot-check the upgrade screen and seed dictionary (they
  read plant/upgrade data directly).
- Grep confirms zero remaining references to `entities.json`.
- Diff review: the only logic change anywhere is import paths; all data values are
  byte-identical to the pre-split JSON.

## Merge sequence (never commit to main)
```
git add -A
git commit -m "refactor: split entities.json into plants/enemies/upgrades/config + gameData barrel"
git checkout dev
git merge feature/entities-split
git push origin dev
```
Do NOT merge or push to main.
