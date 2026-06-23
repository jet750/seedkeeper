// UpgradeScene.js
//
// The Seedkeeper Workshop — a full-screen overlay launched on top of GameScene
// (which keeps rendering frozen behind it). v2: shows all six plant STAT trees
// only (gear + capacity moved to the coin economy / marketplace). Spends plant
// resources and asks GameScene to apply effects + auto-save via purchaseUpgrade().
// Reads live state from GameScene (plantBank, upgradeLevels, gameData); never
// mutates it directly.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';
import entitiesData from '../data/entities.json';

// v3 (Sprint 6/3d): one panel per stat-tree plant, derived from the upgrades
// catalog (was a hardcoded 6 retired keys). NOTE: 18 panels overflow the current
// 2-column grid — a scroll/paging pass on the workshop UI is a flagged follow-up.
const PLANT_ORDER = Object.keys(entitiesData.upgrades);

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

    this._pending = null; // { plantType, track } awaiting confirm
    this.panelRefs = {};
    this.actionObjs = {}; // key `${plantType}_${track}` -> [gameobjects]
    this.summaryRefs = {};

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

    this.buildResourceSummary();

    PLANT_ORDER.forEach((pt, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      this.buildPanel(pt, GRID_X + col * COL_STRIDE, GRID_Y + row * ROW_STRIDE);
    });

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

    PLANT_ORDER.forEach((pt) => this.refreshPanel(pt));
    this.refreshSummary();

    this.input.keyboard.on('keydown-ESC', () => this.close());

    // Keep displays live if the bank changes (it does on each purchase).
    this._onBank = () => {
      this.refreshSummary();
      PLANT_ORDER.forEach((pt) => this.refreshPanel(pt));
    };
    EventBus.on('bank:updated', this._onBank);
    this.events.once('shutdown', () => EventBus.off('bank:updated', this._onBank));

    // Mobile: the BUY/Close buttons already take touch (they use pointerup), but
    // there's no Esc key — add a swipe-down gesture to dismiss, plus a hint. The
    // horizontal guard keeps it from firing on a sideways drag across buttons.
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
        .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 76, 'swipe down to close', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '14px',
          color: '#9B9389'
        })
        .setOrigin(0.5)
        .setDepth(101);
    }
  }

  // --- Header resource summary ---------------------------------------------

  buildResourceSummary() {
    PLANT_ORDER.forEach((pt, i) => {
      const x = 660 + i * 156;
      const color = hexToNum(this.gameData.plants[pt].color);
      this.add.circle(x, 56, 11, color).setDepth(101);
      this.summaryRefs[pt] = this.add
        .text(x + 18, 56, '0', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '20px',
          color: '#F5EFE6'
        })
        .setOrigin(0, 0.5)
        .setDepth(101);
    });
  }

  refreshSummary() {
    PLANT_ORDER.forEach((pt) => {
      this.summaryRefs[pt].setText(`${this.bank(pt)}`);
    });
  }

  // --- Panels ---------------------------------------------------------------

  buildPanel(pt, px, py) {
    const plant = this.gameData.plants[pt];

    this.add
      .rectangle(px, py, PANEL_W, PANEL_H, COLOR_PANEL)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x4d4843)
      .setDepth(100);

    this.add.circle(px + 34, py + 34, 16, hexToNum(plant.color)).setDepth(101);

    this.add
      .text(px + 62, py + 22, plant.name, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setDepth(101);

    const resourceText = this.add
      .text(px + PANEL_W - 20, py + 24, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '20px',
        color: '#EDD49A'
      })
      .setOrigin(1, 0)
      .setDepth(101);

    const statLabel = this.add
      .text(px + 24, py + 78, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '15px',
        color: '#D1CCC6',
        lineSpacing: 4
      })
      .setDepth(101);

    this.panelRefs[pt] = { px, py, resourceText, statLabel };
  }

  refreshPanel(pt) {
    const ref = this.panelRefs[pt];
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
    if (s.statKey === 'timerBonus') return `+${b / 1000}s per day`;
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
  }

  // --- Purchase flow --------------------------------------------------------

  onBuyClicked(pt, track) {
    this._pending = { plantType: pt, track };
    // Cancel any other pending confirm so only one is active at a time.
    PLANT_ORDER.forEach((p) => this.rebuildAction(p, 'stat'));
  }

  onConfirm(pt, track) {
    this._pending = null;
    this.gameScene.purchaseUpgrade(pt, track);
    // purchase emits bank:updated → _onBank refreshes everything; refresh now too
    // so the change is instant even if the event order ever shifts.
    this.refreshSummary();
    PLANT_ORDER.forEach((p) => this.refreshPanel(p));
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
