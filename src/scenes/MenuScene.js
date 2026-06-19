// MenuScene.js
//
// Title screen with three save slots backed by real localStorage data
// (Sprint 4). Empty slots read "— New Game —"; saved slots show day + playtime.
// Clicking a slot loads its save (or a fresh default) and launches GameScene
// with { slotIndex, save }.

import Phaser from 'phaser';
import GameState from '../core/GameState.js';
import SaveSystem from '../core/SaveSystem.js';
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

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    // If we arrived here from a finished run, settle the state machine back to
    // MENU through a valid transition (GAME_OVER → MENU).
    if (GameState.is('GAME_OVER') || GameState.is('WIN')) {
      GameState.transition('MENU');
    }

    const cx = VIRTUAL_WIDTH / 2;

    this.cameras.main.setBackgroundColor('#0a1a0a');

    // Title
    this.add
      .text(cx, 170, 'SEEDKEEPER', {
        fontFamily: '"Courier New", monospace',
        fontSize: '108px',
        fontStyle: 'bold',
        color: '#8AB87E'
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 260, 'Tend the garden. Brave the forest. Beat the day.', {
        fontFamily: '"Courier New", monospace',
        fontSize: '22px',
        color: '#9B9389'
      })
      .setOrigin(0.5);

    // Three save-slot buttons, populated from real save metadata.
    const slots = SaveSystem.getSlotsMetadata();
    const startY = 400;
    const gap = 96;
    slots.forEach((slot, i) => {
      this.createSlotButton(cx, startY + i * gap, slot);
    });

    this.add
      .text(cx, VIRTUAL_HEIGHT - 44, 'Click a slot to begin · WASD move · Space attack · F interact', {
        fontFamily: '"Courier New", monospace',
        fontSize: '17px',
        color: '#4D4843'
      })
      .setOrigin(0.5);
  }

  createSlotButton(x, y, slot) {
    const width = 560;
    const height = 72;

    const bg = this.add
      .rectangle(x, y, width, height, 0x221e1b)
      .setStrokeStyle(2, 0x36322e)
      .setInteractive({ useHandCursor: true });

    const slotName = `Slot ${slot.slotIndex + 1}`;
    const detail = slot.isEmpty
      ? '— New Game —'
      : `Day ${slot.dayNumber}  •  ${this.formatTime(slot.totalPlaytime || 0)}`;

    const label = this.add
      .text(x, y, `${slotName}    ${detail}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '24px',
        color: slot.isEmpty ? '#9B9389' : '#D1CCC6'
      })
      .setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, 0xd4a83f);
      bg.setFillStyle(0x2d2926);
      label.setColor('#EDD49A');
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(2, 0x36322e);
      bg.setFillStyle(0x221e1b);
      label.setColor(slot.isEmpty ? '#9B9389' : '#D1CCC6');
    });
    bg.on('pointerup', () => this.startGame(slot.slotIndex));

    // Plant-progress dots for occupied slots (Sprint 7) — one per plant type,
    // filled in its colour once grown at least once, hollow grey otherwise.
    if (!slot.isEmpty && slot.plantsGrownEver) {
      const dotGap = 22;
      const rowW = (PLANT_ORDER.length - 1) * dotGap;
      const startX = x - rowW / 2;
      const dotY = y + height / 2 + 14;
      PLANT_ORDER.forEach((pt, i) => {
        const grown = (slot.plantsGrownEver[pt] || 0) >= 1;
        const color = grown
          ? parseInt(entitiesData.plants[pt].color.replace('#', ''), 16)
          : 0x3a3531;
        this.add
          .circle(startX + i * dotGap, dotY, 6, color)
          .setStrokeStyle(1, 0x57514b);
      });
    }
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  startGame(slotIndex) {
    const save = SaveSystem.load(slotIndex);
    if (GameState.transition('PLAYING')) {
      this.scene.start('GameScene', { slotIndex, save });
    }
  }
}
