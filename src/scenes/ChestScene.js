// ChestScene.js
//
// The Seed Chest — a full-screen overlay launched over a frozen GameScene when the
// player interacts with the garden seed-storage chest. Moves seeds between the carry
// SATCHEL and the CHEST (storage beyond satchel capacity):
//   DEPOSIT  — satchel → chest (frees carry slots; stops at chest capacity)
//   WITHDRAW — chest → satchel (stops when the satchel is full)
//
// Built on the shared PaginatedMenu controller (src/ui/PaginatedMenu.js), exactly like
// the three shops: the controller owns the backdrop, frame math, page model and footer;
// this scene supplies the header (title + tabs + live satchel/chest counts) and the
// paginated rows. All seed state lives on GameScene; every move routes through
// GameScene.depositSeed / withdrawSeed (which persist + refresh the HUD). The chest is
// modal like a shop, so it reuses the generic 'shop:opened' / 'shop:closed' lifecycle.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import PaginatedMenu from '../ui/PaginatedMenu.js';
import { CHEST_SEED_CAPACITY } from '../core/Constants.js';

const FONT = '"SproutLands", "Courier New", monospace';
const COLOR_PAGE = 0x141210;
const COLOR_PANEL = 0x221e1b;
const COLOR_ACT = 0x3a7d44; // actionable (deposit/withdraw) green
const COLOR_DISABLED = 0x444039;
const COLOR_CLOSE = 0x36322e;
const COLOR_ARROW = 0x2d2926;
const COLOR_ARROW_DISABLED = 0x201d1a;
const COLOR_TAB_ON = 0x8ab87e;
const COLOR_TAB_OFF = 0x3d3833;
const TAB_BORDER_ON = 0xb8d5b1;
const TAB_BORDER_OFF = 0x6b655d;

const MENU_MARGIN = 20;
const HEADER_H = 52;
const TAB_H = 46;
const TAB_GAP = 12;
const TAB_PAD = 14;
const FOOTER_H = 78;
const ROW_H = 72;
const ROW_GAP = 12;

function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export default class ChestScene extends Phaser.Scene {
  constructor() {
    super('ChestScene');
  }

  create() {
    this.gameScene = this.scene.get('GameScene');
    this.gameData = this.gameScene.gameData;

    this.tab = 'deposit';
    this.page = { deposit: 0, withdraw: 0 };

    this.menu = new PaginatedMenu(this, {
      margin: MENU_MARGIN,
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
    // Every deposit/withdraw emits 'chest:changed'; the world is frozen while this is
    // open, so that is the only state that moves — one subscription rebuilds the menu.
    this._refresh = () => this.menu.render();
    EventBus.on('chest:changed', this._refresh);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      EventBus.off('chest:changed', this._refresh);
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

  switchTab(tab) {
    if (this.tab === tab) return;
    this.tab = tab;
    this.menu.render();
  }

  // --- Counts ----------------------------------------------------------------

  // Map of plantType → how many of that seed the satchel currently carries.
  satchelCounts() {
    const counts = {};
    this.gameScene.player.seedSlots.forEach((s) => {
      if (s) counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }

  satchelFilled() {
    return this.gameScene.player.seedSlots.filter((s) => s !== null).length;
  }

  satchelTotal() {
    return this.gameScene.player.seedSlots.length;
  }

  satchelEmpty() {
    return this.satchelTotal() - this.satchelFilled();
  }

  chestStored() {
    return this.gameScene.seedChestCount();
  }

  chestRoom() {
    return Math.max(0, CHEST_SEED_CAPACITY - this.chestStored());
  }

  // --- Pages -----------------------------------------------------------------

  buildPages(frame) {
    const rowsPerPage = Math.max(1, Math.floor((frame.bandH + ROW_GAP) / (ROW_H + ROW_GAP)));
    const list = this.tab === 'deposit' ? this.depositList() : this.withdrawList();
    const pages = [];
    for (let i = 0; i < list.length; i += rowsPerPage) pages.push(list.slice(i, i + rowsPerPage));
    return pages.length ? pages : [[]];
  }

  // Distinct seed types in the satchel (deposit) / chest (withdraw), in catalog order so
  // the list stays stable across moves.
  depositList() {
    const counts = this.satchelCounts();
    return Object.keys(this.gameData.plants).filter((pt) => counts[pt] > 0);
  }

  withdrawList() {
    const chest = this.gameScene.seedChest;
    return Object.keys(this.gameData.plants).filter((pt) => (chest[pt] || 0) > 0);
  }

  // --- Header: title + live counts + DEPOSIT/WITHDRAW tabs --------------------

  renderHeader(frame) {
    const { left, right, headerTop, innerW, cx } = frame;
    this.track(
      this.add
        .text(left, headerTop, 'SEED CHEST', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#B8D5B1' })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(right, headerTop + 2, `🎒 ${this.satchelFilled()}/${this.satchelTotal()}`, {
          fontFamily: FONT,
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(1, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(right, headerTop + 28, `🧰 ${this.chestStored()}/${CHEST_SEED_CAPACITY}`, {
          fontFamily: FONT,
          fontSize: '18px',
          color: '#B8D5B1'
        })
        .setOrigin(1, 0)
        .setDepth(101)
    );

    const tabW = Math.min(180, innerW / 2 - TAB_GAP);
    const tabCY = headerTop + HEADER_H + TAB_H / 2;
    this.makeTab(cx - tabW / 2 - TAB_GAP / 2, tabCY, tabW, TAB_H, 'DEPOSIT', this.tab === 'deposit', () => this.switchTab('deposit'));
    this.makeTab(cx + tabW / 2 + TAB_GAP / 2, tabCY, tabW, TAB_H, 'WITHDRAW', this.tab === 'withdraw', () => this.switchTab('withdraw'));
  }

  renderBody(frame, items) {
    const { left, innerW, contentTop } = frame;
    if (!items.length) {
      const msg = this.tab === 'deposit' ? 'No seeds in your satchel to store.' : 'The chest is empty.';
      this.track(
        this.add
          .text(left + innerW / 2, contentTop + 30, msg, { fontFamily: FONT, fontSize: '18px', color: '#9B9389' })
          .setOrigin(0.5, 0)
          .setDepth(102)
      );
      return;
    }
    items.forEach((pt, i) => {
      const y = contentTop + i * (ROW_H + ROW_GAP);
      if (this.tab === 'deposit') this.buildDepositRow(pt, left, y, innerW, ROW_H);
      else this.buildWithdrawRow(pt, left, y, innerW, ROW_H);
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

  // --- DEPOSIT: satchel seed → chest -----------------------------------------

  buildDepositRow(pt, x, y, w, h) {
    const plant = this.gameData.plants[pt];
    const have = this.satchelCounts()[pt] || 0;
    const room = this.chestRoom();
    const cy = y + h / 2;
    const can = have > 0 && room > 0;

    this.track(this.add.rectangle(x, y, w, h, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(101));
    this.track(this.add.circle(x + 30, cy, 15, hexToNum(plant.color)).setDepth(102));

    const btnW = 96;
    const btnGap = 10;
    const allX = x + w - 14 - btnW / 2;
    const oneX = allX - btnW - btnGap;
    this.track(
      this.makeButton(oneX, cy, btnW, 42, 'Store 1', can ? COLOR_ACT : COLOR_DISABLED, can, () => this.doDeposit(pt, 1), can ? '#141210' : '#7a746c')
    );
    this.track(
      this.makeButton(allX, cy, btnW, 42, `All (${have})`, can ? COLOR_ACT : COLOR_DISABLED, can, () => this.doDeposit(pt, have), can ? '#141210' : '#7a746c')
    );

    const textW = oneX - btnW / 2 - btnGap - (x + 52);
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
        .text(x + 52, y + h - 26, `carrying × ${have}${room === 0 ? '   ·   chest full' : ''}`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#9B9389'
        })
        .setDepth(102)
    );
  }

  doDeposit(pt, qty) {
    this.gameScene.depositSeed(pt, qty); // emits 'chest:changed' → re-render
  }

  // --- WITHDRAW: chest seed → satchel ----------------------------------------

  buildWithdrawRow(pt, x, y, w, h) {
    const plant = this.gameData.plants[pt];
    const stored = this.gameScene.seedChest[pt] || 0;
    const empty = this.satchelEmpty();
    const cy = y + h / 2;
    const can = stored > 0 && empty > 0;

    this.track(this.add.rectangle(x, y, w, h, COLOR_PANEL).setOrigin(0, 0).setStrokeStyle(2, 0x4d4843).setDepth(101));
    this.track(this.add.circle(x + 30, cy, 15, hexToNum(plant.color)).setDepth(102));

    const btnW = 96;
    const btnGap = 10;
    const allX = x + w - 14 - btnW / 2;
    const oneX = allX - btnW - btnGap;
    // "All" is bounded by satchel space, so it never silently drops seeds.
    const allQty = Math.min(stored, empty);
    this.track(
      this.makeButton(oneX, cy, btnW, 42, 'Take 1', can ? COLOR_ACT : COLOR_DISABLED, can, () => this.doWithdraw(pt, 1), can ? '#141210' : '#7a746c')
    );
    this.track(
      this.makeButton(allX, cy, btnW, 42, `Take ${allQty || 'All'}`, can ? COLOR_ACT : COLOR_DISABLED, can, () => this.doWithdraw(pt, allQty), can ? '#141210' : '#7a746c')
    );

    const textW = oneX - btnW / 2 - btnGap - (x + 52);
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
        .text(x + 52, y + h - 26, `stored × ${stored}${empty === 0 ? '   ·   satchel full' : ''}`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#9B9389'
        })
        .setDepth(102)
    );
  }

  doWithdraw(pt, qty) {
    this.gameScene.withdrawSeed(pt, qty); // emits 'chest:changed' → re-render
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
    EventBus.emit('shop:closed', { shop: 'seedChest' });
    this.scene.stop();
  }
}
