// DevMenuScene.js
//
// In-game developer cheat menu (toggle with the ~ key). Launched as a parallel
// scene alongside GameScene/UIScene; it is completely inert unless the dev menu
// is active (DEV_MODE === true in Constants.js, or the page URL contains
// ?dev=true). When inactive it renders nothing, captures no input, and emits no
// events — flipping DEV_MODE to false disables it entirely.
//
// Architecture: this scene is presentation-only. Every cheat is dispatched as a
// `dev:*` EventBus event that GameScene (the owner of game state) executes; the
// menu never calls Player/GameScene methods directly. GameScene then emits the
// canonical events (bank:updated, player:healed, inventory:changed, …) so the
// HUD and other listeners stay in sync.

import Phaser from 'phaser';
import { fitCameraToVirtual } from '../core/ViewportFit.js';
import EventBus from '../core/EventBus.js';
import { VIRTUAL_WIDTH, isDevModeActive } from '../core/Constants.js';

// Sprint 14: the grant grid now lists EVERY current plant (derived at build time
// from gameData.plants — the reconciled 12: 10 growable + the 2 sell-only melons),
// so retired plants drop off automatically and new ones appear without edits here.
// The grid is 2 columns; its row count is computed from the plant count.

const PANEL_W = 388;
const PANEL_H = 770; // Sprint 14: taller to fit the full 12-plant grant grid (6 rows)
const PANEL_X = VIRTUAL_WIDTH - PANEL_W - 8; // 1204
const PANEL_TOP = 6;
const PAD = 12;
const CONTENT_X = PANEL_X + PAD;
const CONTENT_W = PANEL_W - PAD * 2;
const HALF_W = (CONTENT_W - 8) / 2;
const BTN_H = 24;

const COLOR_BTN = 0x2d2926;
const COLOR_DANGER = 0x6a2a2a;
const COLOR_HEADER = '#EDD49A';

export default class DevMenuScene extends Phaser.Scene {
  constructor() {
    super('DevMenuScene');
  }

  create() {
    this.isActive = isDevModeActive();
    if (!this.isActive) return; // dormant — renders nothing, no input, no events

    this.gameScene = this.scene.get('GameScene');
    if (!this.gameScene) return;
    fitCameraToVirtual(this);
    this.gameData = this.gameScene.gameData;

    this.menuOpen = false;
    this.uiObjects = [];
    this._speedOn = false; // dev 2x-speed toggle state (Sprint 7)
    this._noclipOn = false; // dev no-clip toggle state (Sprint 7)

    this.buildPanel();
    this.setMenuVisible(false);

    // Toggle key (~). Polled in update() so it works regardless of focus order.
    this.toggleKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);

    // Keep the day readout / gear tiers fresh when day changes from any source.
    this._onExternalChange = () => {
      if (this.menuOpen) this.refreshDisplays();
    };
    EventBus.on('day:advanced', this._onExternalChange);
    EventBus.on('day:dayChanged', this._onExternalChange);
    this.events.once('shutdown', this.teardown, this);
    this.events.once('destroy', this.teardown, this);
  }

  update() {
    if (!this.isActive) return;
    if (Phaser.Input.Keyboard.JustDown(this.toggleKey)) {
      this.setMenuVisible(!this.menuOpen);
    }
  }

  // --- Panel construction ---------------------------------------------------

  buildPanel() {
    // Backdrop (created first so it sits behind the controls).
    this.track(
      this.add
        .rectangle(PANEL_X, PANEL_TOP, PANEL_W, PANEL_H, 0x141210, 0.86)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0xc0392b)
        .setDepth(200)
    );

    let y = 12;

    this.track(
      this.add
        .text(CONTENT_X, y, '⚠ DEV MODE', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#ff4d4d'
        })
        .setDepth(202)
    );
    this.track(
      this.add
        .text(PANEL_X + PANEL_W - PAD, y + 2, '~ toggle', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '11px',
          color: '#9B9389'
        })
        .setOrigin(1, 0)
        .setDepth(202)
    );
    y += 28;

    // --- Bank ---
    y = this.sectionHeader('BANK', y);
    this.makeButton(CONTENT_X, y, CONTENT_W, 'Fill All Banks (20)', () =>
      this.dispatch('dev:fillBank')
    );
    y += BTN_H + 4;
    // Every current plant (the reconciled 12), 2-col grid. Derived from the data so
    // retired plants never appear and added plants show up without touching this file.
    const plantKeys = Object.keys(this.gameData.plants);
    plantKeys.forEach((pt, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = CONTENT_X + col * (HALF_W + 8);
      const by = y + row * (BTN_H + 4);
      this.makeButton(
        bx,
        by,
        HALF_W,
        `+10 ${this.gameData.plants[pt].name}`,
        () => this.dispatch('dev:addBank', { plantType: pt, amount: 10 }),
        { textColor: this.gameData.plants[pt].color }
      );
    });
    y += Math.ceil(plantKeys.length / 2) * (BTN_H + 4) + 8;

    // --- Day ---
    y = this.sectionHeader('DAY CONTROL', y);
    this.dayValueText = this.add
      .text(CONTENT_X, y, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '13px',
        color: '#F5EFE6'
      })
      .setDepth(202);
    this.track(this.dayValueText);
    y += 18;
    const dayW = (CONTENT_W - 16) / 3;
    [['-1 Day', -1], ['+1 Day', 1], ['+5 Days', 5]].forEach(([label, delta], i) => {
      this.makeButton(CONTENT_X + i * (dayW + 8), y, dayW, label, () => {
        this.dispatch('dev:day', { delta });
        this.refreshDisplays();
      });
    });
    y += BTN_H + 4;
    this.track(
      this.add
        .text(CONTENT_X, y, '⚠ backward skip resets timer only', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '10px',
          color: '#C0392B'
        })
        .setDepth(202)
    );
    y += 18;

    // --- Coins (Sprint 2 dual economy) ---
    y = this.sectionHeader('COINS', y);
    this.coinValueText = this.add
      .text(CONTENT_X, y, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '13px',
        color: '#EDD49A'
      })
      .setDepth(202);
    this.track(this.coinValueText);
    y += 18;
    const coinW = (CONTENT_W - 8) / 2;
    this.makeButton(CONTENT_X, y, coinW, '+100 Coins', () => {
      this.dispatch('dev:addCoins', { amount: 100 });
      this.refreshDisplays();
    });
    this.makeButton(CONTENT_X + coinW + 8, y, coinW, '+500 Coins', () => {
      this.dispatch('dev:addCoins', { amount: 500 });
      this.refreshDisplays();
    });
    y += BTN_H + 8;

    // --- Gear & Stats ---
    y = this.sectionHeader('GEAR & STATS', y);
    this.makeButton(CONTENT_X, y, CONTENT_W, 'Grant All Gear (coin path)', () => {
      this.dispatch('dev:grantGear');
      this.refreshDisplays();
    });
    y += BTN_H + 4;
    this.makeButton(CONTENT_X, y, CONTENT_W, 'Max All Stats (10 trees)', () => {
      this.dispatch('dev:maxStats');
      this.refreshDisplays();
    });
    y += BTN_H + 8;

    // --- Cheats (Sprint 7) ---
    y = this.sectionHeader('CHEATS', y);
    this._speedBtn = this.makeButton(
      CONTENT_X,
      y,
      HALF_W,
      `2X SPEED [${this._speedOn ? 'ON' : 'OFF'}]`,
      () => {
        this._speedOn = !this._speedOn;
        this.dispatch('dev:toggleSpeed', { on: this._speedOn });
        this._speedBtn.text.setText(`2X SPEED [${this._speedOn ? 'ON' : 'OFF'}]`);
      }
    );
    this._noclipBtn = this.makeButton(
      CONTENT_X + HALF_W + 8,
      y,
      HALF_W,
      `NO-CLIP [${this._noclipOn ? 'ON' : 'OFF'}]`,
      () => {
        this._noclipOn = !this._noclipOn;
        this.dispatch('dev:toggleNoclip', { on: this._noclipOn });
        this._noclipBtn.text.setText(`NO-CLIP [${this._noclipOn ? 'ON' : 'OFF'}]`);
      }
    );
    y += BTN_H + 4;
    this.makeButton(CONTENT_X, y, CONTENT_W, 'MAX ALL CAPACITY', () => {
      this.dispatch('dev:maxCapacity');
      this.refreshDisplays();
    });
    y += BTN_H + 8;

    // --- Player ---
    y = this.sectionHeader('PLAYER', y);
    this.makeButton(CONTENT_X, y, HALF_W, 'Full Heal', () => this.dispatch('dev:fullHeal'));
    this.makeButton(CONTENT_X + HALF_W + 8, y, HALF_W, 'Restore Ammo', () =>
      this.dispatch('dev:restoreAmmo')
    );
    y += BTN_H + 8;

    // --- Enemies ---
    y = this.sectionHeader('ENEMIES', y);
    const enemyBtns = [
      ['Spawn Green Slime', () => this.dispatch('dev:spawnEnemy', { type: 'green_slime' }), {}],
      ['Spawn Dark Slime', () => this.dispatch('dev:spawnEnemy', { type: 'dark_slime' }), {}],
      ['Spawn Skeleton', () => this.dispatch('dev:spawnEnemy', { type: 'skeleton' }), {}],
      ['Clear All Enemies', () => this.dispatch('dev:clearEnemies'), { fill: COLOR_DANGER }]
    ];
    enemyBtns.forEach(([label, fn, opts], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      this.makeButton(
        CONTENT_X + col * (HALF_W + 8),
        y + row * (BTN_H + 4),
        HALF_W,
        label,
        fn,
        opts
      );
    });
    y += 2 * (BTN_H + 4) + 8;

    // --- Save ---
    y = this.sectionHeader('SAVE', y);
    this.makeButton(CONTENT_X, y, HALF_W, 'Clear Save Slot', () => this.dispatch('dev:clearSave'), {
      fill: COLOR_DANGER
    });
    this.makeButton(CONTENT_X + HALF_W + 8, y, HALF_W, 'Force Save', () =>
      this.dispatch('dev:forceSave')
    );
  }

  sectionHeader(label, y) {
    this.track(
      this.add
        .text(CONTENT_X, y, label, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '13px',
          fontStyle: 'bold',
          color: COLOR_HEADER
        })
        .setDepth(202)
    );
    return y + 20;
  }

  makeButton(x, y, w, label, onClick, opts = {}) {
    const h = opts.h || BTN_H;
    const fill = opts.fill ?? COLOR_BTN;
    const rect = this.add
      .rectangle(x, y, w, h, fill)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x57514b)
      .setDepth(201)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '12px',
        color: opts.textColor || '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(202);

    rect.on('pointerover', () => rect.setStrokeStyle(1, 0xd4a83f));
    rect.on('pointerout', () => rect.setStrokeStyle(1, 0x57514b));
    rect.on('pointerup', () => {
      if (this.menuOpen) onClick();
    });

    this.track(rect, text);
    return { rect, text };
  }

  // --- State / display ------------------------------------------------------

  dispatch(event, data = {}) {
    EventBus.emit(event, data);
  }

  refreshDisplays() {
    if (!this.gameScene) return;
    if (this.dayValueText) {
      this.dayValueText.setText(`Current day: ${this.gameScene.daySystem.dayNumber}`);
    }
    if (this.coinValueText) {
      this.coinValueText.setText(`Coins: ${this.gameScene.coins || 0}`);
    }
  }

  setMenuVisible(open) {
    this.menuOpen = open;
    this.uiObjects.forEach((o) => o.setVisible(open));
    if (open) this.refreshDisplays();
  }

  track(...objs) {
    objs.forEach((o) => this.uiObjects.push(o));
  }

  teardown() {
    EventBus.off('day:advanced', this._onExternalChange);
    EventBus.off('day:dayChanged', this._onExternalChange);
  }
}
