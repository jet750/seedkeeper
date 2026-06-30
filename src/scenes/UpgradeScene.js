// UpgradeScene.js
//
// The Seedkeeper Workshop — a full-screen overlay launched over a frozen GameScene
// (which keeps rendering behind it). Shows plant STAT trees only (gear + capacity live
// in the coin economy / shops). Spends plant resources and asks GameScene to apply the
// effect + auto-save via purchaseUpgrade(); reads live state from GameScene (plantBank,
// upgradeLevels, gameData) and never mutates directly.
//
// Sprint menu-unification: ported off its old fixed 1600x900 two-column grid onto the
// shared PaginatedMenu controller (src/ui/PaginatedMenu.js) — the SAME component the
// three shops + the seed chest use — so it now reflows to the live viewport, paginates
// from the available height, and reads identically on desktop + phone. Content and
// economy are unchanged: same catalog (one stat tree per plant), same costs, same
// BUY → confirm (✓ Spend / ✗) purchase flow. Each tree is one row; rows paginate.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import PaginatedMenu from '../ui/PaginatedMenu.js';
import entitiesData from '../data/entities.json';

const FONT = '"SproutLands", "Courier New", monospace';

// One stat tree per plant, in catalog order. Pagination is now viewport-driven (the
// controller slices this list per page from the available height), not a fixed split.
const PLANT_ORDER = Object.keys(entitiesData.upgrades);

const COLOR_PAGE = 0x141210;
const COLOR_PANEL = 0x221e1b;
const COLOR_AFFORD = 0x3a7d44; // affordable BUY (green)
const COLOR_DISABLED = 0x444039; // un-affordable / inert
const COLOR_CONFIRM_YES = 0x3a7d44;
const COLOR_CONFIRM_NO = 0x8a3a3a;
const COLOR_CLOSE = 0x36322e;
const COLOR_ARROW = 0x2d2926;
const COLOR_ARROW_DISABLED = 0x201d1a;

const MENU_MARGIN = 20;
const HEADER_H = 56; // title + subtitle (no tabs — single list)
const FOOTER_H = 78;
const ROW_H = 80;
const ROW_GAP = 12;
const RIGHT_RESERVE = 214; // space kept clear on the right for the action cluster

function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export default class UpgradeScene extends Phaser.Scene {
  constructor() {
    super('UpgradeScene');
  }

  create() {
    this.gameScene = this.scene.get('GameScene');
    this.gameData = this.gameScene.gameData;

    this.page = 0;
    this._pending = null; // { plantType } awaiting a ✓/✗ confirm

    this.menu = new PaginatedMenu(this, {
      margin: MENU_MARGIN,
      headerH: HEADER_H,
      footerH: FOOTER_H,
      depth: 100,
      backdropColor: COLOR_PAGE,
      backdropAlpha: 0.97,
      closeW: 220,
      closeColor: COLOR_CLOSE,
      closeLabelMobile: 'Close',
      closeLabelDesktop: 'Close   ·   Esc',
      arrowW: 52,
      arrowColor: COLOR_ARROW,
      arrowDisabledColor: COLOR_ARROW_DISABLED,
      arrowOffsetMax: 200,
      arrowOffsetPad: 40,
      dotGap: 24,
      closeOnEsc: true,
      dismissOnSwipeDown: true,
      swipeEnabled: () => MobileDetect.isMobile(),
      onClose: () => this.close(),
      getPageIndex: () => this.page,
      // Clear any half-made purchase only on a REAL page change. render() also calls
      // setPage(currentPage) to clamp, so guarding on a value change keeps a freshly-set
      // _pending alive long enough to draw its confirm buttons.
      setPageIndex: (n) => {
        if (n !== this.page) {
          this.page = n;
          this._pending = null;
        }
      },
      getPages: (frame) => this.buildPages(frame),
      renderHeader: (frame) => this.renderHeader(frame),
      renderBody: (frame, items) => this.renderBody(frame, items),
      button: (cx, cy, w, h, label, fill, onClick, enabled, textColor) =>
        this.track(this.makeButton(cx, cy, w, h, label, fill, enabled, onClick, textColor))
    });
    this.menu.attachInput();
    this.menu.render();

    this.scale.on('resize', this.onResize, this);
    // Each purchase emits 'bank:updated'; the world is frozen while this is open, so that
    // is the only state that moves — one subscription rebuilds the menu live.
    this._refresh = () => this.menu.render();
    EventBus.on('bank:updated', this._refresh);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      EventBus.off('bank:updated', this._refresh);
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

  // --- Pages -----------------------------------------------------------------

  buildPages(frame) {
    const rowsPerPage = Math.max(1, Math.floor((frame.bandH + ROW_GAP) / (ROW_H + ROW_GAP)));
    const pages = [];
    for (let i = 0; i < PLANT_ORDER.length; i += rowsPerPage) {
      pages.push(PLANT_ORDER.slice(i, i + rowsPerPage));
    }
    return pages.length ? pages : [[]];
  }

  // --- Header: title + subtitle ----------------------------------------------

  renderHeader(frame) {
    const { left, headerTop } = frame;
    this.track(
      this.add
        .text(left, headerTop, 'SEEDKEEPER WORKSHOP', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#EDD49A' })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(left, headerTop + 34, 'Spend harvested plants to raise stats', {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#9B9389'
        })
        .setOrigin(0, 0)
        .setDepth(101)
    );
  }

  renderBody(frame, items) {
    const { left, innerW, contentTop } = frame;
    if (!items.length) {
      this.track(
        this.add
          .text(left + innerW / 2, contentTop + 30, 'No upgrades available.', { fontFamily: FONT, fontSize: '18px', color: '#9B9389' })
          .setOrigin(0.5, 0)
          .setDepth(102)
      );
      return;
    }
    items.forEach((pt, i) => {
      const y = contentTop + i * (ROW_H + ROW_GAP);
      this.buildRow(pt, left, y, innerW, ROW_H);
    });
  }

  // --- Row: one plant stat tree ----------------------------------------------

  buildRow(pt, x, y, w, h) {
    const plant = this.gameData.plants[pt];
    const cy = y + h / 2;

    this.track(this.add.rectangle(x, y, w, h, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(101));
    this.track(this.add.circle(x + 30, cy, 15, hexToNum(plant.color)).setDepth(102));

    const textLeft = x + 52;
    const textW = Math.max(90, x + w - RIGHT_RESERVE - textLeft);
    this.track(
      this.add
        .text(textLeft, y + 13, plant.name, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#F5EFE6',
          wordWrap: { width: textW }
        })
        .setDepth(102)
    );
    this.track(
      this.add
        .text(textLeft, y + h - 26, this.statLine(pt), {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#9B9389',
          wordWrap: { width: textW }
        })
        .setDepth(102)
    );

    this.buildRowAction(pt, x, cy, w);
  }

  // Right-aligned action cluster: pending confirm (✓ Spend / ✗), MAXED label, or BUY.
  buildRowAction(pt, x, cy, w) {
    const rightEdge = x + w - 14;

    if (this._pending && this._pending.plantType === pt) {
      const cost = this.nextCost(pt);
      const noW = 42;
      const yesW = 152;
      const gap = 10;
      const noX = rightEdge - noW / 2;
      const yesX = noX - noW / 2 - gap - yesW / 2;
      this.track(this.makeButton(yesX, cy, yesW, 42, `✓ Spend ${cost}`, COLOR_CONFIRM_YES, true, () => this.onConfirm(pt), '#FFFFFF'));
      this.track(this.makeButton(noX, cy, noW, 42, '✗', COLOR_CONFIRM_NO, true, () => this.onCancel(pt), '#FFFFFF'));
      return;
    }

    if (this.isMaxed(pt)) {
      this.track(
        this.add
          .text(rightEdge, cy, 'MAXED', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#8AB87E' })
          .setOrigin(1, 0.5)
          .setDepth(102)
      );
      return;
    }

    const cost = this.nextCost(pt);
    const affordable = this.bank(pt) >= cost;
    const btnW = 150;
    this.track(
      this.makeButton(
        rightEdge - btnW / 2,
        cy,
        btnW,
        42,
        `BUY  ${cost}`,
        affordable ? COLOR_AFFORD : COLOR_DISABLED,
        affordable,
        () => this.onBuyClicked(pt),
        affordable ? '#141210' : '#7a746c'
      )
    );
  }

  // --- Purchase flow (unchanged economy) -------------------------------------

  onBuyClicked(pt) {
    this._pending = { plantType: pt };
    this.menu.render();
  }

  onConfirm(pt) {
    this._pending = null;
    this.gameScene.purchaseUpgrade(pt, 'stat'); // emits 'bank:updated' → _refresh re-renders
    this.menu.render(); // instant, even if the event order ever shifts
  }

  onCancel() {
    this._pending = null;
    this.menu.render();
  }

  // --- Catalog reads ---------------------------------------------------------

  bank(pt) {
    return this.gameScene.plantBank[pt] || 0;
  }

  levels(pt) {
    return this.gameScene.upgradeLevels[pt];
  }

  isMaxed(pt) {
    return this.levels(pt).stat >= this.gameData.upgrades[pt].stat.levels;
  }

  nextCost(pt) {
    return this.gameData.upgrades[pt].stat.costs[this.levels(pt).stat];
  }

  statEffectText(pt) {
    const s = this.gameData.upgrades[pt].stat;
    const b = s.perLevelBonus;
    if (s.statKey === 'healthRegen') return `+${b} HP/sec`;
    return `+${Math.round(b * 100)}% ${s.name}`;
  }

  // Compact one-line tree summary: current level, next effect (or maxed), stock on hand.
  statLine(pt) {
    const s = this.gameData.upgrades[pt].stat;
    const lv = this.levels(pt).stat;
    const have = this.bank(pt);
    if (lv >= s.levels) return `${s.name} maxed · Lv ${lv}/${s.levels}   ·   ${have} on hand`;
    return `Lv ${lv}/${s.levels}   ·   Next: ${this.statEffectText(pt)}   ·   ${have} on hand`;
  }

  // --- Shared button (Sprout Lands square-button art, tinted; rect fallback) --

  makeButton(cx, cy, w, h, label, baseColor, enabled, onClick, textColor) {
    const isSprite = this.textures.exists('ui_btn_square');
    let bg;
    if (isSprite) {
      bg = this.add.nineslice(cx, cy, 'ui_btn_square', 2, w, h, 10, 10, 10, 10).setTint(baseColor).setDepth(101);
    } else {
      bg = this.add.rectangle(cx, cy, w, h, baseColor).setStrokeStyle(2, 0x000000).setDepth(101);
    }
    bg._baseColor = baseColor;
    const text = this.add
      .text(cx, cy, label, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: textColor || '#141210', align: 'center' })
      .setOrigin(0.5)
      .setDepth(102);

    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      if (isSprite) {
        bg.on('pointerover', () => bg.setTint(0xffffff));
        bg.on('pointerout', () => bg.setTint(bg._baseColor));
      } else {
        bg.on('pointerover', () => bg.setStrokeStyle(2, 0xeac34f));
        bg.on('pointerout', () => bg.setStrokeStyle(2, 0x000000));
      }
      bg.on('pointerup', onClick);
    } else {
      bg.setAlpha(0.6);
    }
    return [bg, text];
  }

  close() {
    EventBus.emit('upgrade:closed', {});
    this.scene.stop();
  }
}
