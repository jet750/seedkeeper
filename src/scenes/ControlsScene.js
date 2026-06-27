// ControlsScene.js
//
// Controls / help screen (Sprint control-scheme-combat-input). Launched on top of the
// pause overlay; lists every binding for the current platform and reflows to the live
// viewport in both orientations (built from this.scale.width/height + safe insets, the
// same pattern MapScene uses — no fixed 1600x900 camera, so it fits a phone too).
//
// GRACEFUL-DEGRADATION NOTE (per the overnight sprint spec): this ships as a fully
// working READ-ONLY bindings list. Remapping + conflict detection were deliberately
// NOT shipped half-built — see the clearly-scaffolded TODO at the bottom of this file.
// The single source of truth for the bindings is the two arrays below; when remapping
// lands it should read/write these (or a persisted copy) instead of being hardcoded.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import {
  FONT_FAMILY,
  UI_BACKDROP_COLOR,
  UI_BACKDROP_ALPHA,
  UI_PANEL_COLOR,
  UI_BORDER_COLOR,
  UI_ACCENT_GOLD
} from '../core/Constants.js';

// Desktop bindings — [action, keys]. Mirrors Player.keys + GameScene input wiring.
const DESKTOP_BINDINGS = [
  ['Move', 'WASD / Arrows'],
  ['Melee attack', 'Q  /  Left-click'],
  ['Fire secondary', 'R  /  Right-click'],
  ['Select secondary 1-5', '1  2  3  4  5'],
  ['Dash', 'Space'],
  ['Strafe (lock facing)', 'Hold Shift'],
  ['Interact', 'E  (F)'],
  ['Auto-target toggle', 'T'],
  ['Map', 'M'],
  ['Inventory', 'Tab / I  (coming soon)'],
  ['Pause', 'Esc'],
  ['Dev menu', '`  (backtick)']
];

// Mobile bindings — the on-screen control surface.
const MOBILE_BINDINGS = [
  ['Move', 'Left thumbstick'],
  ['Melee attack', '⚔ button'],
  ['Fire secondary', '🏹 button (tap)'],
  ['Secondary radial', 'Hold 🏹, drag, release'],
  ['Dash', '⚡ button'],
  ['Interact', 'E button'],
  ['Map', 'MAP button'],
  ['Pause', '⏸ button'],
  ['Auto-target', 'Always on'],
  ['Dev menu', '10 taps on MAP']
];

const MARGIN = 26;
const HEADER_H = 64;
const FOOTER_H = 96; // back button + the remapping note
const ROW_H = 40;
const ROW_H_MIN = 24;
const ROW_GAP = 4;
const PANEL_MAX_W = 560;

export default class ControlsScene extends Phaser.Scene {
  constructor() {
    super('ControlsScene');
  }

  create() {
    this._objs = [];
    this.build();
    this.scale.on('resize', this.onResize, this);
    this.input.keyboard.on('keydown-ESC', () => this.close());
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.input.keyboard.removeAllListeners();
    });
  }

  onResize() {
    this.build();
  }

  close() {
    EventBus.emit('controls:closed', {});
    this.scene.stop();
  }

  // (Re)draw from the live viewport — called on create and every resize so the screen
  // reflows portrait<->landscape with no reload.
  build() {
    this._objs.forEach((o) => o.destroy());
    this._objs = [];

    const w = this.scale.width;
    const h = this.scale.height;
    const safe = MobileDetect.isMobile()
      ? MobileDetect.getRawInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };
    const isMobile = MobileDetect.isMobile();
    const bindings = isMobile ? MOBILE_BINDINGS : DESKTOP_BINDINGS;
    const n = bindings.length;

    // Full-bleed dim backdrop; a tap closes (Back button + Esc also close).
    const backdrop = this.add
      .rectangle(0, 0, w, h, UI_BACKDROP_COLOR, UI_BACKDROP_ALPHA)
      .setOrigin(0, 0)
      .setDepth(360)
      .setInteractive();
    backdrop.on('pointerup', () => this.close());
    this._objs.push(backdrop);

    // Panel sized within the safe insets; rows shrink to fit a short screen.
    const availTop = safe.top + MARGIN;
    const availBottom = h - safe.bottom - MARGIN;
    const availH = availBottom - availTop;
    let rowH = ROW_H;
    const chromeH = HEADER_H + FOOTER_H;
    if (n * rowH + (n - 1) * ROW_GAP > availH - chromeH) {
      rowH = Math.max(ROW_H_MIN, (availH - chromeH - (n - 1) * ROW_GAP) / n);
    }
    const rowsH = n * rowH + (n - 1) * ROW_GAP;
    const panelW = Math.min(w - 2 * MARGIN, PANEL_MAX_W);
    const panelH = Math.min(availH, HEADER_H + rowsH + FOOTER_H);
    const cx = w / 2;
    const panelTop = Math.max(availTop, (h - panelH) / 2);
    const left = cx - panelW / 2 + 24;
    const right = cx + panelW / 2 - 24;

    this._objs.push(
      this.add
        .rectangle(cx, panelTop + panelH / 2, panelW, panelH, UI_PANEL_COLOR, 0.98)
        .setStrokeStyle(2, UI_BORDER_COLOR)
        .setDepth(361)
    );
    this._objs.push(
      this.add
        .text(cx, panelTop + 16, 'CONTROLS', {
          fontFamily: FONT_FAMILY,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(0.5, 0)
        .setDepth(362)
    );
    this._objs.push(
      this.add
        .text(cx, panelTop + 44, isMobile ? 'Touch controls' : 'Keyboard & mouse', {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          color: '#9B9389'
        })
        .setOrigin(0.5, 0)
        .setDepth(362)
    );

    // Binding rows — action left, keys right.
    const rowTop = panelTop + HEADER_H;
    const labelPx = `${Math.max(12, Math.round(Math.min(17, rowH * 0.42)))}px`;
    bindings.forEach(([action, keys], i) => {
      const ry = rowTop + i * (rowH + ROW_GAP) + rowH / 2;
      if (i % 2 === 0) {
        this._objs.push(
          this.add.rectangle(cx, ry, panelW - 28, rowH, 0x2d2926, 0.5).setDepth(361)
        );
      }
      this._objs.push(
        this.add
          .text(left, ry, action, {
            fontFamily: FONT_FAMILY,
            fontSize: labelPx,
            color: '#F5EFE6'
          })
          .setOrigin(0, 0.5)
          .setDepth(362)
      );
      this._objs.push(
        this.add
          .text(right, ry, keys, {
            fontFamily: FONT_FAMILY,
            fontSize: labelPx,
            color: '#8AB87E'
          })
          .setOrigin(1, 0.5)
          .setDepth(362)
      );
    });

    // Footer — remapping note (the documented cut) + Back button.
    const noteY = panelTop + panelH - FOOTER_H + 14;
    this._objs.push(
      this.add
        .text(cx, noteY, 'Remapping & conflict detection — coming soon', {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: '#9B9389',
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(362)
    );

    const backY = panelTop + panelH - 30;
    const back = this.add
      .rectangle(cx, backY, Math.min(240, panelW - 48), 40, 0x36322e)
      .setStrokeStyle(2, 0x000000)
      .setDepth(362)
      .setInteractive({ useHandCursor: true });
    const backLabel = this.add
      .text(cx, backY, 'Back', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(363);
    back.on('pointerover', () => back.setStrokeStyle(2, UI_ACCENT_GOLD));
    back.on('pointerout', () => back.setStrokeStyle(2, 0x000000));
    back.on('pointerup', () => this.close());
    this._objs.push(back, backLabel);
  }

  // --- TODO(remapping) — scaffolded, intentionally NOT shipped this sprint ---
  // The read-only list above is complete. Remapping + conflict detection were cut to
  // avoid shipping a half-built, bug-prone rebinder overnight. When implemented:
  //   1. Lift DESKTOP_BINDINGS/MOBILE_BINDINGS into a persisted, mutable keymap (bump
  //      the save version — keybindings are persistent state).
  //   2. Make each desktop row a "click to rebind → capture next keydown" control.
  //   3. Conflict detection: reject/await-confirm a key already bound to another action;
  //      surface the clash inline. Do NOT half-ship this — a silent mis-bind is worse
  //      than no remap.
  //   4. Re-seed Player.keys / GameScene input from the keymap on apply + on load.
}
