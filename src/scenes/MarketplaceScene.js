// MarketplaceScene.js
//
// The Market — a full-screen overlay launched on top of GameScene (frozen behind it)
// when the player interacts with the market stall. Two tabs:
//   SELL — turn harvested plants into coins (price scales with grow time).
//   BUY  — spend coins on gear (by slot) and capacity (seed bag / beds / watering).
//
// Sprint mobile-playability-2 — readability redesign (unified desktop + mobile):
// the scene used to be authored in the fixed 1600x900 space and letterboxed onto the
// screen via fitCameraToVirtual, so on a phone every row scaled down to unreadable and
// the backdrop didn't full-bleed (the game peeked around the edges). It now lays out
// from the LIVE viewport: a full-bleed backdrop, larger rows sized for a phone, fewer
// rows per page with ◀ ▶ / dots / swipe pagination for the overflow, and bottom
// controls lifted clear of the iOS home-indicator safe-area inset. A narrow-width
// breakpoint collapses each BUY row's tier-chip strip into a compact "current → next"
// row so it stays tappable on a phone; desktop keeps the full strip, just larger and
// full-bleed. All prices/values still come from economy.json via GameScene; this scene
// only renders + dispatches, and every coin change flows through GameScene so the HUD
// stays in sync.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';

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
const COLOR_PAGE = 0x141210; // full-bleed page fill (near-opaque so no game peeks)
const COLOR_PANEL = 0x221e1b;
const COLOR_AFFORD = 0x3a7d44;
const COLOR_DISABLED = 0x444039;
const COLOR_OWNED = 0x2f4a33;
const COLOR_LOCKED = 0x2b2723;
const COLOR_CLOSE = 0x36322e;
const COLOR_ARROW = 0x2d2926;
const COLOR_ARROW_DISABLED = 0x201d1a;
const COLOR_TAB_ON = 0xc96b42;
const COLOR_TAB_OFF = 0x3d3833;
const TAB_BORDER_ON = 0xedd49a;
const TAB_BORDER_OFF = 0x6b655d;

// --- Live-viewport layout metrics (Sprint mobile-playability-2) ---
// Screen-space px, applied identically on desktop + mobile (the viewport differs, the
// row sizing does not — that is the "unified" readable layout). All tunable.
const MARKET_MARGIN = 20; // gap from screen edges (added to safe insets)
const HEADER_H = 52; // title row height
const TAB_H = 46;
const TAB_GAP = 12;
const FOOTER_H = 78; // close button + paging dots zone (above the bottom inset)
const SELL_ROW_H = 72;
const BUY_ROW_H = 76;
const ROW_GAP = 12;
const NARROW_W = 780; // below this width, BUY rows collapse to compact "cur → next"

// BUY tier-chip strip (wide layout only).
const CHIP_W = 150;
const CHIP_H = 52;
const CHIP_GAP = 10;

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
    this.page = { sell: 0, buy: 0 };
    this._objs = [];

    this.render();

    // Reflow on rotation / toolbar collapse (live viewport changed).
    this.scale.on('resize', this.onResize, this);

    this.input.keyboard.on('keydown-ESC', () => this.close());
    this.input.keyboard.on('keydown-LEFT', () => this.changePage(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.changePage(1));

    // Mobile gestures: swipe down to dismiss (no Esc key); horizontal swipe pages.
    if (MobileDetect.isMobile()) {
      let startX = 0;
      let startY = 0;
      this.input.on('pointerdown', (p) => {
        startX = p.x;
        startY = p.y;
      });
      this.input.on('pointerup', (p) => {
        const dx = p.x - startX;
        const dy = p.y - startY;
        if (dy > 120 && Math.abs(dx) < 90) {
          this.close();
        } else if (Math.abs(dx) > 120 && Math.abs(dy) < 90) {
          this.changePage(dx < 0 ? 1 : -1);
        }
      });
    }

    // Live refresh when coins or the bank change (any purchase/sale emits these).
    this._refresh = () => this.render();
    EventBus.on('coins:changed', this._refresh);
    EventBus.on('bank:updated', this._refresh);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      EventBus.off('coins:changed', this._refresh);
      EventBus.off('bank:updated', this._refresh);
      this.input.keyboard.removeAllListeners();
    });
  }

  onResize() {
    this.render();
  }

  coins() {
    return this.gameScene.coins || 0;
  }

  track(objs) {
    (Array.isArray(objs) ? objs : [objs]).forEach((o) => this._objs.push(o));
    return objs;
  }

  switchTab(tab) {
    if (this.tab === tab) return;
    this.tab = tab;
    this.render();
  }

  changePage(delta) {
    const count = this._pageCount || 1;
    const next = Phaser.Math.Clamp((this.page[this.tab] || 0) + delta, 0, count - 1);
    if (next === this.page[this.tab]) return;
    this.page[this.tab] = next;
    this.render();
  }

  // --- Full re-render (create + every resize / refresh) ----------------------
  // Rebuilds the whole scene from the live viewport. A modal rebuild is cheap and
  // keeps a single layout path for desktop, mobile, rotation, and data changes.
  render() {
    this._objs.forEach((o) => o.destroy());
    this._objs = [];

    const W = this.scale.width;
    const H = this.scale.height;
    const safe = MobileDetect.isMobile()
      ? MobileDetect.getRawInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };

    const left = safe.left + MARKET_MARGIN;
    const right = W - safe.right - MARKET_MARGIN;
    const innerW = Math.max(120, right - left);
    const cx = (left + right) / 2;
    const narrow = W < NARROW_W;

    // Full-bleed page fill — also resolves the old modal-not-full-bleed cosmetic
    // (game peeking around the letterbox), and swallows taps to the world behind.
    this.track(
      this.add.rectangle(0, 0, W, H, COLOR_PAGE, 0.97).setOrigin(0, 0).setDepth(100).setInteractive()
    );

    // Header: title (left) + live coin balance (right).
    const titleY = safe.top + MARKET_MARGIN;
    this.track(
      this.add
        .text(left, titleY, 'MARKET', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#E5B69A' })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(right, titleY + 4, `🪙 ${this.coins()}`, {
          fontFamily: FONT,
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(1, 0)
        .setDepth(101)
    );

    // Tabs, centred under the header.
    const tabW = Math.min(170, innerW / 2 - TAB_GAP);
    const tabCY = titleY + HEADER_H + TAB_H / 2;
    this.makeTab(cx - tabW / 2 - TAB_GAP / 2, tabCY, tabW, TAB_H, 'SELL', this.tab === 'sell', () => this.switchTab('sell'));
    this.makeTab(cx + tabW / 2 + TAB_GAP / 2, tabCY, tabW, TAB_H, 'BUY', this.tab === 'buy', () => this.switchTab('buy'));

    // Footer: Close button lifted clear of the bottom safe-area inset, with paging
    // arrows flanking it and page dots just above (2f — home-indicator clearance).
    const closeCY = H - safe.bottom - MARKET_MARGIN - 16;
    const dotsY = closeCY - 34;

    // Content band between the tabs and the footer.
    const contentTop = tabCY + TAB_H / 2 + 14;
    const contentBottom = H - safe.bottom - MARKET_MARGIN - FOOTER_H;
    const contentH = Math.max(60, contentBottom - contentTop);

    const rowH = this.tab === 'sell' ? SELL_ROW_H : BUY_ROW_H;
    const rowsPerPage = Math.max(1, Math.floor((contentH + ROW_GAP) / (rowH + ROW_GAP)));

    const list = this.tab === 'sell' ? this.sellList() : this.buyList();
    const pageCount = Math.max(1, Math.ceil(list.length / rowsPerPage));
    this._pageCount = pageCount;
    const page = Phaser.Math.Clamp(this.page[this.tab] || 0, 0, pageCount - 1);
    this.page[this.tab] = page;

    const pageItems = list.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    pageItems.forEach((item, i) => {
      const y = contentTop + i * (rowH + ROW_GAP);
      if (this.tab === 'sell') this.buildSellRow(item, left, y, innerW, rowH);
      else if (narrow) this.buildBuyRowCompact(item, left, y, innerW, rowH);
      else this.buildBuyRowWide(item, left, y, innerW, rowH);
    });

    this.buildFooter(cx, closeCY, dotsY, innerW, pageCount, page);
  }

  // --- Tabs ------------------------------------------------------------------

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

  // --- SELL ------------------------------------------------------------------

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

    // Sell buttons pinned to the right; the text column fills the space to their left.
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
    this.render(); // also rebuilt by the coins/bank events; render now in case ordering shifts
  }

  // --- BUY -------------------------------------------------------------------
  // One flat list of tier rows (gear then capacity); the row label names the item so
  // no separate section headers are needed (which keeps pagination simple).

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

  // Wide (desktop / tablet): the full tier-chip strip — owned ✓, the buyable next
  // tier, and greyed future tiers so the player can plan ahead.
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

  // Narrow (phone): compact row — name, current → next tier, and a single Buy button.
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
    this.render();
  }

  doBuyCapacity(tree) {
    this.gameScene.purchaseCapacity(tree);
    this.render();
  }

  // --- Footer (close + pagination) ------------------------------------------

  buildFooter(cx, closeCY, dotsY, innerW, pageCount, page) {
    this.makeButton(cx, closeCY, 220, 44, MobileDetect.isMobile() ? 'Close' : 'Close   ·   Esc', COLOR_CLOSE, true, () => this.close(), '#F5EFE6');

    if (pageCount <= 1) return;

    const arrowOffset = Math.min(200, innerW / 2 - 40);
    const prevOn = page > 0;
    const nextOn = page < pageCount - 1;
    this.makeButton(cx - arrowOffset, closeCY, 52, 44, '◀', prevOn ? COLOR_ARROW : COLOR_ARROW_DISABLED, prevOn, () => this.changePage(-1), '#F5EFE6');
    this.makeButton(cx + arrowOffset, closeCY, 52, 44, '▶', nextOn ? COLOR_ARROW : COLOR_ARROW_DISABLED, nextOn, () => this.changePage(1), '#F5EFE6');

    const dotGap = 24;
    const startX = cx - (dotGap * (pageCount - 1)) / 2;
    for (let i = 0; i < pageCount; i++) {
      this.track(this.add.circle(startX + i * dotGap, dotsY, 6, i === page ? 0xeac34f : 0x4d4843).setDepth(102));
    }
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

  // Sprout Lands square-button art (nine-sliced + tinted) with a plain-rectangle
  // fallback so the flow never depends on the sheet. Returns [bg, text].
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
    EventBus.emit('market:closed', {});
    this.scene.stop();
  }
}
