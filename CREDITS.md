# Seedkeeper — Asset Credits

## Art

**Sprout Lands (Premium)**  
Artist: Cup Nooble  
URL: https://cupnooble.itch.io/sprout-lands-asset-pack  
License: Commercial license purchased  
Usage: Garden environment tiles, player character, garden objects, fence, chest

**Sprout Lands UI Pack**  
Artist: Cup Nooble  
URL: https://cupnooble.itch.io/sprout-lands-ui-pack  
License: [check purchase page]  
Usage: UI panels, buttons, inventory icons

**Mystic Woods (Free pack on disk)**  
Artist: Game Endeavor  
URL: https://game-endeavor.itch.io/mystic-woods  
License: Commercial license purchased (free pack present locally; most decor/object
sheets are "Premium Version" watermarked placeholders)  
Usage: Forest environment tiles, slime enemies, skeleton enemy. Sprint 10: dust
particle sheet (`dust_particles_01.png` → `fx_dust.png`) reused for sparse forest
ambient motes.

**Sprout Lands — Sprint 10 object/UI integration**  
- `Water well.png` → `obj_well.png` (garden well sprite)  
- `Tilesets/Building parts/Chest.png` → `obj_chest.png` (workshop chest, 48x48 sheet
  with open/closed frames; drives the Sprint 9 chest-open animation)  
- UI Pack `Inventory_Blocks_Spritesheet.png` → `ui_slot_frame.png` (HUD seed-slot frames)

**Sprint 11 notes:**  
- Weather HUD uses emoji icons (the Sprout Lands `Weather_Icons_small.png` sheet is
  present and could replace them later; emoji avoids frame-index guesswork).  
- Rock-formation obstacles use a generated `px_rock` texture — no confidently
  sliceable rock sprite in the free packs (Sprout Lands `Mushrooms, Flowers,
  Stones.png` exists but frame mapping is unverified). TODO: swap to real stone art.  
- World-detail objects reuse `props_decor` frames as their markers.  
- Tool-use animations (Sprint 11 Feature 7) — skipped: no `spriteConfig.json` and the
  player sheet's tool-row layout is unknown, so no frames to wire (per prompt's
  "skip if frames don't exist").

**Sprint 10 TODOs (assets present but not yet wired — kept placeholders to avoid
regressions):**  
- Sleep bed sprite — `Basic_Furniture.png` layout ambiguous; placeholder rectangle kept.  
- Garden fence gate — `Fence gates animation sprites .png` frame geometry unverified.  
- Upgrade panel / BUY buttons — Sprout Lands dialog box + button sheets exist
  (`dialog box.png`, `Square Buttons 26x26.png`); reskin deferred to avoid breaking the
  working purchase layout.  
- Watering-can HUD icon — `tools and meterials.png`; emoji 💧 kept for now.  
- Parallax forest background — no far/sky/background art shipped in any pack; skipped.  
- Anokolisa spider/crawler enemy visual variant — deferred (no mechanic change intended).

**Anokolisa Top-Down RPG Pack**  
Artist: Anokolisa  
URL: https://anokolisa.itch.io/dungeon-crawler-pixel-art-asset-pack  
License: Free for commercial use — credit required  
Usage: Weapon icons, item sprites

## Audio

**Sprout Lands — "Sprout Sorry" SFX pack**
Artist: Cup Nooble
URL: https://cupnooble.itch.io/sprout-lands-asset-pack
License: Per Sprout Lands asset license
Usage (Sprint 8 — placeholder SFX, easily swapped): seed collect, harvest, upgrade,
attack swing, enemy hit, player hit, enemy death, sleep, zone gate, watering.
Mapped to game events in `/src/systems/AudioSystem.js`; source files renamed to the
manifest keys in `/assets/audio/`.

**Music — TODO**
bgm_garden / bgm_forest not yet sourced (no music in the current asset packs).
The crossfade + volume system is wired and will pick the tracks up automatically
once `bgm_garden.mp3` / `bgm_forest.mp3` are dropped into `/assets/audio/`.

**SFX — TODO (Sprint 9)**
`sfx_step` (footstep) not yet sourced. Player.updateFootsteps() already plays it at
a randomised pitch with speed-scaled cadence and is silent until the file lands;
drop `sfx_step.wav` into `/assets/audio/` and it loads automatically.

## Frameworks & Tools

**Phaser 3** — https://phaser.io — MIT License  
**Vite** — https://vitejs.dev — MIT License  
**Tiled Map Editor** — https://mapeditor.org — GPL License (tool only, not in game)

## Development

Built by Jaxon Travis  
AI-assisted development using Claude (Anthropic)  
All design decisions, creative direction, and product vision by the developer

## Portfolio Embed

The production build in `/dist/` is fully self-contained (relative asset paths via
`base: './'`), so it runs from any static host or inside an iframe with no
server-side dependencies. Embed code for the portfolio page:

```html
<iframe
  src="https://seedkeeper.jaxontravis.com/"
  width="100%"
  height="600"
  frameborder="0"
  allowfullscreen
  style="max-width: 1600px; aspect-ratio: 16/9; border: none;">
</iframe>
```

Local verification: `npm run build` then `npx serve dist` and open in a browser —
everything should load and play with no dev server running.
