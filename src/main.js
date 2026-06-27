// main.js — Seedkeeper entry point.
//
// Boots Phaser with a FIT-scaled virtual 1600x900 canvas and registers the
// scene flow: Boot → Menu → Game (+ parallel UI).

import Phaser from 'phaser';
import { inject } from '@vercel/analytics';
import sproutFontUrl from '/assets/fonts/sproutlands-font.ttf?url';
import sproutFontSmallUrl from '/assets/fonts/sproutlands-font-small.ttf?url';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './core/Constants.js';
import MobileDetect from './core/MobileDetect.js';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import UpgradeScene from './scenes/UpgradeScene.js';
import MarketplaceScene from './scenes/MarketplaceScene.js';
import WinScene from './scenes/WinScene.js';
import SignpostScene from './scenes/SignpostScene.js';
import SeedDictScene from './scenes/SeedDictScene.js';
import PauseScene from './scenes/PauseScene.js';
import SettingsScene from './scenes/SettingsScene.js';
import CreditsScene from './scenes/CreditsScene.js';
import DevMenuScene from './scenes/DevMenuScene.js';

// Vercel Web Analytics (vanilla JS — not the React/Next component form). Injects the
// pageview beacon once at boot; mode tracks the Vite build so dev traffic stays out of
// production stats.
inject({ mode: import.meta.env.PROD ? 'production' : 'development' });

// Detected once at boot. Drives the touch control layer (instantiated only in
// UIScene), the 3-pointer input budget (joystick + two action buttons), and the
// lighter mobile physics/render profile. Desktop sees none of this.
const isMobile = MobileDetect.isMobile();

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0a1a0a',
  pixelArt: true,
  roundPixels: true,
  // GPU hints for mobile — never fail the context on an integrated/low-end GPU,
  // and ask for the high-performance one when the device offers a choice.
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false,
  scale: {
    // Mobile uses RESIZE so the canvas fills the whole viewport (no 16:9 letterbox
    // bands) and a larger screen simply shows more world at CAMERA_ZOOM. Desktop
    // stays on FIT — RESIZE at a sub-1600 desktop window would change the world FOV
    // and HUD scale, which the "desktop unchanged" guardrail forbids. At exactly
    // 1600x900 the two modes are identical, so this only diverges on real phones.
    // Under RESIZE the HUD coordinate space becomes the live screen size, so UIScene
    // re-runs layoutHUD() on every Scale 'resize' (see UIScene.onResize).
    mode: isMobile ? Phaser.Scale.RESIZE : Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT
  },
  // Support up to 3 simultaneous touches (joystick + attack + interact) so a
  // thumb on the stick never blocks a button press. Default is 1.
  input: { activePointers: 3 },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
      // 30Hz physics on mobile halves the integration cost; the game is
      // velocity-driven so it stays smooth. Desktop keeps the 60Hz default.
      fps: isMobile ? 30 : 60
    }
  },
  scene: [
    BootScene,
    MenuScene,
    GameScene,
    UIScene,
    UpgradeScene,
    MarketplaceScene,
    WinScene,
    SignpostScene,
    SeedDictScene,
    PauseScene,
    SettingsScene,
    CreditsScene,
    DevMenuScene
  ]
};

// Register the Sprout Lands pixel font before any scene renders text, so every
// `fontFamily: '"SproutLands", ...'` resolves to the real face instead of the
// Courier fallback. Loading is best-effort: if a face fails, the fallback shows
// and the game still boots (no hang).
function loadGameFonts() {
  if (typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve();
  const faces = [
    ['SproutLands', sproutFontUrl],
    ['SproutLandsSmall', sproutFontSmallUrl]
  ];
  return Promise.all(
    faces.map(([name, url]) =>
      new FontFace(name, `url(${url})`)
        .load()
        .then((face) => document.fonts.add(face))
        .catch((err) => console.info(`[fonts] ${name} failed to load, using fallback`, err))
    )
  );
}

// Drive the canvas off the TRUE visible area on mobile. window.innerHeight on iOS
// Safari includes the strip behind the collapsing address bar, so the game would be
// sized into space the user can't see; window.visualViewport excludes it. We resize
// the Phaser scale to the visualViewport on its own 'resize' event (fires when the
// toolbar expands/collapses) AND on orientationchange, and pin the parent's pixel
// size to match so Phaser's RESIZE parent-read agrees instead of fighting us. The
// Scale Manager then emits 'resize', which UIScene listens for to reflow the HUD —
// that chain is what makes portrait<->landscape reflow live without a page reload.
function setupViewportSizing(game) {
  const vv = window.visualViewport;
  const parent = document.getElementById('game-container');
  const apply = () => {
    const w = Math.round(vv ? vv.width : window.innerWidth);
    const h = Math.round(vv ? vv.height : window.innerHeight);
    if (parent) {
      parent.style.width = `${w}px`;
      parent.style.height = `${h}px`;
    }
    if (game.scale) game.scale.resize(w, h);
  };
  if (vv) vv.addEventListener('resize', apply);
  // orientationchange fires before the new dimensions settle, so apply after a beat.
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
  // Sync once the Scale Manager is live (its size is otherwise the 1600x900 base).
  game.events.once(Phaser.Core.Events.READY, apply);
}

loadGameFonts().finally(() => {
  const game = new Phaser.Game(config);
  if (isMobile) setupViewportSizing(game);
});
