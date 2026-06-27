// MenuScene.js
//
// Title screen (Sprint 4; overhauled in Sprint 12). An animated garden parallax
// sits behind a bouncing logo, a fading subtitle, and a floating seed. The three
// save slots are proper cards: occupied slots show day, playtime and a row of
// plant-progress dots with [Continue] + a hold-to-confirm [Delete]; empty slots
// show a clean New Game card. A gear opens the shared Settings overlay and a
// Credits link (Sprint 13) opens the credits. Clicking a card launches GameScene.

import Phaser from 'phaser';
import { fitCameraToVirtual } from '../core/ViewportFit.js';
import GameState from '../core/GameState.js';
import SaveSystem from '../core/SaveSystem.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, FONT_FAMILY, UI_ACCENT_GOLD } from '../core/Constants.js';
import entitiesData from '../data/entities.json';

// v3 (Sprint 6/3d): derive the plant set from the catalog so the menu always
// matches the current plants (was a hardcoded 6 retired keys).
const PLANT_ORDER = Object.keys(entitiesData.plants);

const CARD_W = 640;
const CARD_H = 124;
const DELETE_HOLD_MS = 1500; // hold-to-confirm window — guards against accidental loss

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    fitCameraToVirtual(this);

    // If we arrived here from a finished run, settle the state machine back to
    // MENU through a valid transition (GAME_OVER / WIN → MENU).
    if (GameState.is('GAME_OVER') || GameState.is('WIN')) {
      GameState.transition('MENU');
    }

    const cx = VIRTUAL_WIDTH / 2;

    this.cameras.main.setBackgroundColor('#0a1a0a');
    this.cameras.main.fadeIn(500, 0, 0, 0);

    this.buildBackground();
    this.buildTitle(cx);

    // Three save-slot cards, populated from real save metadata.
    const slots = SaveSystem.getSlotsMetadata();
    const startY = 392;
    const gap = CARD_H + 24;
    slots.forEach((slot, i) => this.buildSlotCard(cx, startY + i * gap, slot));

    this.buildFooter(cx);
  }

  // --- Background -----------------------------------------------------------

  buildBackground() {
    if (this.textures.exists('tileset_garden')) {
      this.bgLayer = this.add
        .tileSprite(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 'tileset_garden')
        .setOrigin(0, 0)
        .setAlpha(0.4);
      this.tweens.add({
        targets: this.bgLayer,
        tilePositionX: 240,
        duration: 24000,
        repeat: -1,
        ease: 'Linear'
      });
    }
    // Dark wash so the title/cards stay legible over the busy parallax.
    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x0a1a0a, 0.55)
      .setOrigin(0, 0);
  }

  // --- Title treatment ------------------------------------------------------

  buildTitle(cx) {
    // Title drops in from above with a bounce.
    const title = this.add
      .text(cx, -120, 'SEEDKEEPER', {
        fontFamily: FONT_FAMILY,
        fontSize: '108px',
        fontStyle: 'bold',
        color: '#8AB87E',
        stroke: '#1a2a12',
        strokeThickness: 8,
        shadow: { offsetX: 3, offsetY: 4, color: '#000000', blur: 10, fill: true }
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: title, y: 175, duration: 850, ease: 'Bounce.easeOut', delay: 150 });

    // Subtitle fades in once the title has landed.
    const subtitle = this.add
      .text(cx, 262, 'Tend the garden. Brave the forest. Restore the world.', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: '#b8d4a0'
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: subtitle, alpha: 1, duration: 600, delay: 950 });

    // A seed floats gently above the logo.
    const seed = this.add.circle(cx, 118, 8, 0x88cc66).setStrokeStyle(2, 0x4f7344);
    this.tweens.add({
      targets: seed,
      y: 106,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // --- Save-slot cards ------------------------------------------------------

  buildSlotCard(x, y, slot) {
    const bg = this.add
      .rectangle(x, y, CARD_W, CARD_H, 0x221e1b, 0.96)
      .setStrokeStyle(2, 0x36322e)
      .setInteractive({ useHandCursor: true });

    const leftX = x - CARD_W / 2 + 28;
    const topY = y - CARD_H / 2 + 22;

    if (slot.isEmpty) {
      this.add
        .text(x, y - 18, 'NEW GAME', {
          fontFamily: FONT_FAMILY,
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#D1CCC6'
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 22, `Slot ${slot.slotIndex + 1}  ·  [ START ]`, {
          fontFamily: FONT_FAMILY,
          fontSize: '18px',
          color: '#9B9389'
        })
        .setOrigin(0.5);

      this.applyCardHover(bg);
      bg.on('pointerup', () => this.startGame(slot.slotIndex));
      return;
    }

    // Occupied slot — title + meta.
    this.add
      .text(leftX, topY, `SLOT ${slot.slotIndex + 1}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setOrigin(0, 0);
    this.add
      .text(leftX, topY + 32, `Day ${slot.dayNumber}   •   ${this.formatTime(slot.totalPlaytime || 0)} played`, {
        fontFamily: FONT_FAMILY,
        fontSize: '17px',
        color: '#D1CCC6'
      })
      .setOrigin(0, 0);

    // Plant-progress dots — filled in colour once grown at least once. The gap
    // auto-fits a fixed span so the expanded catalog (21 plants) never overflows
    // into the continue button (Sprint 6/3d).
    const dotSpan = 320;
    const dotGap = Math.min(26, dotSpan / PLANT_ORDER.length);
    const dotR = dotGap < 20 ? 5 : 7;
    const dotY = topY + 78;
    PLANT_ORDER.forEach((pt, i) => {
      const grown = slot.plantsGrownEver && (slot.plantsGrownEver[pt] || 0) >= 1;
      const color = grown ? parseInt(entitiesData.plants[pt].color.replace('#', ''), 16) : 0x3a3531;
      this.add.circle(leftX + 8 + i * dotGap, dotY, dotR, color).setStrokeStyle(1, 0x57514b);
    });

    // Continue button (right) — clicking the card body also continues.
    const contX = x + CARD_W / 2 - 110;
    const cont = this.add
      .rectangle(contX, y - 22, 150, 42, 0x3a7d44)
      .setStrokeStyle(2, 0x000000)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(contX, y - 22, 'CONTINUE', {
        fontFamily: FONT_FAMILY,
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5);
    cont.on('pointerover', () => cont.setStrokeStyle(2, UI_ACCENT_GOLD));
    cont.on('pointerout', () => cont.setStrokeStyle(2, 0x000000));
    cont.on('pointerup', () => this.startGame(slot.slotIndex));

    this.buildDeleteButton(contX, y + 26, slot.slotIndex);

    this.applyCardHover(bg);
    bg.on('pointerup', () => this.startGame(slot.slotIndex));
  }

  // Hold-to-confirm delete: the button fills red over 1.5s; releasing early
  // cancels. Prevents the cheap-game "one tap wipes your save" mistake.
  buildDeleteButton(cx, cy, slotIndex) {
    const w = 150;
    const h = 36;
    const base = this.add
      .rectangle(cx, cy, w, h, 0x2d2926)
      .setStrokeStyle(2, 0x6a2a2a)
      .setInteractive({ useHandCursor: true });
    // Fill grows from the left edge as the player holds.
    const fill = this.add
      .rectangle(cx - w / 2, cy, 0, h, 0x8a3a3a)
      .setOrigin(0, 0.5);
    const label = this.add
      .text(cx, cy, 'DELETE (hold)', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#e0a0a0'
      })
      .setOrigin(0.5);

    let holdTween = null;
    const cancel = () => {
      if (holdTween) {
        holdTween.stop();
        holdTween = null;
      }
      fill.width = 0;
      label.setText('DELETE (hold)');
    };
    base.on('pointerdown', () => {
      label.setText('HOLD…');
      holdTween = this.tweens.add({
        targets: fill,
        width: w,
        duration: DELETE_HOLD_MS,
        ease: 'Linear',
        onComplete: () => {
          SaveSystem.clear(slotIndex);
          this.scene.restart();
        }
      });
    });
    base.on('pointerup', cancel);
    base.on('pointerout', cancel);
  }

  applyCardHover(bg) {
    bg.on('pointerover', () => bg.setStrokeStyle(2, UI_ACCENT_GOLD));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x36322e));
  }

  // --- Footer (controls hint, settings, credits) ----------------------------

  buildFooter(cx) {
    this.add
      .text(cx, VIRTUAL_HEIGHT - 40, 'Click a slot to begin  ·  WASD move  ·  Space attack  ·  F interact  ·  Esc pause', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#6d675f'
      })
      .setOrigin(0.5);

    // Settings gear (bottom-right).
    const gear = this.add
      .text(VIRTUAL_WIDTH - 28, VIRTUAL_HEIGHT - 36, '⚙ Settings', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#9B9389'
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    gear.on('pointerover', () => gear.setColor('#EDD49A'));
    gear.on('pointerout', () => gear.setColor('#9B9389'));
    gear.on('pointerup', () => this.openSettings());

    // Credits link (bottom-left, Sprint 13).
    const credits = this.add
      .text(28, VIRTUAL_HEIGHT - 36, 'Credits', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#9B9389'
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    credits.on('pointerover', () => credits.setColor('#EDD49A'));
    credits.on('pointerout', () => credits.setColor('#9B9389'));
    credits.on('pointerup', () => {
      // CreditsScene is registered in Sprint 13; guard so the link is inert
      // until then rather than throwing.
      if (this.scene.get('CreditsScene')) {
        this.scene.launch('CreditsScene', { from: 'menu' });
        this.scene.bringToTop('CreditsScene');
      }
    });
  }

  openSettings() {
    this.scene.launch('SettingsScene', { from: 'menu' });
    this.scene.bringToTop('SettingsScene');
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
