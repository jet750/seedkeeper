// SeedDictScene.js
//
// The Seed Dictionary (Sprint 11) — a full-screen overlay opened from the
// "Field Notes" book in the garden. Shows the six plant types in a 2x3 grid;
// each entry unlocks the first time that seed is collected (tracked in
// GameScene.discoveredPlants). Undiscovered entries show a silhouette + "???".
// ESC or [Close] dismisses and emits 'dictionary:closed' so GameScene unfreezes.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';
import entitiesData from '../data/entities.json';

const PLANT_ORDER = [
  'red_mushroom',
  'blue_flower',
  'golden_wheat',
  'green_herb',
  'glowshroom',
  'sunflower'
];

// What each plant's resource feeds in the workshop (player-facing summary).
// v2: plants fund STAT trees only — gear + capacity are bought with coins.
const PLANT_USE = {
  red_mushroom: 'Attack power',
  blue_flower: 'Max HP',
  golden_wheat: 'Move speed',
  green_herb: 'Day timer',
  glowshroom: 'Crit chance',
  sunflower: 'Harvest range'
};

function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

function humanize(s) {
  return (s || '').replace(/_/g, ' ');
}

export default class SeedDictScene extends Phaser.Scene {
  constructor() {
    super('SeedDictScene');
  }

  create() {
    const gameScene = this.scene.get('GameScene');
    this.discovered = new Set((gameScene && gameScene.discoveredPlants) || []);
    this.grown = (gameScene && gameScene.plantsGrownEver) || {};

    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x000000, 0.88)
      .setOrigin(0, 0)
      .setDepth(100)
      .setInteractive();

    this.add
      .text(48, 30, 'SEED DICTIONARY', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#8AB87E'
      })
      .setDepth(101);

    this.add
      .text(48, 72, `${this.discovered.size} / ${PLANT_ORDER.length} Discovered`, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '18px',
        color: '#9B9389'
      })
      .setDepth(101);

    this.layout();

    this.makeButton(VIRTUAL_WIDTH - 158, 46, 220, 40, '[ Close ]   Esc', () => this.close());
    this.input.keyboard.on('keydown-ESC', () => this.close());
  }

  layout() {
    const cols = 2;
    const marginX = 48;
    const gap = 24;
    const top = 120;
    const cardW = (VIRTUAL_WIDTH - marginX * 2 - gap * (cols - 1)) / cols;
    const cardH = 210;
    const rowGap = 18;

    PLANT_ORDER.forEach((pt, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = marginX + col * (cardW + gap);
      const y = top + row * (cardH + rowGap);
      this.buildCard(pt, x, y, cardW, cardH);
    });
  }

  buildCard(pt, x, y, w, h) {
    const plant = entitiesData.plants[pt];
    const known = this.discovered.has(pt);

    this.add
      .rectangle(x, y, w, h, known ? 0x2d2926 : 0x201d1a)
      .setOrigin(0, 0)
      .setStrokeStyle(2, known ? 0x4d4843 : 0x2f2b27)
      .setDepth(101);

    const iconX = x + 46;
    const iconY = y + 50;
    if (known) {
      this.add.circle(iconX, iconY, 24, hexToNum(plant.color)).setDepth(102);
    } else {
      this.add.circle(iconX, iconY, 24, 0x3a3531).setStrokeStyle(2, 0x4d4843).setDepth(102);
      this.add
        .text(iconX, iconY, '?', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#57514b'
        })
        .setOrigin(0.5)
        .setDepth(103);
    }

    this.add
      .text(x + 86, y + 30, known ? plant.name : '???', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: known ? '#F5EFE6' : '#7a746c'
      })
      .setDepth(102);

    if (!known) {
      this.add
        .text(x + 86, y + 64, 'Collect this seed to\nunlock its entry.', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '15px',
          color: '#57514b',
          lineSpacing: 6
        })
        .setDepth(102);
      return;
    }

    const lines = [
      `Grows in:   ${humanize(plant.foundNear)}`,
      `Growth:     ${plant.growthDays} ${plant.growthDays === 1 ? 'day' : 'days'}`,
      `Used for:   ${PLANT_USE[pt] || '—'}`,
      `Grown ever: ${this.grown[pt] || 0}`
    ];
    this.add
      .text(x + 24, y + 92, lines.join('\n'), {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '16px',
        color: '#D1CCC6',
        lineSpacing: 8
      })
      .setDepth(102);
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
    EventBus.emit('dictionary:closed', {});
    this.scene.stop();
  }
}
