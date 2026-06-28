// CreditsScene.js
//
// Credits overlay (Sprint 13), opened from the title screen's "Credits" link.
// Attributions are sourced from CREDITS.md — the asset packs (some under
// credit-required licenses) and audio are listed here as a release requirement.
// ESC or [Close] dismisses and emits 'credits:closed'.

import Phaser from 'phaser';
import { fitCameraToVirtual } from '../core/ViewportFit.js';
import EventBus from '../core/EventBus.js';
import {
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  FONT_FAMILY,
  UI_BACKDROP_COLOR,
  UI_BORDER_COLOR,
  UI_ACCENT_GOLD
} from '../core/Constants.js';

export default class CreditsScene extends Phaser.Scene {
  constructor() {
    super('CreditsScene');
  }

  init(data) {
    this.fromScene = (data && data.from) || 'menu';
  }

  create() {
    fitCameraToVirtual(this);
    const cx = VIRTUAL_WIDTH / 2;

    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, UI_BACKDROP_COLOR, 0.95)
      .setOrigin(0, 0)
      .setDepth(400)
      .setInteractive();

    this.add
      .text(cx, 44, 'SEEDKEEPER', {
        fontFamily: FONT_FAMILY,
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#8AB87E'
      })
      .setOrigin(0.5)
      .setDepth(401);
    this.add
      .rectangle(cx, 86, 760, 2, UI_BORDER_COLOR)
      .setDepth(401);

    // Two columns so everything fits on one screen without scrolling.
    const leftX = cx - 360;
    const rightX = cx + 20;

    let ly = 120;
    ly = this.section(leftX, ly, 'CREATED BY', [
      'Design, Development & Creative Direction',
      '  Jaxon Travis',
      '',
      'AI-Assisted Development',
      '  Claude (Anthropic) — claude.ai'
    ]);
    ly += 16;
    this.section(leftX, ly, 'ART', [
      'Sprout Lands (Premium)',
      '  Cup Nooble — cupnooble.itch.io',
      'Sprout Lands UI Pack',
      '  Cup Nooble — cupnooble.itch.io',
      'Mystic Woods',
      '  Game Endeavor — game-endeavor.itch.io',
      'Anokolisa Top-Down RPG Pack',
      '  Anokolisa — anokolisa.itch.io'
    ]);

    let ry = 120;
    ry = this.section(rightX, ry, 'AUDIO', [
      'SFX — Sprout Lands "Sprout Sorry" pack',
      '  Cup Nooble — cupnooble.itch.io',
      'Music',
      '  Original score — TODO (not yet sourced)'
    ]);
    ry += 16;
    ry = this.section(rightX, ry, 'BUILT WITH', [
      'Phaser 3 — phaser.io',
      'Vite — vitejs.dev'
    ]);
    ry += 16;
    this.section(rightX, ry, 'MADE IN', ['Carlsbad, California', 'June 2026']);

    this.makeButton(cx, VIRTUAL_HEIGHT - 56, 220, 46, '[ Close ]   Esc', () => this.close());

    this.input.keyboard.on('keydown-ESC', () => this.close());
    this.events.once('shutdown', () => this.input.keyboard.removeAllListeners());
  }

  // Draws a gold header + body block at (x, y); returns the next free y.
  section(x, y, title, lines) {
    this.add
      .text(x, y, title, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#D4A83F'
      })
      .setOrigin(0, 0)
      .setDepth(401);
    const body = this.add
      .text(x, y + 26, lines.join('\n'), {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: '#D1CCC6',
        lineSpacing: 5
      })
      .setOrigin(0, 0)
      .setDepth(401);
    return y + 26 + body.height + 6;
  }

  makeButton(cx, cy, w, h, label, onClick) {
    const rect = this.add
      .rectangle(cx, cy, w, h, 0x36322e)
      .setStrokeStyle(2, 0x000000)
      .setDepth(401)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(402);
    rect.on('pointerover', () => rect.setStrokeStyle(2, UI_ACCENT_GOLD));
    rect.on('pointerout', () => rect.setStrokeStyle(2, 0x000000));
    rect.on('pointerup', onClick);
    return rect;
  }

  close() {
    EventBus.emit('credits:closed', { from: this.fromScene });
    this.scene.stop();
  }
}
