// PauseScene.js
//
// In-game pause overlay (Sprint 12), launched by GameScene when ESC is pressed
// during PLAYING. GameScene pauses physics and transitions GameState → PAUSED
// before launching this. Resume restores physics + PLAYING; Settings opens the
// shared SettingsScene on top; Return to Menu auto-saves first, then routes to
// the menu through a valid PAUSED → MENU transition.

import Phaser from 'phaser';
import { fitCameraToVirtual } from '../core/ViewportFit.js';
import EventBus from '../core/EventBus.js';
import GameState from '../core/GameState.js';
import {
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  FONT_FAMILY,
  UI_PANEL_COLOR,
  UI_PANEL_ALPHA,
  UI_BORDER_COLOR,
  UI_BACKDROP_COLOR,
  UI_BACKDROP_ALPHA,
  UI_ACCENT_GOLD
} from '../core/Constants.js';

const PANEL_W = 420;
const PANEL_H = 360;

export default class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  init(data) {
    this.dayNumber = (data && data.dayNumber) || 1;
    this.zone = (data && data.zone) || 'garden';
    this._settingsOpen = false;
  }

  create() {
    fitCameraToVirtual(this);
    const cx = VIRTUAL_WIDTH / 2;
    const cy = VIRTUAL_HEIGHT / 2;

    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, UI_BACKDROP_COLOR, UI_BACKDROP_ALPHA)
      .setOrigin(0, 0)
      .setDepth(300)
      .setInteractive();

    this.add
      .rectangle(cx, cy, PANEL_W, PANEL_H, UI_PANEL_COLOR, UI_PANEL_ALPHA)
      .setStrokeStyle(2, UI_BORDER_COLOR)
      .setDepth(301);

    this.add
      .text(cx, cy - PANEL_H / 2 + 44, 'PAUSED', {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setOrigin(0.5)
      .setDepth(302);

    this.add
      .rectangle(cx, cy - PANEL_H / 2 + 78, PANEL_W - 80, 2, UI_BORDER_COLOR)
      .setDepth(302);

    const btnY = cy - 40;
    this.makeButton(cx, btnY, 280, 52, 'Resume', 0x3a7d44, () => this.resumeGame());
    this.makeButton(cx, btnY + 64, 280, 52, 'Settings', 0x36322e, () => this.openSettings());
    this.makeButton(cx, btnY + 128, 280, 52, 'Return to Menu', 0x36322e, () => this.toMenu());

    const zoneLabel = this.zone === 'forest' ? 'Forest' : 'Garden';
    this.add
      .text(cx, cy + PANEL_H / 2 - 28, `Day ${this.dayNumber}  •  ${zoneLabel}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: '#9B9389'
      })
      .setOrigin(0.5)
      .setDepth(302);

    this.input.keyboard.on('keydown-ESC', () => {
      if (!this._settingsOpen) this.resumeGame();
    });

    // Track the settings overlay so ESC doesn't both close settings AND resume.
    this._onSettingsClosed = () => {
      this._settingsOpen = false;
    };
    EventBus.on('settings:closed', this._onSettingsClosed);
    this.events.once('shutdown', () => {
      EventBus.off('settings:closed', this._onSettingsClosed);
      this.input.keyboard.removeAllListeners();
    });
  }

  makeButton(cx, cy, w, h, label, color, onClick) {
    const rect = this.add
      .rectangle(cx, cy, w, h, color)
      .setStrokeStyle(2, 0x000000)
      .setDepth(302)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(303);
    rect.on('pointerover', () => rect.setStrokeStyle(2, UI_ACCENT_GOLD));
    rect.on('pointerout', () => rect.setStrokeStyle(2, 0x000000));
    rect.on('pointerup', onClick);
    return rect;
  }

  resumeGame() {
    EventBus.emit('pause:resume', {});
    this.scene.stop();
  }

  openSettings() {
    if (this._settingsOpen) return;
    this._settingsOpen = true;
    this.scene.launch('SettingsScene', { from: 'pause' });
    this.scene.bringToTop('SettingsScene');
  }

  // Save the run, tear down the gameplay scenes, and return to the title.
  toMenu() {
    const gameScene = this.scene.get('GameScene');
    if (gameScene && typeof gameScene.autoSave === 'function') gameScene.autoSave();

    // PAUSED → MENU is a valid transition; MenuScene re-asserts MENU on create.
    GameState.transition('MENU');

    ['SettingsScene', 'UpgradeScene', 'SignpostScene', 'SeedDictScene', 'UIScene', 'DevMenuScene', 'GameScene'].forEach(
      (key) => {
        if (this.scene.get(key)) this.scene.stop(key);
      }
    );

    this.scene.start('MenuScene');
    this.scene.stop();
  }
}
