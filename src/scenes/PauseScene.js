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
const PANEL_H = 430; // +Controls button (Sprint control-scheme-combat-input)

export default class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  init(data) {
    this.dayNumber = (data && data.dayNumber) || 1;
    this.zone = (data && data.zone) || 'garden';
    this._settingsOpen = false;
    this._controlsOpen = false;
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

    const btnY = cy - 66;
    this.makeButton(cx, btnY, 280, 52, 'Resume', 0x3a7d44, () => this.resumeGame());
    this.makeButton(cx, btnY + 60, 280, 52, 'Controls', 0x36322e, () => this.openControls());
    this.makeButton(cx, btnY + 120, 280, 52, 'Settings', 0x36322e, () => this.openSettings());
    this.makeButton(cx, btnY + 180, 280, 52, 'Return to Menu', 0x36322e, () => this.toMenu());

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
      // Esc only resumes when no child overlay (settings / controls) owns it.
      if (!this._settingsOpen && !this._controlsOpen) this.resumeGame();
    });

    // Track child overlays so ESC doesn't both close the child AND resume.
    this._onSettingsClosed = () => {
      this._settingsOpen = false;
    };
    this._onControlsClosed = () => {
      this._controlsOpen = false;
    };
    EventBus.on('settings:closed', this._onSettingsClosed);
    EventBus.on('controls:closed', this._onControlsClosed);
    this.events.once('shutdown', () => {
      EventBus.off('settings:closed', this._onSettingsClosed);
      EventBus.off('controls:closed', this._onControlsClosed);
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

  openControls() {
    if (this._controlsOpen) return;
    this._controlsOpen = true;
    this.scene.launch('ControlsScene');
    this.scene.bringToTop('ControlsScene');
  }

  // Save the run, tear down the gameplay scenes, and return to the title.
  toMenu() {
    const gameScene = this.scene.get('GameScene');
    if (gameScene && typeof gameScene.autoSave === 'function') gameScene.autoSave();

    // PAUSED → MENU is a valid transition; MenuScene re-asserts MENU on create.
    GameState.transition('MENU');

    ['SettingsScene', 'ControlsScene', 'UpgradeScene', 'SignpostScene', 'SeedDictScene', 'MapScene', 'UIScene', 'DevMenuScene', 'GameScene'].forEach(
      (key) => {
        if (this.scene.get(key)) this.scene.stop(key);
      }
    );

    this.scene.start('MenuScene');
    this.scene.stop();
  }
}
