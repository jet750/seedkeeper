// MenuScene.js
//
// Title screen with three save-slot buttons. Real save data arrives in Sprint 4
// — for now every slot reads "— Empty Slot —" and any click starts a new game.

import Phaser from 'phaser';
import GameState from '../core/GameState.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';

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
      .text(cx, 180, 'SEEDKEEPER', {
        fontFamily: '"Courier New", monospace',
        fontSize: '108px',
        fontStyle: 'bold',
        color: '#8AB87E'
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 270, 'Tend the garden. Brave the forest. Beat the day.', {
        fontFamily: '"Courier New", monospace',
        fontSize: '22px',
        color: '#9B9389'
      })
      .setOrigin(0.5);

    // Three save-slot buttons
    const startY = 420;
    const gap = 96;
    for (let i = 0; i < 3; i++) {
      this.createSlotButton(cx, startY + i * gap, i + 1);
    }

    this.add
      .text(cx, VIRTUAL_HEIGHT - 48, 'Click a slot to begin · WASD / arrows to move', {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: '#4D4843'
      })
      .setOrigin(0.5);
  }

  createSlotButton(x, y, slotNumber) {
    const width = 520;
    const height = 72;

    const bg = this.add
      .rectangle(x, y, width, height, 0x221e1b)
      .setStrokeStyle(2, 0x36322e)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(x, y, `Slot ${slotNumber}    — Empty Slot —`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '26px',
        color: '#D1CCC6'
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
      label.setColor('#D1CCC6');
    });
    bg.on('pointerup', () => this.startGame());
  }

  startGame() {
    if (GameState.transition('PLAYING')) {
      this.scene.start('GameScene');
    }
  }
}
