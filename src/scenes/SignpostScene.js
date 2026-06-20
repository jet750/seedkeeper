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

    this.makeButton(VIRTUAL_WIDTH - MARGIN - 110, 44, 220, 40, '[ Close ]   Esc', () =>
      this.close()
    );

    this.input.keyboard.on('keydown-ESC', () => this.close());
  }

  layout() {
    const chipW = (VIRTUAL_WIDTH - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
    let y = 108;

    [1, 2, 3, 4].forEach((tier) => {
      const entries = ACHIEVEMENTS.filter((a) => a.tier === tier);
      const anyHiddenUnlocked = entries.some((a) => this.unlocked.has(a.id));

      // Chapter IV stays fully concealed until one of its secrets is found.
      if (tier === 4 && !anyHiddenUnlocked) return;

      this.add
        .text(MARGIN, y, TIER_LABELS[tier], {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#D4A83F'
        })
        .setDepth(101);
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

    const iconChar = concealed ? '❔' : a.icon;
    const icon = this.add
      .text(x + 26, y + CHIP_H / 2, iconChar, { fontSize: '28px' })
      .setOrigin(0.5)
      .setDepth(102);
    if (!isUnlocked) icon.setAlpha(0.4);

    const nameText = concealed ? '???' : a.name;
    this.add
      .text(x + 52, y + 12, nameText, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: isUnlocked ? '#F5EFE6' : '#7a746c'
      })
      .setDepth(102);

    let flavorText;
    if (isUnlocked) flavorText = `"${a.flavor}"`;
    else if (a.hidden) flavorText = '???';
    else flavorText = '???';

    this.add
      .text(x + 52, y + 32, flavorText, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '11px',
        color: isUnlocked ? '#9B9389' : '#57514b',
        wordWrap: { width: w - 64 }
      })
      .setDepth(102);

    if (isUnlocked) {
      const day = this.days[a.id];
      if (day !== undefined) {
        this.add
          .text(x + w - 10, y + 10, `Day ${day}`, {
            fontFamily: '"SproutLands", "Courier New", monospace',
            fontSize: '11px',
            color: '#8AB87E'
          })
          .setOrigin(1, 0)
          .setDepth(102);
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
