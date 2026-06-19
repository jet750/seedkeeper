// main.js — Seedkeeper entry point.
//
// Boots Phaser with a FIT-scaled virtual 1600x900 canvas and registers the
// scene flow: Boot → Menu → Game (+ parallel UI).

import Phaser from 'phaser';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './core/Constants.js';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import UpgradeScene from './scenes/UpgradeScene.js';
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
  scene: [BootScene, MenuScene, GameScene, UIScene, UpgradeScene, DevMenuScene]
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
