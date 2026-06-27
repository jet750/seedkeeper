// DevMenuScene.js
//
// In-game developer cheat menu (toggle with the ~ key, or 10 rapid taps on the
// mobile MAP button via the dev:toggleMenu event). Launched as a parallel scene
// alongside GameScene/UIScene; it is completely inert unless the dev menu is active
// (DEV_MODE === true in Constants.js, or the page URL contains ?dev=true). When
// inactive it renders nothing, captures no input, and emits no events — flipping
// DEV_MODE to false disables it entirely.
//
// Sprint devmenu-controls-tutorials — readability rewrite (unified desktop + mobile):
// the menu used to be authored in the fixed 1600x900 space (a 388px panel pinned to
// the right edge, letterboxed via fitCameraToVirtual), so on a phone every button
// scaled down to unreadable. It now follows the Marketplace pattern: a full-bleed,
// game-PAUSED, live-viewport menu that splits the cheats across logical PAGES with
// ◀ ▶ / dots / swipe, sized for a phone thumb and lifted clear of the safe insets.
// The same paginated layout is used on desktop. Entry points are unchanged.
//
// Architecture: this scene is presentation-only. Every cheat is dispatched as a
// `dev:*` EventBus event that GameScene (the owner of game state) executes; the menu
// never calls Player/GameScene methods directly. Opening/closing emits dev:menuOpened/
// dev:menuClosed so GameScene freezes + pauses physics while the menu is up.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import { isDevModeActive } from '../core/Constants.js';

const FONT = '"SproutLands", "Courier New", monospace';

// --- Live-viewport layout metrics (screen px; identical on desktop + mobile) ---
const MARGIN = 20; // gap from the screen edges (added to safe insets)
const HEADER_H = 58; // title + page-counter zone
const FOOTER_H = 80; // close button + paging dots zone (above the bottom inset)
const GAP = 10;
const BTN_H = 48; // comfortable phone-tap button height
const SECTION_H = 30;
const NOTE_H = 20;

const PANEL_BG = 0x141210; // full-bleed page fill (near-opaque so no game peeks)
const COLOR_BTN = 0x2d2926;
const COLOR_TOGGLE_ON = 0x3a5d2a;
const COLOR_DANGER = 0x6a2a2a;
const COLOR_ARROW = 0x2d2926;
const COLOR_ARROW_DISABLED = 0x201d1a;
const COLOR_CLOSE = 0x36322e;

export default class DevMenuScene extends Phaser.Scene {
  constructor() {
    super('DevMenuScene');
  }

  create() {
    this.isActive = isDevModeActive();
    if (!this.isActive) return; // dormant — renders nothing, no input, no events

    this.gameScene = this.scene.get('GameScene');
    if (!this.gameScene) return;
    this.gameData = this.gameScene.gameData;

    this.menuOpen = false;
    this.page = 0;
    this._pageCount = 1;
    this._objs = [];
    this._speedOn = false; // dev 2x-speed toggle state (Sprint 7)
    this._noclipOn = false; // dev no-clip toggle state (Sprint 7)

    // Toggle key (~). Polled in update() so it works regardless of focus order.
    this.toggleKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);

    // Reflow on rotation / toolbar collapse (live viewport changed).
    this.scale.on('resize', this.onResize, this);

    // Keyboard paging (desktop) — guarded by menuOpen so arrows never affect gameplay.
    this.input.keyboard.on('keydown-LEFT', () => {
      if (this.menuOpen) this.changePage(-1);
    });
    this.input.keyboard.on('keydown-RIGHT', () => {
      if (this.menuOpen) this.changePage(1);
    });

    // Mobile gestures (no tilde key): swipe down to dismiss, horizontal swipe pages.
    // Guarded by menuOpen so taps to the game HUD are never intercepted when closed.
    let startX = 0;
    let startY = 0;
    this.input.on('pointerdown', (p) => {
      if (!this.menuOpen) return;
      startX = p.x;
      startY = p.y;
    });
    this.input.on('pointerup', (p) => {
      if (!this.menuOpen) return;
      const dx = p.x - startX;
      const dy = p.y - startY;
      if (dy > 120 && Math.abs(dx) < 90) this.setMenuVisible(false);
      else if (Math.abs(dx) > 120 && Math.abs(dy) < 90) this.changePage(dx < 0 ? 1 : -1);
    });

    // Mobile has no tilde key, so the touch HUD opens the menu via this event
    // (10 rapid taps on MAP — see GameScene.onMapRequested). Only wired while the menu
    // is active, so a shipped (DEV_MODE=false) build ignores the taps entirely.
    this._onMobileToggle = () => this.setMenuVisible(!this.menuOpen);
    EventBus.on('dev:toggleMenu', this._onMobileToggle);

    this.events.once('shutdown', this.teardown, this);
    this.events.once('destroy', this.teardown, this);
  }

  update() {
    if (!this.isActive) return;
    if (Phaser.Input.Keyboard.JustDown(this.toggleKey)) {
      this.setMenuVisible(!this.menuOpen);
    }
  }

  onResize() {
    if (this.menuOpen) this.render();
  }

  // --- Open / close ----------------------------------------------------------

  setMenuVisible(open) {
    if (open === this.menuOpen) return;
    this.menuOpen = open;
    if (open) {
      this.scene.bringToTop(); // sit above the HUD and anything else on screen
      EventBus.emit('dev:menuOpened', {});
      this.render();
    } else {
      EventBus.emit('dev:menuClosed', {});
      this._objs.forEach((o) => o.destroy());
      this._objs = [];
    }
  }

  changePage(delta) {
    const count = this._pageCount || 1;
    const next = Phaser.Math.Clamp(this.page + delta, 0, count - 1);
    if (next === this.page) return;
    this.page = next;
    this.render();
  }

  // Emit a cheat intent, then re-render so live readouts (coins/day) and toggle
  // states refresh — the same "mutate then re-render" path the Marketplace uses.
  dispatch(event, data = {}) {
    EventBus.emit(event, data);
    if (this.menuOpen) this.render();
  }

  // --- Page content (data-driven; rebuilt each render so readouts stay live) --

  getPages() {
    const coins = this.gameScene.coins || 0;
    const day = this.gameScene.daySystem ? this.gameScene.daySystem.dayNumber : 1;

    // +10-to-bank button per current plant (the reconciled set, derived from data so
    // retired plants drop off and new ones appear with no edits here).
    const plantButtons = Object.keys(this.gameData.plants).map((pt) => ({
      label: `+10 ${this.gameData.plants[pt].name}`,
      textColor: this.gameData.plants[pt].color,
      onClick: () => this.dispatch('dev:addBank', { plantType: pt, amount: 10 })
    }));

    return [
      {
        title: 'ECONOMY',
        rows: [
          { type: 'section', label: 'BANK' },
          { type: 'full', label: 'Fill All Banks (20)', onClick: () => this.dispatch('dev:fillBank') },
          { type: 'section', label: `COINS — ${coins}` },
          {
            type: 'row',
            buttons: [
              { label: '+100 Coins', onClick: () => this.dispatch('dev:addCoins', { amount: 100 }) },
              { label: '+500 Coins', onClick: () => this.dispatch('dev:addCoins', { amount: 500 }) }
            ]
          },
          { type: 'section', label: 'GEAR & STATS' },
          { type: 'full', label: 'Grant All Gear (coin path)', onClick: () => this.dispatch('dev:grantGear') },
          { type: 'full', label: 'Max All Stats (10 trees)', onClick: () => this.dispatch('dev:maxStats') },
          { type: 'full', label: 'Max All Capacity', onClick: () => this.dispatch('dev:maxCapacity') }
        ]
      },
      {
        title: 'BANK GRANTS',
        rows: [
          { type: 'section', label: '+10 TO BANK · every plant' },
          { type: 'grid', cols: 2, buttons: plantButtons }
        ]
      },
      {
        title: 'PLAYER',
        rows: [
          { type: 'section', label: 'VITALS' },
          {
            type: 'row',
            buttons: [
              { label: 'Full Heal', onClick: () => this.dispatch('dev:fullHeal') },
              { label: 'Restore Ammo', onClick: () => this.dispatch('dev:restoreAmmo') }
            ]
          },
          { type: 'full', label: 'Unlock Mana (test bar)', onClick: () => this.dispatch('dev:unlockMana') },
          { type: 'section', label: 'MOVEMENT CHEATS' },
          {
            type: 'row',
            buttons: [
              {
                label: `2X SPEED [${this._speedOn ? 'ON' : 'OFF'}]`,
                fill: this._speedOn ? COLOR_TOGGLE_ON : COLOR_BTN,
                onClick: () => {
                  this._speedOn = !this._speedOn;
                  this.dispatch('dev:toggleSpeed', { on: this._speedOn });
                }
              },
              {
                label: `NO-CLIP [${this._noclipOn ? 'ON' : 'OFF'}]`,
                fill: this._noclipOn ? COLOR_TOGGLE_ON : COLOR_BTN,
                onClick: () => {
                  this._noclipOn = !this._noclipOn;
                  this.dispatch('dev:toggleNoclip', { on: this._noclipOn });
                }
              }
            ]
          }
        ]
      },
      {
        title: 'WORLD & SPAWN',
        rows: [
          { type: 'section', label: `DAY — ${day}` },
          {
            type: 'row',
            buttons: [
              { label: '-1 Day', onClick: () => this.dispatch('dev:day', { delta: -1 }) },
              { label: '+1 Day', onClick: () => this.dispatch('dev:day', { delta: 1 }) },
              { label: '+5 Days', onClick: () => this.dispatch('dev:day', { delta: 5 }) }
            ]
          },
          { type: 'note', label: '⚠ backward skip resets timer only' },
          { type: 'section', label: 'SPAWN · at player' },
          {
            type: 'row',
            buttons: [
              { label: 'Green Slime', onClick: () => this.dispatch('dev:spawnEnemy', { type: 'green_slime' }) },
              { label: 'Dark Slime', onClick: () => this.dispatch('dev:spawnEnemy', { type: 'dark_slime' }) }
            ]
          },
          {
            type: 'row',
            buttons: [
              { label: 'Skeleton', onClick: () => this.dispatch('dev:spawnEnemy', { type: 'skeleton' }) },
              { label: 'Clear Enemies', fill: COLOR_DANGER, onClick: () => this.dispatch('dev:clearEnemies') }
            ]
          }
        ]
      },
      {
        title: 'STATE',
        rows: [
          { type: 'section', label: 'SAVE' },
          {
            type: 'row',
            buttons: [
              { label: 'Clear Save Slot', fill: COLOR_DANGER, onClick: () => this.dispatch('dev:clearSave') },
              { label: 'Force Save', onClick: () => this.dispatch('dev:forceSave') }
            ]
          }
        ]
      }
    ];
  }

  // --- Full re-render (open + every resize / cheat) --------------------------
  // Rebuilds the whole menu from the live viewport — a modal rebuild keeps a single
  // layout path for desktop, mobile, rotation, and the live readouts.
  render() {
    this._objs.forEach((o) => o.destroy());
    this._objs = [];
    if (!this.menuOpen) return;

    const W = this.scale.width;
    const H = this.scale.height;
    const safe = MobileDetect.isMobile()
      ? MobileDetect.getRawInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };

    const left = safe.left + MARGIN;
    const right = W - safe.right - MARGIN;
    const innerW = Math.max(120, right - left);
    const cx = (left + right) / 2;

    // Full-bleed page fill (swallows taps to the world behind).
    this.track(
      this.add.rectangle(0, 0, W, H, PANEL_BG, 0.97).setOrigin(0, 0).setDepth(200).setInteractive()
    );

    const pages = this.getPages();
    this._pageCount = pages.length;
    const page = Phaser.Math.Clamp(this.page, 0, pages.length - 1);
    this.page = page;
    const pg = pages[page];

    // Header: DEV MODE flag (left) + page title (right) + page counter / hint (below).
    const topY = safe.top + MARGIN;
    this.track(
      this.add
        .text(left, topY, '⚠ DEV MODE', { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#ff4d4d' })
        .setOrigin(0, 0)
        .setDepth(202)
    );
    this.track(
      this.add
        .text(right, topY, pg.title, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#EDD49A' })
        .setOrigin(1, 0)
        .setDepth(202)
    );
    const counter = `Page ${page + 1}/${pages.length}` + (MobileDetect.isMobile() ? '   ·   swipe / arrows' : '   ·   ~ toggle  ·  ◀ ▶');
    this.track(
      this.add
        .text(left, topY + 26, counter, { fontFamily: FONT, fontSize: '12px', color: '#9B9389' })
        .setOrigin(0, 0)
        .setDepth(202)
    );

    // Footer anchors (close + dots), lifted clear of the bottom safe-area inset.
    const closeCY = H - safe.bottom - MARGIN - 16;
    const dotsY = closeCY - 34;

    // Content band between the header and the footer; rows scale to fit a short screen.
    const contentTop = topY + HEADER_H;
    const contentBottom = H - safe.bottom - MARGIN - FOOTER_H;
    const bandH = Math.max(60, contentBottom - contentTop);

    const rowH = (r) =>
      r.type === 'section'
        ? SECTION_H
        : r.type === 'note'
        ? NOTE_H
        : r.type === 'grid'
        ? Math.ceil(r.buttons.length / r.cols) * (BTN_H + GAP)
        : BTN_H + GAP;
    const rows = pg.rows;
    let total = 0;
    rows.forEach((r) => {
      total += r.type === 'section' ? SECTION_H + GAP : r.type === 'note' ? NOTE_H + GAP : rowH(r);
    });
    const f = total > bandH ? Math.max(0.5, bandH / total) : 1;
    const sH = SECTION_H * f;
    const nH = NOTE_H * f;
    const bH = BTN_H * f;
    const g = GAP * f;

    let y = contentTop;
    rows.forEach((r) => {
      if (r.type === 'section') {
        this.track(
          this.add
            .text(left, y + sH / 2, r.label, {
              fontFamily: FONT,
              fontSize: `${Math.max(12, Math.round(sH * 0.6))}px`,
              fontStyle: 'bold',
              color: '#EDD49A'
            })
            .setOrigin(0, 0.5)
            .setDepth(202)
        );
        y += sH + g;
      } else if (r.type === 'note') {
        this.track(
          this.add
            .text(left, y + nH / 2, r.label, {
              fontFamily: FONT,
              fontSize: `${Math.max(10, Math.round(nH * 0.7))}px`,
              color: '#C0392B'
            })
            .setOrigin(0, 0.5)
            .setDepth(202)
        );
        y += nH + g;
      } else if (r.type === 'full') {
        this.makeButton(cx, y + bH / 2, innerW, bH, r.label, r.fill || COLOR_BTN, r.onClick, r.textColor);
        y += bH + g;
      } else if (r.type === 'row') {
        const n = r.buttons.length;
        const bw = (innerW - g * (n - 1)) / n;
        r.buttons.forEach((b, i) => {
          this.makeButton(left + i * (bw + g) + bw / 2, y + bH / 2, bw, bH, b.label, b.fill || COLOR_BTN, b.onClick, b.textColor);
        });
        y += bH + g;
      } else if (r.type === 'grid') {
        const cols = r.cols;
        const bw = (innerW - g * (cols - 1)) / cols;
        r.buttons.forEach((b, i) => {
          const col = i % cols;
          const gr = Math.floor(i / cols);
          this.makeButton(left + col * (bw + g) + bw / 2, y + gr * (bH + g) + bH / 2, bw, bH, b.label, b.fill || COLOR_BTN, b.onClick, b.textColor);
        });
        y += Math.ceil(r.buttons.length / cols) * (bH + g);
      }
    });

    this.buildFooter(cx, closeCY, dotsY, innerW, pages.length, page);
  }

  // --- Footer (close + pagination) ------------------------------------------

  buildFooter(cx, closeCY, dotsY, innerW, pageCount, page) {
    this.makeButton(cx, closeCY, 200, 44, MobileDetect.isMobile() ? 'Close' : 'Close   ·   ~', COLOR_CLOSE, () =>
      this.setMenuVisible(false)
    );

    if (pageCount > 1) {
      const off = Math.min(190, innerW / 2 - 36);
      const prevOn = page > 0;
      const nextOn = page < pageCount - 1;
      this.makeButton(cx - off, closeCY, 50, 44, '◀', prevOn ? COLOR_ARROW : COLOR_ARROW_DISABLED, () => this.changePage(-1));
      this.makeButton(cx + off, closeCY, 50, 44, '▶', nextOn ? COLOR_ARROW : COLOR_ARROW_DISABLED, () => this.changePage(1));

      const dotGap = 22;
      const startX = cx - (dotGap * (pageCount - 1)) / 2;
      for (let i = 0; i < pageCount; i++) {
        this.track(this.add.circle(startX + i * dotGap, dotsY, 6, i === page ? 0xeac34f : 0x4d4843).setDepth(202));
      }
    }
  }

  // --- Shared UI -------------------------------------------------------------

  makeButton(cx, cy, w, h, label, fill, onClick, textColor) {
    const rect = this.add
      .rectangle(cx, cy, w, h, fill)
      .setStrokeStyle(2, 0x57514b)
      .setDepth(201)
      .setInteractive({ useHandCursor: true });
    const fs = Math.max(11, Math.min(18, Math.round(h * 0.34)));
    const text = this.add
      .text(cx, cy, label, { fontFamily: FONT, fontSize: `${fs}px`, color: textColor || '#F5EFE6', align: 'center' })
      .setOrigin(0.5)
      .setDepth(202);

    rect.on('pointerover', () => rect.setStrokeStyle(2, 0xd4a83f));
    rect.on('pointerout', () => rect.setStrokeStyle(2, 0x57514b));
    rect.on('pointerup', () => {
      if (this.menuOpen) onClick();
    });

    this.track(rect, text);
    return { rect, text };
  }

  track(...objs) {
    objs.forEach((o) => this._objs.push(o));
  }

  teardown() {
    this.scale.off('resize', this.onResize, this);
    EventBus.off('dev:toggleMenu', this._onMobileToggle);
  }
}
