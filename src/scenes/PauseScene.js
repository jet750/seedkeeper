// PauseScene.js
//
// In-game pause overlay (Sprint 12), launched by GameScene when ESC is pressed
// during PLAYING. GameScene pauses physics and transitions GameState → PAUSED
// before launching this. Resume restores physics + PLAYING; Settings opens the
// shared SettingsScene on top; Return to Menu auto-saves first, then routes to
// the menu through a valid PAUSED → MENU transition.
//
// Sprint mobile-polish-menus (Phase 4): ported onto the shared PaginatedMenu controller
// (full-bleed backdrop + frame math + footer) so it sizes up and reads cleanly on a phone
// in both orientations — the old fixed 420x430 virtual panel rendered unreadably small under
// the mobile RESIZE scale mode. The footer's Close button IS Resume (green); the body holds
// Controls / Settings / Return to Menu. Esc still resumes (guarded against child overlays).

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import GameState from '../core/GameState.js';
import PaginatedMenu from '../ui/PaginatedMenu.js';
import { FONT_FAMILY } from '../core/Constants.js';

const COLOR_PAGE = 0x141210;
const HEADER_H = 104;
const FOOTER_H = 84;
const BTN_H = 60; // // TUNE — sized-up body option height
const BTN_GAP = 16; // // TUNE — gap between body options
const BTN_MAX_W = 360; // // TUNE — widest a body/footer button grows

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
    this.menu = new PaginatedMenu(this, {
      margin: 20,
      headerH: HEADER_H,
      footerH: FOOTER_H,
      depth: 300,
      backdropColor: COLOR_PAGE,
      backdropAlpha: 0.96,
      closeW: BTN_MAX_W,
      closeH: 56,
      closeColor: 0x3a7d44, // green — the footer Close IS Resume
      closeLabelMobile: 'Resume',
      closeLabelDesktop: 'Resume   ·   Esc',
      footerTextColor: '#F5EFE6',
      swipeEnabled: () => false, // a pause menu shouldn't swipe-page / swipe-dismiss
      dismissOnSwipeDown: false,
      closeOnEsc: false, // own Esc handler below (guards child overlays)
      onClose: () => this.resumeGame(),
      getPages: () => [null], // single page — the option list
      renderHeader: (frame) => this.renderHeader(frame),
      renderBody: (frame) => this.renderBody(frame),
      button: (cx, cy, w, h, label, fill, onClick, enabled, textColor) =>
        this.track(this.makeButton(cx, cy, w, h, label, fill, enabled, onClick, textColor))
    });
    this.menu.attachInput();
    this.menu.render();
    this.scale.on('resize', this.onResize, this);

    // Esc resumes only when no child overlay (settings / controls) owns it.
    this._onEsc = () => {
      if (!this._settingsOpen && !this._controlsOpen) this.resumeGame();
    };
    this.input.keyboard.on('keydown-ESC', this._onEsc);

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
      this.scale.off('resize', this.onResize, this);
      EventBus.off('settings:closed', this._onSettingsClosed);
      EventBus.off('controls:closed', this._onControlsClosed);
      this.input.keyboard.removeAllListeners();
      this.menu.destroy();
    });
  }

  onResize() {
    this.menu.render();
  }

  track(objs) {
    this.menu.track(...(Array.isArray(objs) ? objs : [objs]));
    return objs;
  }

  // --- Header: PAUSED title + day/zone line ----------------------------------

  renderHeader(frame) {
    const { cx, headerTop } = frame;
    this.track(
      this.add
        .text(cx, headerTop + 10, 'PAUSED', {
          fontFamily: FONT_FAMILY,
          fontSize: '46px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(0.5, 0)
        .setDepth(302)
    );
    const zoneLabel = this.zone === 'forest' ? 'Forest' : 'Garden';
    this.track(
      this.add
        .text(cx, headerTop + 66, `Day ${this.dayNumber}  •  ${zoneLabel}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '18px',
          color: '#9B9389'
        })
        .setOrigin(0.5, 0)
        .setDepth(302)
    );
  }

  // --- Body: the sized-up option list (Resume lives in the footer) -----------

  renderBody(frame) {
    const { cx, contentTop, contentBottom, innerW } = frame;
    const opts = [
      ['Controls', () => this.openControls()],
      ['Settings', () => this.openSettings()],
      ['Return to Menu', () => this.toMenu()]
    ];
    const n = opts.length;
    const w = Math.min(BTN_MAX_W, innerW - 24);
    const totalH = n * BTN_H + (n - 1) * BTN_GAP;
    const startCY = (contentTop + contentBottom) / 2 - totalH / 2 + BTN_H / 2;
    opts.forEach(([label, fn], i) => {
      this.track(
        this.makeButton(cx, startCY + i * (BTN_H + BTN_GAP), w, BTN_H, label, 0x36322e, true, fn, '#F5EFE6')
      );
    });
  }

  makeButton(cx, cy, w, h, label, color, enabled, onClick, textColor) {
    const rect = this.add
      .rectangle(cx, cy, w, h, color)
      .setStrokeStyle(2, 0x000000)
      .setDepth(302);
    const text = this.add
      .text(cx, cy, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: textColor || '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(303);
    if (enabled) {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => rect.setStrokeStyle(2, 0xeac34f));
      rect.on('pointerout', () => rect.setStrokeStyle(2, 0x000000));
      rect.on('pointerup', onClick);
    } else {
      rect.setAlpha(0.6);
    }
    return [rect, text];
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
