// ControlsScene.js
//
// Controls / help screen (Sprint control-scheme-combat-input; two-page rework in
// Sprint devmenu-controls-tutorials). Launched on top of the pause overlay; reflows to
// the live viewport in both orientations (built from this.scale.width/height + safe
// insets, the same pattern MapScene / Marketplace use — no fixed 1600x900 camera, so it
// fits a phone too).
//
// TWO PAGES: a DESKTOP page (keyboard + mouse) and a MOBILE page (the on-screen touch
// surface — joystick + diamond). Either page is reachable on either platform via the
// ◀ ▶ arrows (or LEFT/RIGHT keys / horizontal swipe), so a desktop player can preview
// the touch controls and vice-versa. The page matching the current platform is shown
// first.
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

// Desktop bindings — [action, keys]. Mirrors Player.keys + GameScene input wiring
// (GameScene.js:543-572, Player.js:264-276).
const DESKTOP_BINDINGS = [
  ['Move', 'WASD / Arrows'],
  ['Melee attack', 'Q  /  Left-click'],
  ['Fire ability', 'R  /  Right-click'],
  ['Select ability 1-5', '1  2  3  4  5'],
  ['Dash', 'Space'],
  ['Strafe (lock facing)', 'Hold Shift'],
  ['Interact / plant', 'E   (F)'],
  ['Auto-target toggle', 'T'],
  ['Map', 'M'],
  ['Pause', 'Esc'],
  ['Dev menu', '`  (backtick)']
];

// Mobile bindings — the on-screen control surface (TouchControlSystem.js:244-248). The
// diamond cluster sits under the right thumb: interact (top), melee (inner/left), the
// ranged-ability button (outer/right), dash (bottom).
const MOBILE_BINDINGS = [
  ['Move', 'Left thumbstick'],
  ['Interact / plant', '🌱 button — diamond TOP'],
  ['Melee attack', '⚔ button — diamond LEFT'],
  ['Fire ability', '🏹 button — diamond RIGHT (tap)'],
  ['Switch ability', 'Hold 🏹, drag to a slot, release'],
  ['Dash', '⚡ button — diamond BOTTOM'],
  ['Map', 'MAP button (top-right)'],
  ['Pause', '⏸ button (top-left)'],
  ['Auto-target', 'Always on'],
  ['Dev menu', '10 taps on MAP']
];

const PAGES = [
  { key: 'desktop', name: 'Keyboard & Mouse', bindings: DESKTOP_BINDINGS },
  { key: 'mobile', name: 'Touch Controls', bindings: MOBILE_BINDINGS }
];

const MARGIN = 26;
const HEADER_H = 70; // title + subtitle + page name
const FOOTER_H = 118; // remapping note + page dots + Back/arrows row
const ROW_H = 40;
const ROW_H_MIN = 24;
const ROW_GAP = 4;
const PANEL_MAX_W = 580;

export default class ControlsScene extends Phaser.Scene {
  constructor() {
    super('ControlsScene');
  }

  create() {
    this._objs = [];
    // Show the page matching the current platform first; either is reachable.
    this.page = MobileDetect.isMobile() ? 1 : 0;
    this._downX = 0;
    this._downY = 0;

    // Scene-level input registered ONCE (build() only rebuilds visuals, so these never
    // accumulate across resizes).
    this.scale.on('resize', this.onResize, this);
    this.input.keyboard.on('keydown-ESC', () => this.close());
    this.input.keyboard.on('keydown-LEFT', () => this.switchPage(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.switchPage(1));
    this.input.on('pointerdown', (p) => {
      this._downX = p.x;
      this._downY = p.y;
    });
    // Mobile: horizontal swipe pages, swipe-down dismisses (no Esc key).
    if (MobileDetect.isMobile()) {
      this.input.on('pointerup', (p) => {
        const dx = p.x - this._downX;
        const dy = p.y - this._downY;
        if (Math.abs(dx) > 120 && Math.abs(dy) < 90) this.switchPage(dx < 0 ? 1 : -1);
        else if (dy > 120 && Math.abs(dx) < 90) this.close();
      });
    }

    this.build();

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.input.keyboard.removeAllListeners();
      this.input.removeAllListeners();
    });
  }

  onResize() {
    this.build();
  }

  switchPage(delta) {
    const next = Phaser.Math.Clamp(this.page + delta, 0, PAGES.length - 1);
    if (next === this.page) return;
    this.page = next;
    this.build();
  }

  close() {
    EventBus.emit('controls:closed', {});
    this.scene.stop();
  }

  // (Re)draw from the live viewport — called on create, every resize, and every page
  // switch so the screen reflows portrait<->landscape with no reload.
  build() {
    this._objs.forEach((o) => o.destroy());
    this._objs = [];

    const w = this.scale.width;
    const h = this.scale.height;
    const safe = MobileDetect.isMobile()
      ? MobileDetect.getRawInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };

    const pg = PAGES[this.page];
    const bindings = pg.bindings;
    const n = bindings.length;
    // PORTRAIT (Phase 5 sweep fix): stack each binding's value UNDER its action instead of the
    // side-by-side action-left / value-right layout, which collided in the middle of the narrow
    // portrait panel (long values like "🏹 button — diamond RIGHT (tap)" overlapped the label).
    const portrait = MobileDetect.isMobile() && w < h;

    // Full-bleed dim backdrop. A clean tap (no drag) closes; a swipe is left for the
    // page/dismiss handlers, so the close fires only when the pointer barely moved.
    const backdrop = this.add
      .rectangle(0, 0, w, h, UI_BACKDROP_COLOR, UI_BACKDROP_ALPHA)
      .setOrigin(0, 0)
      .setDepth(360)
      .setInteractive();
    backdrop.on('pointerup', (p) => {
      if (Math.abs(p.x - this._downX) < 30 && Math.abs(p.y - this._downY) < 30) this.close();
    });
    this._objs.push(backdrop);

    // Panel sized within the safe insets; rows shrink to fit a short screen.
    const availTop = safe.top + MARGIN;
    const availBottom = h - safe.bottom - MARGIN;
    const availH = availBottom - availTop;
    // Portrait stacks two text lines per row, so it needs a taller base + higher floor.
    let rowH = portrait ? 52 : ROW_H;
    const rowMin = portrait ? 40 : ROW_H_MIN;
    const chromeH = HEADER_H + FOOTER_H;
    if (n * rowH + (n - 1) * ROW_GAP > availH - chromeH) {
      rowH = Math.max(rowMin, (availH - chromeH - (n - 1) * ROW_GAP) / n);
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
        .text(cx, panelTop + 14, 'CONTROLS', {
          fontFamily: FONT_FAMILY,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(0.5, 0)
        .setDepth(362)
    );
    // Active page name — doubles as the "which page am I on" cue alongside the dots.
    this._objs.push(
      this.add
        .text(cx, panelTop + 46, pg.name, {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#8AB87E'
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
      if (portrait) {
        // Stacked: action on top, value below — both left-aligned, value wrapped to the panel
        // width so a long binding can never collide with the label.
        const valuePx = `${Math.max(11, Math.round(Math.min(15, rowH * 0.3)))}px`;
        this._objs.push(
          this.add
            .text(left, ry - rowH * 0.22, action, { fontFamily: FONT_FAMILY, fontSize: labelPx, color: '#F5EFE6' })
            .setOrigin(0, 0.5)
            .setDepth(362)
        );
        this._objs.push(
          this.add
            .text(left, ry + rowH * 0.24, keys, {
              fontFamily: FONT_FAMILY,
              fontSize: valuePx,
              color: '#8AB87E',
              wordWrap: { width: right - left }
            })
            .setOrigin(0, 0.5)
            .setDepth(362)
        );
      } else {
        this._objs.push(
          this.add
            .text(left, ry, action, { fontFamily: FONT_FAMILY, fontSize: labelPx, color: '#F5EFE6' })
            .setOrigin(0, 0.5)
            .setDepth(362)
        );
        this._objs.push(
          this.add
            .text(right, ry, keys, { fontFamily: FONT_FAMILY, fontSize: labelPx, color: '#8AB87E', align: 'right' })
            .setOrigin(1, 0.5)
            .setDepth(362)
        );
      }
    });

    this.buildFooter(cx, panelTop, panelH, panelW);
  }

  // Footer — remapping note (the documented cut) + page dots + Back flanked by ◀ ▶.
  buildFooter(cx, panelTop, panelH, panelW) {
    const bottom = panelTop + panelH;

    this._objs.push(
      this.add
        .text(cx, bottom - FOOTER_H + 12, 'Remapping & conflict detection — coming soon', {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: '#9B9389',
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(362)
    );

    // Page dots (2) — current page lit gold.
    const dotsY = bottom - 60;
    const dotGap = 24;
    const startX = cx - (dotGap * (PAGES.length - 1)) / 2;
    for (let i = 0; i < PAGES.length; i++) {
      this._objs.push(
        this.add.circle(startX + i * dotGap, dotsY, 6, i === this.page ? 0xeac34f : 0x4d4843).setDepth(363)
      );
    }

    // Back button (centre) flanked by the page arrows.
    const backY = bottom - 28;
    this.makeButton(cx, backY, Math.min(220, panelW - 140), 40, 'Back', () => this.close());

    const off = Math.min(170, panelW / 2 - 40);
    const prevOn = this.page > 0;
    const nextOn = this.page < PAGES.length - 1;
    this.makeButton(cx - off, backY, 46, 40, '◀', () => this.switchPage(-1), prevOn);
    this.makeButton(cx + off, backY, 46, 40, '▶', () => this.switchPage(1), nextOn);
  }

  makeButton(cx, cy, w, h, label, onClick, enabled = true) {
    const rect = this.add
      .rectangle(cx, cy, w, h, 0x36322e, enabled ? 1 : 0.45)
      .setStrokeStyle(2, 0x000000)
      .setDepth(362);
    const text = this.add
      .text(cx, cy, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: enabled ? '#F5EFE6' : '#7a746c'
      })
      .setOrigin(0.5)
      .setDepth(363);
    if (enabled) {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => rect.setStrokeStyle(2, UI_ACCENT_GOLD));
      rect.on('pointerout', () => rect.setStrokeStyle(2, 0x000000));
      rect.on('pointerup', onClick);
    }
    this._objs.push(rect, text);
  }

  // --- TODO(remapping) — scaffolded, intentionally NOT shipped this sprint ---
  // The read-only lists above are complete. Remapping + conflict detection were cut to
  // avoid shipping a half-built, bug-prone rebinder overnight. When implemented:
  //   1. Lift DESKTOP_BINDINGS/MOBILE_BINDINGS into a persisted, mutable keymap (bump
  //      the save version — keybindings are persistent state).
  //   2. Make each desktop row a "click to rebind → capture next keydown" control.
  //   3. Conflict detection: reject/await-confirm a key already bound to another action;
  //      surface the clash inline. Do NOT half-ship this — a silent mis-bind is worse
  //      than no remap.
  //   4. Re-seed Player.keys / GameScene input from the keymap on apply + on load.
}
