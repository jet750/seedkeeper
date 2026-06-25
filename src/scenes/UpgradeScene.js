// UpgradeScene.js
//
// The Seedkeeper Workshop — a full-screen overlay launched on top of GameScene
// (which keeps rendering frozen behind it). v2: shows plant STAT trees only (gear
// + capacity moved to the coin economy / marketplace). Spends plant resources and
// asks GameScene to apply effects + auto-save via purchaseUpgrade(). Reads live
// state from GameScene (plantBank, upgradeLevels, gameData); never mutates directly.
//
// Sprint 10: the reconciled catalog has 10 stat trees (one plant each) — too many
// for one screen, so the trees are split across 2 pages of 5 with ◀ ▶ arrows and
// page dots. Page-scoped objects are tracked and torn down on every page switch.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';
import entitiesData from '../data/entities.json';

// One stat tree per plant, derived from the upgrades catalog (10 entries → 2 pages).
const PLANT_ORDER = Object.keys(entitiesData.upgrades);
const PAGE_SIZE = 5;
const PAGE_COUNT = Math.ceil(PLANT_ORDER.length / PAGE_SIZE);

const PANEL_W = 700;
const PANEL_H = 190;
const COL_STRIDE = 740;
const ROW_STRIDE = 210;
const GRID_X = 80;
const GRID_Y = 150;

const COLOR_AFFORD = 0x3a7d44;
const COLOR_DISABLED = 0x444039;
const COLOR_CONFIRM_YES = 0x3a7d44;
const COLOR_CONFIRM_NO = 0x8a3a3a;
const COLOR_PANEL = 0x221e1b;
const COLOR_CLOSE = 0x36322e;
const COLOR_ARROW = 0x2d2926;
const COLOR_ARROW_DISABLED = 0x201d1a;

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
    this._pending = null; // { plantType, track } awaiting confirm
    this.panelRefs = {};
    this.actionObjs = {}; // key `${plantType}_${track}` -> [gameobjects]
    this.summaryRefs = {};
    this._pageObjs = []; // every object that belongs to the current page (destroyed on switch)

    // Dim, click-swallowing backdrop.
    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x000000, 0.85)
      .setOrigin(0, 0)
      .setDepth(100)
      .setInteractive();

    // Title plate — Sprout Lands dialog box behind the header, nine-sliced so the
    // 176x48 art scales without distorting its border. The cream fill wants dark
    // text, so the title only goes brown when the plate is actually present.
    const hasPlate = this.textures.exists('ui_dialog_big');
    if (hasPlate) {
      this.add
        .nineslice(266, 52, 'ui_dialog_big', undefined, 470, 64, 18, 18, 16, 16)
        .setDepth(100);
    }
    this.add
      .text(60, 36, 'SEEDKEEPER WORKSHOP', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '34px',
        fontStyle: 'bold',
        color: hasPlate ? '#4a3520' : '#EDD49A'
      })
      .setDepth(101);

    // Close button (static across pages).
    this.makeButton(
      VIRTUAL_WIDTH / 2,
      VIRTUAL_HEIGHT - 42,
      220,
      42,
      '[ Close ]   Esc',
      COLOR_CLOSE,
      true,
      () => this.close(),
      '#F5EFE6'
    );

    // Paging chrome — prev/next arrows flanking the close button, plus page dots.
    this.buildPagingChrome();

    this.buildPage();

    this.input.keyboard.on('keydown-ESC', () => this.close());
    this.input.keyboard.on('keydown-LEFT', () => this.switchPage(this.page - 1));
    this.input.keyboard.on('keydown-RIGHT', () => this.switchPage(this.page + 1));

    // Keep displays live if the bank changes (it does on each purchase).
    this._onBank = () => {
      this.refreshSummary();
      this.pagePlants().forEach((pt) => this.refreshPanel(pt));
    };
    EventBus.on('bank:updated', this._onBank);
    this.events.once('shutdown', () => EventBus.off('bank:updated', this._onBank));

    // Mobile: the BUY/Close buttons already take touch (pointerup), but there's no
    // Esc key — add a swipe-down gesture to dismiss, plus a hint. The horizontal
    // guard keeps it from firing on a sideways drag across buttons.
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
        .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 76, 'swipe to change page · swipe down to close', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '14px',
          color: '#9B9389'
        })
        .setOrigin(0.5)
        .setDepth(101);
      // Horizontal swipe pages between the two screens of trees.
      this.input.on('pointerup', (p) => {
        const dx = p.x - startX;
        if (Math.abs(dx) > 120 && Math.abs(p.y - startY) < 90) {
          this.switchPage(this.page + (dx < 0 ? 1 : -1));
        }
      });
    }
  }

  // --- Paging ---------------------------------------------------------------

  pagePlants() {
    return PLANT_ORDER.slice(this.page * PAGE_SIZE, this.page * PAGE_SIZE + PAGE_SIZE);
  }

  buildPagingChrome() {
    const cy = VIRTUAL_HEIGHT - 42;
    this._prevArrow = this.makeButton(VIRTUAL_WIDTH / 2 - 200, cy, 56, 42, '◀', COLOR_ARROW, true, () =>
      this.switchPage(this.page - 1), '#F5EFE6'
    );
    this._nextArrow = this.makeButton(VIRTUAL_WIDTH / 2 + 200, cy, 56, 42, '▶', COLOR_ARROW, true, () =>
      this.switchPage(this.page + 1), '#F5EFE6'
    );

    // Page dots, centred above the close button.
    this._dots = [];
    const dotGap = 26;
    const startX = VIRTUAL_WIDTH / 2 - (dotGap * (PAGE_COUNT - 1)) / 2;
    for (let i = 0; i < PAGE_COUNT; i++) {
      this._dots.push(this.add.circle(startX + i * dotGap, VIRTUAL_HEIGHT - 92, 7, 0x4d4843).setDepth(101));
    }
  }

  switchPage(next) {
    const clamped = Phaser.Math.Clamp(next, 0, PAGE_COUNT - 1);
    if (clamped === this.page) return;
    this.page = clamped;
    this._pending = null;
    this.buildPage();
  }

  buildPage() {
    // Tear down the previous page's objects.
    this._pageObjs.forEach((o) => o.destroy());
    this._pageObjs = [];
    this.panelRefs = {};
    this.summaryRefs = {};
    this.actionObjs = {};

    const plants = this.pagePlants();
    this.buildResourceSummary(plants);
    plants.forEach((pt, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      this.buildPanel(pt, GRID_X + col * COL_STRIDE, GRID_Y + row * ROW_STRIDE);
    });
    plants.forEach((pt) => this.refreshPanel(pt));
    this.refreshSummary();

    // Arrow availability + dot highlight.
    this.setArrowEnabled(this._prevArrow, this.page > 0);
    this.setArrowEnabled(this._nextArrow, this.page < PAGE_COUNT - 1);
    this._dots.forEach((d, i) => d.setFillStyle(i === this.page ? 0xeac34f : 0x4d4843));
  }

  setArrowEnabled([bg], enabled) {
    bg.setAlpha(enabled ? 1 : 0.4);
    if (this.textures.exists('ui_btn_square')) bg.setTint(enabled ? COLOR_ARROW : COLOR_ARROW_DISABLED);
    else bg.setFillStyle(enabled ? COLOR_ARROW : COLOR_ARROW_DISABLED);
  }

  track(objs) {
    (Array.isArray(objs) ? objs : [objs]).forEach((o) => this._pageObjs.push(o));
    return objs;
  }

  // --- Header resource summary (current page's plants) ----------------------

  buildResourceSummary(plants) {
    plants.forEach((pt, i) => {
      const x = 660 + i * 156;
      const color = hexToNum(this.gameData.plants[pt].color);
      this.track(this.add.circle(x, 56, 11, color).setDepth(101));
      this.summaryRefs[pt] = this.add
        .text(x + 18, 56, '0', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '20px',
          color: '#F5EFE6'
        })
        .setOrigin(0, 0.5)
        .setDepth(101);
      this.track(this.summaryRefs[pt]);
    });
  }

  refreshSummary() {
    this.pagePlants().forEach((pt) => {
      if (this.summaryRefs[pt]) this.summaryRefs[pt].setText(`${this.bank(pt)}`);
    });
  }

  // --- Panels ---------------------------------------------------------------

  buildPanel(pt, px, py) {
    const plant = this.gameData.plants[pt];

    this.track(
      this.add
        .rectangle(px, py, PANEL_W, PANEL_H, COLOR_PANEL)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x4d4843)
        .setDepth(100)
    );

    this.track(this.add.circle(px + 34, py + 34, 16, hexToNum(plant.color)).setDepth(101));

    this.track(
      this.add
        .text(px + 62, py + 22, plant.name, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#F5EFE6'
        })
        .setDepth(101)
    );

    const resourceText = this.add
      .text(px + PANEL_W - 20, py + 24, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '20px',
        color: '#EDD49A'
      })
      .setOrigin(1, 0)
      .setDepth(101);
    this.track(resourceText);

    const statLabel = this.add
      .text(px + 24, py + 78, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '15px',
        color: '#D1CCC6',
        lineSpacing: 4
      })
      .setDepth(101);
    this.track(statLabel);

    this.panelRefs[pt] = { px, py, resourceText, statLabel };
  }

  refreshPanel(pt) {
    const ref = this.panelRefs[pt];
    if (!ref) return;
    ref.resourceText.setText(`× ${this.bank(pt)}`);
    ref.statLabel.setText(this.statLabelText(pt));
    this.rebuildAction(pt, 'stat');
  }

  statLabelText(pt) {
    const s = this.gameData.upgrades[pt].stat;
    const lv = this.levels(pt).stat;
    if (lv >= s.levels) return `STAT · ${s.name}\nLv ${lv}/${s.levels} · MAXED`;
    return `STAT · ${s.name}   Lv ${lv}/${s.levels}\nNext: ${this.statEffectText(pt)}`;
  }

  statEffectText(pt) {
    const s = this.gameData.upgrades[pt].stat;
    const b = s.perLevelBonus;
    if (s.statKey === 'healthRegen') return `+${b} HP/sec`;
    return `+${Math.round(b * 100)}% ${s.name}`;
  }

  // --- Action buttons (rebuilt on every refresh) ----------------------------

  rebuildAction(pt, track) {
    const key = `${pt}_${track}`;
    if (this.actionObjs[key]) {
      this.actionObjs[key].forEach((o) => o.destroy());
    }
    this.actionObjs[key] = [];

    const ref = this.panelRefs[pt];
    if (!ref) return;
    const rowY = ref.py + 92;
    const rightX = ref.px + PANEL_W - 20;

    // Confirm prompt for the pending row.
    if (this._pending && this._pending.plantType === pt && this._pending.track === track) {
      const cost = this.nextCost(pt);
      const yes = this.makeButton(
        rightX - 150,
        rowY,
        150,
        34,
        `✓ Spend ${cost}`,
        COLOR_CONFIRM_YES,
        true,
        () => this.onConfirm(pt, track),
        '#FFFFFF'
      );
      const no = this.makeButton(
        rightX - 36,
        rowY,
        40,
        34,
        '✗',
        COLOR_CONFIRM_NO,
        true,
        () => this.onCancel(pt, track),
        '#FFFFFF'
      );
      this.actionObjs[key] = [...yes, ...no];
      this.track(this.actionObjs[key]);
      return;
    }

    // Maxed → static label, no button.
    if (this.isMaxed(pt)) {
      const t = this.add
        .text(rightX, rowY, 'MAXED', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#8AB87E'
        })
        .setOrigin(1, 0.5)
        .setDepth(102);
      this.actionObjs[key] = [t];
      this.track(t);
      return;
    }

    // Normal BUY button — green if affordable, grey/disabled otherwise.
    const cost = this.nextCost(pt);
    const affordable = this.bank(pt) >= cost;
    this.actionObjs[key] = this.makeButton(
      rightX - 70,
      rowY,
      140,
      34,
      `BUY  ${cost}`,
      affordable ? COLOR_AFFORD : COLOR_DISABLED,
      affordable,
      () => this.onBuyClicked(pt, track),
      affordable ? '#141210' : '#7a746c'
    );
    this.track(this.actionObjs[key]);
  }

  // --- Purchase flow --------------------------------------------------------

  onBuyClicked(pt, track) {
    this._pending = { plantType: pt, track };
    // Cancel any other pending confirm so only one is active at a time.
    this.pagePlants().forEach((p) => this.rebuildAction(p, 'stat'));
  }

  onConfirm(pt, track) {
    this._pending = null;
    this.gameScene.purchaseUpgrade(pt, track);
    // purchase emits bank:updated → _onBank refreshes everything; refresh now too
    // so the change is instant even if the event order ever shifts.
    this.refreshSummary();
    this.pagePlants().forEach((p) => this.refreshPanel(p));
  }

  onCancel(pt, track) {
    this._pending = null;
    this.rebuildAction(pt, track);
  }

  // --- Small helpers --------------------------------------------------------

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

  // Button background uses the Sprout Lands square-button art (nine-sliced from a
  // neutral cream frame so it scales to any width without distortion, then tinted
  // to keep the affordable/disabled/confirm colour coding). Falls back to a plain
  // rectangle when the sheet is absent, so the purchase flow never depends on art.
  makeButton(cx, cy, w, h, label, baseColor, enabled, onClick, textColor) {
    const isSprite = this.textures.exists('ui_btn_square');
    let bg;
    if (isSprite) {
      bg = this.add
        .nineslice(cx, cy, 'ui_btn_square', 2, w, h, 10, 10, 10, 10)
        .setTint(baseColor)
        .setDepth(101);
    } else {
      bg = this.add
        .rectangle(cx, cy, w, h, baseColor)
        .setStrokeStyle(2, 0x000000)
        .setDepth(101);
    }
    const text = this.add
      .text(cx, cy, label, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: textColor || '#141210'
      })
      .setOrigin(0.5)
      .setDepth(102);

    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      if (isSprite) {
        // Hover brightens the button to its natural cream; out restores the tint.
        bg.on('pointerover', () => bg.setTint(0xffffff));
        bg.on('pointerout', () => bg.setTint(baseColor));
      } else {
        bg.on('pointerover', () => bg.setStrokeStyle(2, 0xeac34f));
        bg.on('pointerout', () => bg.setStrokeStyle(2, 0x000000));
      }
      bg.on('pointerup', onClick);
    } else {
      bg.setAlpha(0.55);
    }
    return [bg, text];
  }

  close() {
    EventBus.emit('upgrade:closed', {});
    this.scene.stop();
  }
}
