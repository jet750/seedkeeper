// FarmstandScene.js
//
// The Farmstand — a full-screen overlay launched over a frozen GameScene when the
// player interacts with the Farmstand building. The COINS↔plants market:
//   SELL — turn harvested plants into coins (price scales with grow time). This is the
//          plant-selling migrated OUT of the old Market/Blacksmith (Sprint magic-1).
//   BUY  — buy plants back at a HEAVY markup (FARMSTAND_MARKUP × sell price). The
//          rebalancing valve: liquidate a surplus crop and rebuy a different one to
//          feed a different stat tree — friction, never a free swap.
//
// Built on the shared PaginatedMenu controller (src/ui/PaginatedMenu.js): the
// controller owns the backdrop, frame math, page model and footer; this scene supplies
// the header (title + tabs + live coin balance) and the paginated rows. Only the
// stat-tree plants are buyable (the two sell-only melons don't feed a tree). All
// prices come from GameScene; every coin/bank change flows through GameScene.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import PaginatedMenu from '../ui/PaginatedMenu.js';

const FONT = '"SproutLands", "Courier New", monospace';
const COLOR_PAGE = 0x141210;
const COLOR_PANEL = 0x221e1b;
const COLOR_AFFORD = 0x3a7d44;
const COLOR_DISABLED = 0x444039;
const COLOR_CLOSE = 0x36322e;
const COLOR_ARROW = 0x2d2926;
const COLOR_ARROW_DISABLED = 0x201d1a;
const COLOR_TAB_ON = 0x8ab87e;
const COLOR_TAB_OFF = 0x3d3833;
const TAB_BORDER_ON = 0xb8d5b1;
const TAB_BORDER_OFF = 0x6b655d;

const MARKET_MARGIN = 20;
const HEADER_H = 52;
const TAB_H = 46;
const TAB_GAP = 12;
const TAB_PAD = 14;
const FOOTER_H = 78;
const SELL_ROW_H = 72;
const BUY_ROW_H = 72;
const ROW_GAP = 12;

function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export default class FarmstandScene extends Phaser.Scene {
  constructor() {
    super('FarmstandScene');
  }

  create() {
    this.gameScene = this.scene.get('GameScene');
    this.gameData = this.gameScene.gameData;

    this.tab = 'sell';
    this.page = { sell: 0, buy: 0 };

    this.menu = new PaginatedMenu(this, {
      margin: MARKET_MARGIN,
      headerH: HEADER_H + TAB_H + TAB_PAD,
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
      getPageIndex: () => this.page[this.tab] || 0,
      setPageIndex: (n) => {
        this.page[this.tab] = n;
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
    this._refresh = () => this.menu.render();
    EventBus.on('coins:changed', this._refresh);
    EventBus.on('bank:updated', this._refresh);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      EventBus.off('coins:changed', this._refresh);
      EventBus.off('bank:updated', this._refresh);
      this.menu.destroy();
    });
  }

  onResize() {
    this.menu.render();
  }

  coins() {
    return this.gameScene.coins || 0;
  }

  track(objs) {
    this.menu.track(...(Array.isArray(objs) ? objs : [objs]));
    return objs;
  }

  switchTab(tab) {
    if (this.tab === tab) return;
    this.tab = tab;
    this.menu.render();
  }

  buildPages(frame) {
    const rowH = this.tab === 'sell' ? SELL_ROW_H : BUY_ROW_H;
    const rowsPerPage = Math.max(1, Math.floor((frame.bandH + ROW_GAP) / (rowH + ROW_GAP)));
    const list = this.tab === 'sell' ? this.sellList() : this.buyListPlants();
    const pages = [];
    for (let i = 0; i < list.length; i += rowsPerPage) pages.push(list.slice(i, i + rowsPerPage));
    return pages.length ? pages : [[]];
  }

  // --- Header: title + live coin balance + SELL/BUY tabs ---------------------

  renderHeader(frame) {
    const { left, right, headerTop, innerW, cx } = frame;
    this.track(
      this.add
        .text(left, headerTop, 'FARMSTAND', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#B8D5B1' })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(right, headerTop + 4, `🪙 ${this.coins()}`, {
          fontFamily: FONT,
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(1, 0)
        .setDepth(101)
    );

    const tabW = Math.min(170, innerW / 2 - TAB_GAP);
    const tabCY = headerTop + HEADER_H + TAB_H / 2;
    this.makeTab(cx - tabW / 2 - TAB_GAP / 2, tabCY, tabW, TAB_H, 'SELL', this.tab === 'sell', () => this.switchTab('sell'));
    this.makeTab(cx + tabW / 2 + TAB_GAP / 2, tabCY, tabW, TAB_H, 'BUY', this.tab === 'buy', () => this.switchTab('buy'));
  }

  renderBody(frame, items) {
    const { left, innerW, contentTop } = frame;
    const rowH = this.tab === 'sell' ? SELL_ROW_H : BUY_ROW_H;
    items.forEach((item, i) => {
      const y = contentTop + i * (rowH + ROW_GAP);
      if (this.tab === 'sell') this.buildSellRow(item, left, y, innerW, rowH);
      else this.buildBuyRow(item, left, y, innerW, rowH);
    });
  }

  makeTab(cx, cy, w, h, label, active, onClick) {
    const bg = this.add
      .rectangle(cx, cy, w, h, active ? COLOR_TAB_ON : COLOR_TAB_OFF)
      .setStrokeStyle(active ? 3 : 2, active ? TAB_BORDER_ON : TAB_BORDER_OFF)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(cx, cy, label, {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: active ? '#1a1410' : '#D6D0C8'
      })
      .setOrigin(0.5)
      .setDepth(102);
    if (!active) {
      bg.on('pointerover', () => bg.setStrokeStyle(2, TAB_BORDER_ON));
      bg.on('pointerout', () => bg.setStrokeStyle(2, TAB_BORDER_OFF));
    }
    bg.on('pointerup', onClick);
    this.track([bg, text]);
  }

  // --- SELL: every owned plant → coins ---------------------------------------

  sellList() {
    return Object.keys(this.gameData.plants);
  }

  buildSellRow(pt, x, y, w, h) {
    const plant = this.gameData.plants[pt];
    const have = this.gameScene.plantBank[pt] || 0;
    const unit = this.gameScene.sellPrice(pt);
    const cy = y + h / 2;
    const can = have > 0;

    this.track(this.add.rectangle(x, y, w, h, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(101));
    this.track(this.add.circle(x + 30, cy, 15, hexToNum(plant.color)).setDepth(102));

    const btnW = 96;
    const btnGap = 10;
    const sellAllX = x + w - 14 - btnW / 2;
    const sell1X = sellAllX - btnW - btnGap;
    this.track(
      this.makeButton(sell1X, cy, btnW, 42, 'Sell 1', can ? COLOR_AFFORD : COLOR_DISABLED, can, () => this.doSell(pt, 1), can ? '#141210' : '#7a746c')
    );
    this.track(
      this.makeButton(sellAllX, cy, btnW, 42, `All (${have})`, can ? COLOR_AFFORD : COLOR_DISABLED, can, () => this.doSell(pt, have), can ? '#141210' : '#7a746c')
    );

    const textW = sell1X - btnW / 2 - btnGap - (x + 52);
    this.track(
      this.add
        .text(x + 52, y + 13, plant.name, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#F5EFE6',
          wordWrap: { width: Math.max(80, textW) }
        })
        .setDepth(102)
    );
    this.track(
      this.add
        .text(x + 52, y + h - 26, `owned × ${have}   ·   ${unit}🪙 each (${plant.growthDays}-day)`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#9B9389'
        })
        .setDepth(102)
    );
  }

  doSell(pt, qty) {
    this.gameScene.sellPlant(pt, qty);
    this.menu.render();
  }

  // --- BUY: stat-tree plants back at a heavy markup --------------------------

  buyListPlants() {
    return this.gameScene.buyablePlants();
  }

  buildBuyRow(pt, x, y, w, h) {
    const plant = this.gameData.plants[pt];
    const have = this.gameScene.plantBank[pt] || 0;
    const unit = this.gameScene.buyPlantPrice(pt);
    const cy = y + h / 2;
    const can1 = this.coins() >= unit;
    const can5 = this.coins() >= unit * 5;

    this.track(this.add.rectangle(x, y, w, h, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(101));
    this.track(this.add.circle(x + 30, cy, 15, hexToNum(plant.color)).setDepth(102));

    const btnW = 96;
    const btnGap = 10;
    const buy5X = x + w - 14 - btnW / 2;
    const buy1X = buy5X - btnW - btnGap;
    this.track(
      this.makeButton(buy1X, cy, btnW, 42, `Buy 1`, can1 ? COLOR_AFFORD : COLOR_DISABLED, can1, () => this.doBuy(pt, 1), can1 ? '#141210' : '#7a746c')
    );
    this.track(
      this.makeButton(buy5X, cy, btnW, 42, `Buy 5`, can5 ? COLOR_AFFORD : COLOR_DISABLED, can5, () => this.doBuy(pt, 5), can5 ? '#141210' : '#7a746c')
    );

    const textW = buy1X - btnW / 2 - btnGap - (x + 52);
    this.track(
      this.add
        .text(x + 52, y + 13, plant.name, {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#F5EFE6',
          wordWrap: { width: Math.max(80, textW) }
        })
        .setDepth(102)
    );
    this.track(
      this.add
        .text(x + 52, y + h - 26, `owned × ${have}   ·   ${unit}🪙 each`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#9B9389'
        })
        .setDepth(102)
    );
  }

  doBuy(pt, qty) {
    this.gameScene.buyPlant(pt, qty);
    this.menu.render();
  }

  // --- Shared UI -------------------------------------------------------------

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
    EventBus.emit('shop:closed', { shop: 'farmstand' });
    this.scene.stop();
  }
}
