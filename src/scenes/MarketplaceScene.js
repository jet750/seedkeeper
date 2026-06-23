// MarketplaceScene.js
//
// The Market — a full-screen overlay launched on top of GameScene (frozen behind
// it) when the player interacts with the market stall. Two tabs:
//   SELL — turn harvested plants into coins (price scales with grow time).
//   BUY  — spend coins on gear (by slot) and capacity (seed bag / beds / watering).
//
// All prices/values come from economy.json via GameScene; this scene only renders
// and dispatches. Every coin change flows through GameScene's addCoins/spendCoins
// (Sprint 2), so the HUD counter stays in sync. Tiers are fully transparent: owned
// tiers are ticked, the next tier shows a BUY (greyed when unaffordable), and
// farther tiers render their real name + price, greyed — so the player can judge
// whether a future upgrade is worth saving for before committing coins.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';

const PLANT_ORDER = [
  'red_mushroom',
  'blue_flower',
  'golden_wheat',
  'green_herb',
  'glowshroom',
  'sunflower'
];
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

const FONT = '"SproutLands", "Courier New", monospace';
const COLOR_PANEL = 0x221e1b;
const COLOR_AFFORD = 0x3a7d44;
const COLOR_DISABLED = 0x444039;
const COLOR_OWNED = 0x2f4a33;
const COLOR_LOCKED = 0x2b2723; // future/locked tier — visible surface, clearly greyed text
const COLOR_CLOSE = 0x36322e;
// Tabs (Sprint 3-polish): the active tab is the ember section accent with dark
// text; the inactive tab is a lifted ash surface with a visible border + light
// text — so BOTH read as real, clickable tabs, not one bright button + one void.
const COLOR_TAB_ON = 0xc96b42;
const COLOR_TAB_OFF = 0x3d3833;
const TAB_BORDER_ON = 0xedd49a; // pastel-gold highlight ring on the active tab
const TAB_BORDER_OFF = 0x6b655d; // muted but clearly visible border, inactive tab
const TAB_TEXT_ON = '#1a1410';
const TAB_TEXT_OFF = '#D6D0C8';

// BUY-tab row metrics (Sprint 3-polish). Taller rows + larger chips give the
// name + price + state room to breathe at the game's 2.5 camera zoom.
const ROW_H = 64; // panel height per tier row
const ROW_STRIDE = 76; // row-to-row vertical step (ROW_H + breathing gap)
const CHIP_W = 172;
const CHIP_H = 52;
const CHIP_GAP = 12;
const CHIP_START_X = 296;

const SELL_NUDGE =
  'Selling plants is the fastest way to earn coins — but these same plants level your\n' +
  'skill trees. Spend wisely; don’t starve your growth to fill your purse.';

function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export default class MarketplaceScene extends Phaser.Scene {
  constructor() {
    super('MarketplaceScene');
  }

  create() {
    this.gameScene = this.scene.get('GameScene');
    this.gameData = this.gameScene.gameData;
    this.economy = this.gameScene.economyData;

    this.tab = 'sell';
    this.contentObjs = []; // rebuilt on every refresh
    this.tabButtons = {};

    // Dim, click-swallowing backdrop.
    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x000000, 0.85)
      .setOrigin(0, 0)
      .setDepth(100)
      .setInteractive();

    this.add
      .text(60, 34, 'MARKET', {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#E5B69A'
      })
      .setDepth(101);

    // Live coin balance (top-right).
    this.coinText = this.add
      .text(VIRTUAL_WIDTH - 60, 44, '', {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setOrigin(1, 0.5)
      .setDepth(101);

    // Tabs — both rendered as real, legible tabs; restyleTabs sets the active /
    // inactive look (run once now to paint the initial SELL-active state).
    this.tabButtons.sell = this.makeTab(360, 98, 168, 46, 'SELL', () => this.switchTab('sell'));
    this.tabButtons.buy = this.makeTab(540, 98, 168, 46, 'BUY', () => this.switchTab('buy'));
    this.restyleTabs();

    // Close.
    this.makeButton(
      VIRTUAL_WIDTH / 2,
      VIRTUAL_HEIGHT - 40,
      220,
      42,
      '[ Close ]   Esc',
      COLOR_CLOSE,
      true,
      () => this.close(),
      '#F5EFE6'
    );

    this.buildContent();

    this.input.keyboard.on('keydown-ESC', () => this.close());

    // Live refresh when coins or the bank change (any purchase/sale emits these).
    this._refresh = () => this.buildContent();
    EventBus.on('coins:changed', this._refresh);
    EventBus.on('bank:updated', this._refresh);
    this.events.once('shutdown', () => {
      EventBus.off('coins:changed', this._refresh);
      EventBus.off('bank:updated', this._refresh);
    });

    // Mobile: swipe down to dismiss (no Esc key), plus a hint.
    if (MobileDetect.isMobile()) {
      let startY = 0;
      let startX = 0;
      this.input.on('pointerdown', (p) => {
        startY = p.y;
        startX = p.x;
      });
      this.input.on('pointerup', (p) => {
        if (p.y - startY > 120 && Math.abs(p.x - startX) < 90) this.close();
      });
      this.add
        .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 74, 'swipe down to close', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#9B9389'
        })
        .setOrigin(0.5)
        .setDepth(101);
    }
  }

  // --- Tabs / content -------------------------------------------------------

  switchTab(tab) {
    if (this.tab === tab) return;
    this.tab = tab;
    this.restyleTabs();
    this.buildContent();
  }

  restyleTabs() {
    const paint = ([bg, text], on) => {
      bg._active = on; // hover handlers leave the active tab alone
      bg.setFillStyle(on ? COLOR_TAB_ON : COLOR_TAB_OFF);
      bg.setStrokeStyle(on ? 3 : 2, on ? TAB_BORDER_ON : TAB_BORDER_OFF);
      text.setColor(on ? TAB_TEXT_ON : TAB_TEXT_OFF);
    };
    paint(this.tabButtons.sell, this.tab === 'sell');
    paint(this.tabButtons.buy, this.tab === 'buy');
  }

  // A flat-rectangle tab with a readable label in BOTH states. The active look
  // (ember fill + gold ring + dark text) vs inactive (ash fill + visible border +
  // light text) is applied by restyleTabs; hover only brightens an inactive tab.
  makeTab(cx, cy, w, h, label, onClick) {
    const bg = this.add
      .rectangle(cx, cy, w, h, COLOR_TAB_OFF)
      .setStrokeStyle(2, TAB_BORDER_OFF)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(cx, cy, label, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: TAB_TEXT_OFF })
      .setOrigin(0.5)
      .setDepth(102);
    bg.on('pointerover', () => {
      if (!bg._active) bg.setStrokeStyle(2, TAB_BORDER_ON);
    });
    bg.on('pointerout', () => {
      if (!bg._active) bg.setStrokeStyle(2, TAB_BORDER_OFF);
    });
    bg.on('pointerup', onClick);
    return [bg, text];
  }

  buildContent() {
    this.coinText.setText(`🪙 ${this.coins()}`);
    this.contentObjs.forEach((o) => o.destroy());
    this.contentObjs = [];
    if (this.tab === 'sell') this.buildSell();
    else this.buildBuy();
  }

  coins() {
    return this.gameScene.coins || 0;
  }

  track(objs) {
    (Array.isArray(objs) ? objs : [objs]).forEach((o) => this.contentObjs.push(o));
  }

  // --- SELL -----------------------------------------------------------------

  buildSell() {
    this.track(
      this.add
        .text(80, 150, SELL_NUDGE, {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#E5B69A',
          lineSpacing: 4
        })
        .setDepth(101)
    );

    let y = 248;
    PLANT_ORDER.forEach((pt) => {
      const plant = this.gameData.plants[pt];
      const have = this.gameScene.plantBank[pt] || 0;
      const unit = this.gameScene.sellPrice(pt);

      this.track(this.add.rectangle(80, y, 1440, 64, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(100));
      this.track(this.add.circle(120, y + 32, 14, hexToNum(plant.color)).setDepth(101));
      this.track(
        this.add
          .text(150, y + 16, plant.name, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#F5EFE6' })
          .setDepth(101)
      );
      this.track(
        this.add
          .text(150, y + 40, `owned × ${have}   ·   ${unit}🪙 each (${plant.growthDays}-day)`, {
            fontFamily: FONT,
            fontSize: '14px',
            color: '#9B9389'
          })
          .setDepth(101)
      );

      const can = have > 0;
      this.track(
        this.makeButton(1180, y + 32, 150, 36, 'Sell 1', can ? COLOR_AFFORD : COLOR_DISABLED, can, () =>
          this.doSell(pt, 1), can ? '#141210' : '#7a746c')
      );
      this.track(
        this.makeButton(1360, y + 32, 170, 36, `Sell All (${have})`, can ? COLOR_AFFORD : COLOR_DISABLED, can, () =>
          this.doSell(pt, have), can ? '#141210' : '#7a746c')
      );
      y += 76;
    });
  }

  doSell(pt, qty) {
    this.gameScene.sellPlant(pt, qty);
    // bank:updated / coins:changed → _refresh rebuilds; rebuild now too in case
    // event ordering ever shifts.
    this.buildContent();
  }

  // --- BUY ------------------------------------------------------------------

  buildBuy() {
    let y = 150;

    this.track(this.sectionHeader('GEAR', y));
    y += 34;
    GEAR_SLOTS.forEach(([slot, label]) => {
      const list = this.economy.gear[slot] || [];
      const owned = this.gameScene.gearTierIndex(slot); // -1 = none
      const items = list.map((g) => ({ label: g.name, price: g.price, id: g.id }));
      this.buildTierRow(y, label, items, owned, (idx) => this.doBuyGear(slot, items[idx].id));
      y += ROW_STRIDE;
    });

    y += 10;
    this.track(this.sectionHeader('CAPACITY', y));
    y += 34;
    CAPACITY_TREES.forEach(([tree, label, key, unit]) => {
      const def = this.economy.capacity[tree];
      const field = { seedBag: 'seedBagTier', gardenBeds: 'gardenBedTier', watering: 'wateringTier' }[tree];
      const tierCount = this.gameScene[field] || 0;
      // Base tier (always owned) prepended so the strip shows the current value.
      const items = [{ label: `${def.base} ${unit}`, price: null, base: true }].concat(
        def.tiers.map((t) => ({ label: `${t[key]} ${unit}`, price: t.price }))
      );
      const owned = tierCount; // base(0) + tierCount bought → highest owned index
      this.buildTierRow(y, label, items, owned, () => this.doBuyCapacity(tree));
      y += ROW_STRIDE;
    });
  }

  // Render a labelled row of tier chips with three distinct, fully-labelled states:
  //   owned        — ticked (✓ name)
  //   next         — the buyable highlight (BUY price, greyed when unaffordable)
  //   future/locked — real name + price, greyed (no "???"), so the player can judge
  //                   whether a later upgrade is worth saving for before committing.
  // onBuyNext receives the next tier's index in `items`.
  buildTierRow(y, label, items, ownedIndex, onBuyNext) {
    this.track(
      this.add.rectangle(80, y, 1440, ROW_H, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(100)
    );
    this.track(
      this.add
        .text(100, y + ROW_H / 2, label, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#F5EFE6' })
        .setOrigin(0, 0.5)
        .setDepth(101)
    );

    const next = ownedIndex + 1;
    const cy = y + ROW_H / 2;
    items.forEach((item, i) => {
      const cx = CHIP_START_X + i * (CHIP_W + CHIP_GAP) + CHIP_W / 2;
      if (i <= ownedIndex) {
        // Owned tier — ticked.
        this.chip(cx, cy, COLOR_OWNED, `✓ ${item.label}`, '#B8D5B1');
      } else if (i === next) {
        // Next tier — the buyable highlight; greyed/"Need" when unaffordable.
        const price = item.price;
        const affordable = this.coins() >= price;
        const sub = affordable ? `BUY  ${price}🪙` : `Need ${price}🪙`;
        this.track(
          this.makeButton(
            cx,
            cy,
            CHIP_W,
            CHIP_H,
            `${item.label}\n${sub}`,
            affordable ? COLOR_AFFORD : COLOR_DISABLED,
            affordable,
            () => onBuyNext(i),
            affordable ? '#141210' : '#C9C2B8'
          )
        );
      } else {
        // Future/locked tier — fully labelled (real name + price) but greyed.
        this.chip(cx, cy, COLOR_LOCKED, `${item.label}\n${item.price}🪙`, '#9B9389');
      }
    });
  }

  chip(cx, cy, color, text, textColor) {
    this.track(this.add.rectangle(cx, cy, CHIP_W, CHIP_H, color).setStrokeStyle(2, 0x4d4843).setDepth(101));
    this.track(
      this.add
        .text(cx, cy, text, {
          fontFamily: FONT,
          fontSize: '14px',
          fontStyle: 'bold',
          color: textColor,
          align: 'center',
          lineSpacing: 2
        })
        .setOrigin(0.5)
        .setDepth(102)
    );
  }

  doBuyGear(slot, tierId) {
    this.gameScene.purchaseGear(slot, tierId);
    this.buildContent();
  }

  doBuyCapacity(tree) {
    this.gameScene.purchaseCapacity(tree);
    this.buildContent();
  }

  // --- Shared UI ------------------------------------------------------------

  sectionHeader(label, y) {
    return this.add
      .text(80, y, label, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#EDD49A' })
      .setDepth(101);
  }

  // Sprout Lands square-button art (nine-sliced + tinted) with a plain-rectangle
  // fallback so the flow never depends on the sheet. Mirrors UpgradeScene.
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
      .text(cx, cy, label, {
        fontFamily: FONT,
        fontSize: '14px',
        fontStyle: 'bold',
        color: textColor || '#141210',
        align: 'center'
      })
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
    EventBus.emit('market:closed', {});
    this.scene.stop();
  }
}
