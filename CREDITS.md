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

**Mystic Woods (Paid)**  
Artist: Game Endeavor  
URL: https://game-endeavor.itch.io/mystic-woods  
License: Commercial license purchased  
Usage: Forest environment tiles, slime enemies, skeleton enemy

**Anokolisa Top-Down RPG Pack**  
Artist: Anokolisa  
URL: https://anokolisa.itch.io/dungeon-crawler-pixel-art-asset-pack  
License: Free for commercial use — credit required  
Usage: Weapon icons, item sprites

## Audio

[Add each file as you download it:]
**[filename].wav/mp3**  
Creator: [username on freesound or Pixabay]  
URL: [direct link]  
License: CC0  
Usage: [what it's used for in game]

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
