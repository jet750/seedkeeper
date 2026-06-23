// SignpostScene.js
//
// The achievement-log overlay (Sprint 6), opened from the garden signpost.
// Full-screen dim panel mirroring UpgradeScene. Reads unlock state + per-
// achievement unlock day live from GameScene's AchievementSystem and renders
// all achievements grouped into four chapters. The hidden Chapter IV only
// appears once at least one of its achievements is unlocked. ESC or [Close]
// dismisses and emits 'signpost:closed' so GameScene un-freezes.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT, TIER_LABELS } from '../data/achievements.js';

const MARGIN = 40;
const COLS = 4;
const GAP = 16;
const CHIP_H = 58;
const ROW_GAP = 8;
const HEADER_H = 30;

// Scroll viewport — chapter content is clipped to this band and scrolls within
// it so the log never overflows the bottom of the screen (40+ achievements
// exceed a single fixed page).
const VIEWPORT_TOP = 100;
const VIEWPORT_BOTTOM = VIRTUAL_HEIGHT - 24;

export default class SignpostScene extends Phaser.Scene {
  constructor() {
    super('SignpostScene');
  }

  create() {
    const gameScene = this.scene.get('GameScene');
    const as = gameScene && gameScene.achievementSystem;
    this.unlocked = as ? as.unlockedIds : new Set();
    this.days = as ? as.achievementDays : {};

    // Dim, click-swallowing backdrop.
    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x000000, 0.88)
      .setOrigin(0, 0)
      .setDepth(100)
      .setInteractive();

    this.add
      .text(MARGIN, 28, 'ACHIEVEMENT LOG', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setDepth(101);

    this.add
      .text(MARGIN, 70, `${this.unlocked.size} / ${ACHIEVEMENT_COUNT} Unlocked`, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '18px',
        color: '#9B9389'
      })
      .setDepth(101);

    this.layout();
    this.setupScroll();

    this.makeButton(VIRTUAL_WIDTH - MARGIN - 110, 44, 220, 40, '[ Close ]   Esc', () =>
      this.close()
    );

    this.input.keyboard.on('keydown-ESC', () => this.close());
  }

  layout() {
    // All chapter content lives in one scrollable container so it can be
    // clipped and panned within the viewport band.
    this.content = this.add.container(0, 0).setDepth(101);
    this.scrollY = 0;

    const chipW = (VIRTUAL_WIDTH - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
    let y = 108;

    [1, 2, 3, 4].forEach((tier) => {
      const entries = ACHIEVEMENTS.filter((a) => a.tier === tier);
      const anyHiddenUnlocked = entries.some((a) => this.unlocked.has(a.id));

      // Chapter IV stays fully concealed until one of its secrets is found.
      if (tier === 4 && !anyHiddenUnlocked) return;

      const header = this.add.text(MARGIN, y, TIER_LABELS[tier], {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#D4A83F'
      });
      this.content.add(header);
      y += HEADER_H;

      entries.forEach((a, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = MARGIN + col * (chipW + GAP);
        const chipY = y + row * (CHIP_H + ROW_GAP);
        this.buildChip(a, x, chipY, chipW);
      });

      const rows = Math.ceil(entries.length / COLS);
      y += rows * (CHIP_H + ROW_GAP) + 14;
    });

    this.contentBottom = y;
  }

  setupScroll() {
    const viewportH = VIEWPORT_BOTTOM - VIEWPORT_TOP;

    // Clip chapter content to the viewport so scrolled rows never paint over
    // the title bar or run past the bottom edge.
    const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(0, VIEWPORT_TOP, VIRTUAL_WIDTH, viewportH);
    this.content.setMask(maskShape.createGeometryMask());

    if (this.contentBottom <= VIEWPORT_BOTTOM) return; // everything fits — no scroll needed

    // Scrollbar: faint track + accent thumb on the right gutter.
    const barX = VIRTUAL_WIDTH - 18;
    this.add
      .rectangle(barX, VIEWPORT_TOP, 6, viewportH, 0x000000, 0.35)
      .setOrigin(0, 0)
      .setDepth(103);
    const thumbH = Math.max(40, (viewportH * viewportH) / (this.contentBottom - VIEWPORT_TOP));
    this.scrollThumb = this.add
      .rectangle(barX, VIEWPORT_TOP, 6, thumbH, 0xedd49a, 0.7)
      .setOrigin(0, 0)
      .setDepth(104);
    this.thumbTravel = viewportH - thumbH;

    // Mouse wheel.
    this.input.on('wheel', (pointer, over, dx, dy) => this.applyScroll(this.scrollY - dy));

    // Click / touch drag.
    let dragging = false;
    let lastY = 0;
    this.input.on('pointerdown', (pointer) => {
      if (pointer.y >= VIEWPORT_TOP && pointer.y <= VIEWPORT_BOTTOM) {
        dragging = true;
        lastY = pointer.y;
      }
    });
    this.input.on('pointermove', (pointer) => {
      if (!dragging) return;
      this.applyScroll(this.scrollY + (pointer.y - lastY));
      lastY = pointer.y;
    });
    const stopDrag = () => {
      dragging = false;
    };
    this.input.on('pointerup', stopDrag);
    this.input.on('pointerupoutside', stopDrag);
  }

  applyScroll(targetY) {
    const minY = Math.min(0, VIEWPORT_BOTTOM - this.contentBottom);
    this.scrollY = Phaser.Math.Clamp(targetY, minY, 0);
    this.content.y = this.scrollY;
    if (this.scrollThumb && minY < 0) {
      this.scrollThumb.y = VIEWPORT_TOP + (this.scrollY / minY) * this.thumbTravel;
    }
  }

  buildChip(a, x, y, w) {
    const isUnlocked = this.unlocked.has(a.id);
    const concealed = !isUnlocked && a.hidden; // hidden + locked → everything is "???"

    const bg = this.add
      .rectangle(x, y, w, CHIP_H, isUnlocked ? 0x2d2926 : 0x201d1a)
      .setOrigin(0, 0)
      .setStrokeStyle(2, isUnlocked ? 0x4d4843 : 0x2f2b27)
      .setDepth(101);
    bg.setAlpha(isUnlocked ? 1 : 0.85);
    this.content.add(bg);

    const iconChar = concealed ? '❔' : a.icon;
    const icon = this.add
      .text(x + 26, y + CHIP_H / 2, iconChar, { fontSize: '28px' })
      .setOrigin(0.5)
      .setDepth(102);
    if (!isUnlocked) icon.setAlpha(0.4);
    this.content.add(icon);

    const nameText = concealed ? '???' : a.name;
    const name = this.add
      .text(x + 52, y + 12, nameText, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: isUnlocked ? '#F5EFE6' : '#7a746c'
      })
      .setDepth(102);
    this.content.add(name);

    let flavorText;
    if (isUnlocked) flavorText = `"${a.flavor}"`;
    else if (a.hidden) flavorText = '???';
    else flavorText = '???';

    const flavor = this.add
      .text(x + 52, y + 32, flavorText, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '11px',
        color: isUnlocked ? '#9B9389' : '#57514b',
        wordWrap: { width: w - 64 }
      })
      .setDepth(102);
    this.content.add(flavor);

    if (isUnlocked) {
      const day = this.days[a.id];
      if (day !== undefined) {
        const dayText = this.add
          .text(x + w - 10, y + 10, `Day ${day}`, {
            fontFamily: '"SproutLands", "Courier New", monospace',
            fontSize: '11px',
            color: '#8AB87E'
          })
          .setOrigin(1, 0)
          .setDepth(102);
        this.content.add(dayText);
      }
    }
  }

  makeButton(cx, cy, w, h, label, onClick) {
    const rect = this.add
      .rectangle(cx, cy, w, h, 0x36322e)
      .setStrokeStyle(2, 0x000000)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy, label, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(102);
    rect.on('pointerover', () => rect.setStrokeStyle(2, 0xeac34f));
    rect.on('pointerout', () => rect.setStrokeStyle(2, 0x000000));
    rect.on('pointerup', onClick);
    return rect;
  }

  close() {
    EventBus.emit('signpost:closed', {});
    this.scene.stop();
  }
}
