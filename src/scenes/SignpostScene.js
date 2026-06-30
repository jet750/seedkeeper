// SignpostScene.js
//
// The achievement-log overlay (Sprint 6), opened from the garden signpost. Reads unlock state
// + per-achievement unlock day live from GameScene's AchievementSystem and renders all
// achievements grouped into four chapters. The hidden Chapter IV only appears once at least
// one of its achievements is unlocked. ESC / [Close] / swipe-down dismisses and emits
// 'signpost:closed' so GameScene un-freezes.
//
// Sprint mobile-polish-menus (Phase 4): ported onto the shared PaginatedMenu controller — the
// old fitCameraToVirtual + hand-rolled mask/scrollbar rendered tiny under the mobile RESIZE
// scale mode. Chapters are PRESERVED as labeled pages (each page carries its chapter title);
// the bespoke scroll is replaced by the shared dots/swipe/◀▶ pagination, and the chip grid is
// responsive (1 column portrait, 2-4 landscape/desktop).

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import PaginatedMenu from '../ui/PaginatedMenu.js';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT, TIER_LABELS } from '../data/achievements.js';

const FONT = '"SproutLands", "Courier New", monospace';
const HEADER_H = 60;
const FOOTER_H = 78;
const CHIP_H = 66;
const CHIP_GAP = 10;
const LABEL_H = 36; // chapter-title band at the top of each page

export default class SignpostScene extends Phaser.Scene {
  constructor() {
    super('SignpostScene');
  }

  create() {
    const gameScene = this.scene.get('GameScene');
    const as = gameScene && gameScene.achievementSystem;
    this.unlocked = as ? as.unlockedIds : new Set();
    this.days = as ? as.achievementDays : {};

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
      swipeEnabled: () => true,
      onClose: () => this.close(),
      getPages: (frame) => this.buildPages(frame),
      renderHeader: (frame) => this.renderHeader(frame),
      renderBody: (frame, page) => this.renderBody(frame, page),
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

  // --- Chapters → responsive grid → labeled pages ----------------------------

  gridCols(frame) {
    return frame.portrait ? 1 : frame.W < 760 ? 2 : frame.W < 1200 ? 3 : 4;
  }

  buildPages(frame) {
    const cols = this.gridCols(frame);
    const rows = Math.max(1, Math.floor((frame.bandH - LABEL_H + CHIP_GAP) / (CHIP_H + CHIP_GAP)));
    const per = Math.max(1, cols * rows);
    const pages = [];
    [1, 2, 3, 4].forEach((tier) => {
      const entries = ACHIEVEMENTS.filter((a) => a.tier === tier);
      // Chapter IV stays fully concealed until one of its secrets is found.
      if (tier === 4 && !entries.some((a) => this.unlocked.has(a.id))) return;
      const label = TIER_LABELS[tier];
      for (let i = 0; i < entries.length; i += per) {
        pages.push({ label, entries: entries.slice(i, i + per) });
      }
    });
    return pages.length ? pages : [{ label: '', entries: [] }];
  }

  renderHeader(frame) {
    const { left, right, headerTop } = frame;
    this.track(
      this.add
        .text(left, headerTop, 'ACHIEVEMENT LOG', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#EDD49A' })
        .setOrigin(0, 0)
        .setDepth(101)
    );
    this.track(
      this.add
        .text(right, headerTop + 6, `${this.unlocked.size} / ${ACHIEVEMENT_COUNT} Unlocked`, {
          fontFamily: FONT,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#9B9389'
        })
        .setOrigin(1, 0)
        .setDepth(101)
    );
  }

  renderBody(frame, page) {
    const { left, innerW, contentTop } = frame;
    this.track(
      this.add
        .text(left, contentTop, page.label, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#D4A83F' })
        .setDepth(101)
    );
    const cols = this.gridCols(frame);
    const chipW = (innerW - CHIP_GAP * (cols - 1)) / cols;
    const gridTop = contentTop + LABEL_H;
    page.entries.forEach((a, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = left + col * (chipW + CHIP_GAP);
      const y = gridTop + row * (CHIP_H + CHIP_GAP);
      this.buildChip(a, x, y, chipW, CHIP_H);
    });
  }

  buildChip(a, x, y, w, h) {
    const isUnlocked = this.unlocked.has(a.id);
    const concealed = !isUnlocked && a.hidden; // hidden + locked → everything is "???"

    this.track(
      this.add
        .rectangle(x, y, w, h, isUnlocked ? 0x2d2926 : 0x201d1a)
        .setOrigin(0, 0)
        .setStrokeStyle(2, isUnlocked ? 0x4d4843 : 0x2f2b27)
        .setDepth(101)
        .setAlpha(isUnlocked ? 1 : 0.85)
    );

    const icon = this.add
      .text(x + 26, y + h / 2, concealed ? '❔' : a.icon, { fontSize: '26px' })
      .setOrigin(0.5)
      .setDepth(102);
    if (!isUnlocked) icon.setAlpha(0.4);
    this.track(icon);

    this.track(
      this.add
        .text(x + 52, y + 12, concealed ? '???' : a.name, {
          fontFamily: FONT,
          fontSize: '15px',
          fontStyle: 'bold',
          color: isUnlocked ? '#F5EFE6' : '#7a746c'
        })
        .setDepth(102)
    );

    this.track(
      this.add
        .text(x + 52, y + 34, isUnlocked ? `"${a.flavor}"` : '???', {
          fontFamily: FONT,
          fontSize: '11px',
          color: isUnlocked ? '#9B9389' : '#57514b',
          wordWrap: { width: w - 64 }
        })
        .setDepth(102)
    );

    if (isUnlocked) {
      const day = this.days[a.id];
      if (day !== undefined) {
        this.track(
          this.add
            .text(x + w - 10, y + 10, `Day ${day}`, { fontFamily: FONT, fontSize: '11px', color: '#8AB87E' })
            .setOrigin(1, 0)
            .setDepth(102)
        );
      }
    }
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
    EventBus.emit('signpost:closed', {});
    this.scene.stop();
  }
}
