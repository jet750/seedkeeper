// main.js — Seedkeeper entry point.
//
// Boots Phaser with a FIT-scaled virtual 1600x900 canvas and registers the
// scene flow: Boot → Menu → Game (+ parallel UI).

import Phaser from 'phaser';
import sproutFontUrl from '/assets/fonts/sproutlands-font.ttf?url';
import sproutFontSmallUrl from '/assets/fonts/sproutlands-font-small.ttf?url';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './core/Constants.js';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import UpgradeScene from './scenes/UpgradeScene.js';
import WinScene from './scenes/WinScene.js';
import SignpostScene from './scenes/SignpostScene.js';
import SeedDictScene from './scenes/SeedDictScene.js';
import DevMenuScene from './scenes/DevMenuScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0a1a0a',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [
    BootScene,
    MenuScene,
    GameScene,
    UIScene,
    UpgradeScene,
    WinScene,
    SignpostScene,
    SeedDictScene,
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
