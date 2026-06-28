// BlacksmithScene.js
//
// The Blacksmith — a full-screen overlay launched over a frozen GameScene when the
// player interacts with the Blacksmith building. COINS → gear (by slot) + capacity
// (seed bag / beds / watering) ONLY. Sprint magic-1 split the old single Market into
// four shops; this scene is the refactor of MarketplaceScene's BUY half — plant
// selling moved out to the Farmstand, so the Blacksmith no longer sells anything, it
// only equips and expands you.
//
// Built on the shared PaginatedMenu controller (src/ui/PaginatedMenu.js): the
// controller owns the full-bleed backdrop, frame math, page model (◀ ▶ / dots /
// swipe) and footer; this scene supplies the header (title + live coin balance) and
// the paginated row list. A NARROW_W breakpoint collapses each row's tier-chip strip
// into a compact "current → next" row on a phone. All prices come from economy.json
// via GameScene; every coin change flows through GameScene so the HUD stays in sync.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import PaginatedMenu from '../ui/PaginatedMenu.js';

const GEAR_SLOTS = [
  ['weapon', 'Weapon'],
  ['armor', 'Armor'],
  ['boots', 'Boots'],
  ['ranged', 'Ranged']
];
const CAPACITY_TREES = [
  ['seedBag', 'Seed Bag', 'slots', 'slots'],
  ['gardenBeds', 'Garden Beds', 'beds', 'beds'],
  ['watering', 'Watering', 'capacity', 'charges']
];
const CAPACITY_FIELD = { seedBag: 'seedBagTier', gardenBeds: 'gardenBedTier', watering: 'wateringTier' };

const FONT = '"SproutLands", "Courier New", monospace';
const COLOR_PAGE = 0x141210;
const COLOR_PANEL = 0x221e1b;
const COLOR_AFFORD = 0x3a7d44;
const COLOR_DISABLED = 0x444039;
const COLOR_OWNED = 0x2f4a33;
const COLOR_LOCKED = 0x2b2723;
const COLOR_CLOSE = 0x36322e;
const COLOR_ARROW = 0x2d2926;
const COLOR_ARROW_DISABLED = 0x201d1a;

const MARKET_MARGIN = 20;
const HEADER_H = 52;
const FOOTER_H = 78;
const BUY_ROW_H = 76;
const ROW_GAP = 12;
const NARROW_W = 780;

const CHIP_W = 150;
const CHIP_H = 52;
const CHIP_GAP = 10;

export default class BlacksmithScene extends Phaser.Scene {
  constructor() {
    super('BlacksmithScene');
  }

  create() {
    this.gameScene = this.scene.get('GameScene');
    this.gameData = this.gameScene.gameData;
    this.economy = this.gameScene.economyData;

    this.menu = new PaginatedMenu(this, {
      margin: MARKET_MARGIN,
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
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      EventBus.off('coins:changed', this._refresh);
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

  // --- Page model: slice the flat buy list into rows-that-fit pages -----------

  buildPages(frame) {
    const rowsPerPage = Math.max(1, Math.floor((frame.bandH + ROW_GAP) / (BUY_ROW_H + ROW_GAP)));
    const list = this.buyList();
    const pages = [];
    for (let i = 0; i < list.length; i += rowsPerPage) pages.push(list.slice(i, i + rowsPerPage));
    return pages.length ? pages : [[]];
  }

  // --- Header: title + live coin balance -------------------------------------

  renderHeader(frame) {
    const { left, right, headerTop } = frame;
    this.track(
      this.add
        .text(left, headerTop, 'BLACKSMITH', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#E5B69A' })
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
  }

  renderBody(frame, items) {
    const { left, innerW, contentTop } = frame;
    const narrow = frame.W < NARROW_W;
    items.forEach((item, i) => {
      const y = contentTop + i * (BUY_ROW_H + ROW_GAP);
      if (narrow) this.buildBuyRowCompact(item, left, y, innerW, BUY_ROW_H);
      else this.buildBuyRowWide(item, left, y, innerW, BUY_ROW_H);
    });
  }

  // --- BUY list: gear tiers then capacity trees (one flat list) ---------------

  buyList() {
    const entries = [];
    GEAR_SLOTS.forEach(([slot, label]) => {
      const list = this.economy.gear[slot] || [];
      const items = list.map((g) => ({ label: g.name, price: g.price, id: g.id }));
      entries.push({ label, items, owned: this.gameScene.gearTierIndex(slot), onBuy: (i) => this.doBuyGear(slot, items[i].id) });
    });
    CAPACITY_TREES.forEach(([tree, label, key, unit]) => {
      const def = this.economy.capacity[tree];
      const tierCount = this.gameScene[CAPACITY_FIELD[tree]] || 0;
      const items = [{ label: `${def.base} ${unit}`, price: null, base: true }].concat(
        def.tiers.map((t) => ({ label: `${t[key]} ${unit}`, price: t.price }))
      );
      entries.push({ label, items, owned: tierCount, onBuy: () => this.doBuyCapacity(tree) });
    });
    return entries;
  }

  buildBuyRowWide(entry, x, y, w, h) {
    const cy = y + h / 2;
    this.track(this.add.rectangle(x, y, w, h, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(101));
    this.track(
      this.add
        .text(x + 18, cy, entry.label, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#F5EFE6' })
        .setOrigin(0, 0.5)
        .setDepth(102)
    );

    const chipStartX = x + 180;
    const next = entry.owned + 1;
    entry.items.forEach((item, i) => {
      const ccx = chipStartX + i * (CHIP_W + CHIP_GAP) + CHIP_W / 2;
      if (i <= entry.owned) {
        this.chip(ccx, cy, COLOR_OWNED, `✓ ${item.label}`, '#B8D5B1');
      } else if (i === next) {
        const affordable = this.coins() >= item.price;
        const sub = affordable ? `BUY  ${item.price}🪙` : `Need ${item.price}🪙`;
        this.track(
          this.makeButton(
            ccx,
            cy,
            CHIP_W,
            CHIP_H,
            `${item.label}\n${sub}`,
            affordable ? COLOR_AFFORD : COLOR_DISABLED,
            affordable,
            () => entry.onBuy(i),
            affordable ? '#141210' : '#C9C2B8'
          )
        );
      } else {
        this.chip(ccx, cy, COLOR_LOCKED, `${item.label}\n${item.price}🪙`, '#9B9389');
      }
    });
  }

  buildBuyRowCompact(entry, x, y, w, h) {
    const cy = y + h / 2;
    this.track(this.add.rectangle(x, y, w, h, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(101));

    const owned = entry.items[entry.owned];
    const next = entry.items[entry.owned + 1];
    const curLabel = owned ? owned.label : 'None';

    this.track(
      this.add
        .text(x + 16, y + 12, entry.label, { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#F5EFE6' })
        .setDepth(102)
    );
    this.track(
      this.add
        .text(x + 16, y + h - 26, next ? `${curLabel}  →  ${next.label}` : `${curLabel}  (max)`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#9B9389'
        })
        .setDepth(102)
    );

    if (next) {
      const affordable = this.coins() >= next.price;
      const btnW = 132;
      this.track(
        this.makeButton(
          x + w - 14 - btnW / 2,
          cy,
          btnW,
          46,
          affordable ? `Buy  ${next.price}🪙` : `${next.price}🪙`,
          affordable ? COLOR_AFFORD : COLOR_DISABLED,
          affordable,
          () => entry.onBuy(entry.owned + 1),
          affordable ? '#141210' : '#C9C2B8'
        )
      );
    } else {
      this.track(
        this.add
          .text(x + w - 14, cy, 'MAX', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#B8D5B1' })
          .setOrigin(1, 0.5)
          .setDepth(102)
      );
    }
  }

  doBuyGear(slot, tierId) {
    this.gameScene.purchaseGear(slot, tierId);
    this.menu.render();
  }

  doBuyCapacity(tree) {
    this.gameScene.purchaseCapacity(tree);
    this.menu.render();
  }

  // --- Shared UI -------------------------------------------------------------

  chip(cx, cy, color, text, textColor) {
    this.track(this.add.rectangle(cx, cy, CHIP_W, CHIP_H, color).setStrokeStyle(2, 0x4d4843).setDepth(101));
    this.track(
      this.add
        .text(cx, cy, text, { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: textColor, align: 'center', lineSpacing: 2 })
        .setOrigin(0.5)
        .setDepth(102)
    );
  }

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
    EventBus.emit('shop:closed', { shop: 'blacksmith' });
    this.scene.stop();
  }
}
