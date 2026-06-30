// SeedDictScene.js
//
// The Seed Dictionary / "Field Notes" (Sprint 11) — a full-screen overlay opened from the
// Field Notes book in the garden. Shows every plant type as a card; each entry unlocks the
// first time that seed is collected (tracked in GameScene.discoveredPlants). Undiscovered
// entries show a silhouette + "???". ESC / [Close] / swipe-down dismisses and emits
// 'dictionary:closed' so GameScene unfreezes.
//
// Sprint mobile-polish-menus (Phase 4): ported onto the shared PaginatedMenu controller so it
// reads cleanly on a phone in both orientations (the old fitCameraToVirtual 3x4 grid rendered
// tiny under the mobile RESIZE scale mode). The grid is now responsive (1 column portrait, 2-3
// landscape/desktop) and PAGINATED via the shared dots/swipe/◀▶ footer.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import PaginatedMenu from '../ui/PaginatedMenu.js';
import entitiesData from '../data/entities.json';

const FONT = '"SproutLands", "Courier New", monospace';
const PLANT_ORDER = Object.keys(entitiesData.plants);

// What each plant's resource feeds in the workshop (player-facing summary), derived from the
// plant's stat tree. Sell-only crops have no upgrade — they fund coins.
const STAT_LABEL = {
  attackMult: 'Attack power',
  damageReduction: 'Defense',
  hpMax: 'Max HP',
  speedMult: 'Move speed',
  critChance: 'Crit chance',
  harvestBonus: 'Harvest range',
  rangedDamage: 'Ranged damage',
  spellPower: 'Spell power',
  dashBonus: 'Dash',
  healthRegen: 'Health regen'
};
function plantUse(pt) {
  const up = entitiesData.upgrades[pt];
  if (up && up.stat) return STAT_LABEL[up.stat.statKey] || up.stat.name;
  return 'Sell for coins';
}
function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}
function humanize(s) {
  return (s || '').replace(/_/g, ' ');
}

const HEADER_H = 60;
const FOOTER_H = 78;
const CARD_H = 156;
const CARD_GAP = 14;

export default class SeedDictScene extends Phaser.Scene {
  constructor() {
    super('SeedDictScene');
  }

  create() {
    const gameScene = this.scene.get('GameScene');
    this.discovered = new Set((gameScene && gameScene.discoveredPlants) || []);
    this.grown = (gameScene && gameScene.plantsGrownEver) || {};

    this.menu = new PaginatedMenu(this, {
      margin: 20,
      headerH: HEADER_H,
      footerH: FOOTER_H,
      depth: 100,
      backdropColor: 0x141210,
      backdropAlpha: 0.96,
      closeW: 220,
      closeColor: 0x36322e,
      closeLabelMobile: 'Close',
      closeLabelDesktop: 'Close   ·   Esc',
      arrowColor: 0x2d2926,
      arrowDisabledColor: 0x201d1a,
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
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
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

  // --- Responsive grid → pages -----------------------------------------------

  gridCols(frame) {
    return frame.portrait ? 1 : frame.W < 900 ? 2 : 3;
  }

  buildPages(frame) {
    const cols = this.gridCols(frame);
    const rows = Math.max(1, Math.floor((frame.bandH + CARD_GAP) / (CARD_H + CARD_GAP)));
    const per = Math.max(1, cols * rows);
    const pages = [];
    for (let i = 0; i < PLANT_ORDER.length; i += per) pages.push(PLANT_ORDER.slice(i, i + per));
    return pages.length ? pages : [[]];
  }

  renderHeader(frame) {
    const { left, right, headerTop } = frame;
    this.track(
      this.add
        .text(left, headerTop, 'FIELD NOTES', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#8AB87E' })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(left, headerTop + 36, 'Seed Dictionary', { fontFamily: FONT, fontSize: '14px', color: '#9B9389' })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(right, headerTop + 6, `${this.discovered.size} / ${PLANT_ORDER.length} Discovered`, {
          fontFamily: FONT,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(1, 0)
        .setDepth(101)
    );
  }

  renderBody(frame, items) {
    const { left, innerW, contentTop } = frame;
    const cols = this.gridCols(frame);
    const cardW = (innerW - CARD_GAP * (cols - 1)) / cols;
    items.forEach((pt, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = left + col * (cardW + CARD_GAP);
      const y = contentTop + row * (CARD_H + CARD_GAP);
      this.buildCard(pt, x, y, cardW, CARD_H);
    });
  }

  buildCard(pt, x, y, w, h) {
    const plant = entitiesData.plants[pt];
    const known = this.discovered.has(pt);

    this.track(
      this.add
        .rectangle(x, y, w, h, known ? 0x2d2926 : 0x201d1a)
        .setOrigin(0, 0)
        .setStrokeStyle(2, known ? 0x4d4843 : 0x2f2b27)
        .setDepth(101)
    );

    const iconX = x + 42;
    const iconY = y + 46;
    if (known) {
      this.track(this.add.circle(iconX, iconY, 22, hexToNum(plant.color)).setDepth(102));
    } else {
      this.track(this.add.circle(iconX, iconY, 22, 0x3a3531).setStrokeStyle(2, 0x4d4843).setDepth(102));
      this.track(
        this.add
          .text(iconX, iconY, '?', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#57514b' })
          .setOrigin(0.5)
          .setDepth(103)
      );
    }

    this.track(
      this.add
        .text(x + 78, y + 28, known ? plant.name : '???', {
          fontFamily: FONT,
          fontSize: '21px',
          fontStyle: 'bold',
          color: known ? '#F5EFE6' : '#7a746c'
        })
        .setDepth(102)
    );

    if (!known) {
      this.track(
        this.add
          .text(x + 78, y + 60, 'Collect this seed to\nunlock its entry.', {
            fontFamily: FONT,
            fontSize: '14px',
            color: '#57514b',
            lineSpacing: 6
          })
          .setDepth(102)
      );
      return;
    }

    const lines = [
      `Grows in:   ${humanize(plant.foundNear)}`,
      `Growth:     ${plant.growthDays} ${plant.growthDays === 1 ? 'day' : 'days'}`,
      `Used for:   ${plantUse(pt)}`,
      `Grown ever: ${this.grown[pt] || 0}`
    ];
    this.track(
      this.add
        .text(x + 22, y + 82, lines.join('\n'), {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#D1CCC6',
          lineSpacing: 6,
          wordWrap: { width: w - 40 }
        })
        .setDepth(102)
    );
  }

  makeButton(cx, cy, w, h, label, baseColor, enabled, onClick, textColor) {
    const rect = this.add
      .rectangle(cx, cy, w, h, baseColor)
      .setStrokeStyle(2, 0x000000)
      .setDepth(101);
    const text = this.add
      .text(cx, cy, label, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: textColor || '#F5EFE6' })
      .setOrigin(0.5)
      .setDepth(102);
    if (enabled) {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => rect.setStrokeStyle(2, 0xeac34f));
      rect.on('pointerout', () => rect.setStrokeStyle(2, 0x000000));
      rect.on('pointerup', onClick);
    } else {
      rect.setAlpha(0.6);
    }
    return [rect, text];
  }

  close() {
    EventBus.emit('dictionary:closed', {});
    this.scene.stop();
  }
}
