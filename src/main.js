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
    // FIT + CENTER already absorbs the Chrome URL-bar viewport shift (it
    // recomputes on resize), so no manual innerHeight lock is needed here.
    mode: Phaser.Scale.FIT,
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

// eslint-disable-next-line no-new
loadGameFonts().finally(() => new Phaser.Game(config));
