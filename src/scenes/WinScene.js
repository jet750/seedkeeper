// WinScene.js
//
// Victory overlay (Sprint 5; rebalanced in the death/win fix), launched over a
// paused GameScene by 'win:demo' (grew 10 of every plant) or 'win:full' (every
// upgrade maxed). Receives a stats payload from GameScene. The demo win is a
// mid-game milestone — [Continue Playing] just resumes, with NO New Game+. The
// full win is the true ending and the ONLY path to New Game+ ([New Game+]
// activates it and resumes the harder run). Returning to the menu goes through
// the GameState machine (PLAYING → WIN, then MenuScene settles WIN → MENU).

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import GameState from '../core/GameState.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';
import entitiesData from '../data/entities.json';
import { ACHIEVEMENT_COUNT } from '../data/achievements.js';

// Rarest → commonest, for the run-summary "Rarest Find" line.
const RARITY_ORDER = [
  'glowshroom',
  'green_herb',
  'blue_flower',
  'golden_wheat',
  'red_mushroom',
  'sunflower'
];

const PLANT_ORDER = [
  'red_mushroom',
  'blue_flower',
  'golden_wheat',
  'green_herb',
  'glowshroom',
  'sunflower'
];

const COLOR_GOLD = '#EDD49A';
const COLOR_TEXT = '#F5EFE6';
const COLOR_MUTED = '#9B9389';
const ICON_STEP_MS = 320; // stagger between icons animating in

function hexToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export default class WinScene extends Phaser.Scene {
  constructor() {
    super('WinScene');
  }

  init(data) {
    this.winType = data && data.winType ? data.winType : 'demo';
    this.stats = data || {};
  }

  create() {
    const cx = VIRTUAL_WIDTH / 2;
    const isFull = this.winType === 'full';

    // Click-swallowing dim backdrop.
    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x000000, isFull ? 0.78 : 0.85)
      .setOrigin(0, 0)
      .setDepth(200)
      .setInteractive();

    if (isFull) this.playBloom();

    // --- Headline ---
    const headline = isFull
      ? 'You have become the Seedkeeper.'
      : 'The forest is beginning to remember.';
    this.add
      .text(cx, 120, headline, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: isFull ? '46px' : '40px',
        fontStyle: 'bold',
        color: COLOR_GOLD,
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(202);

    // --- Icon sequence ---
    if (isFull) this.buildUpgradeIcons(cx, 220);
    else this.buildPlantIcons(cx, 230);

    // --- Stats summary ---
    this.buildStats(cx, isFull ? 340 : 360);

    // --- Buttons ---
    // Demo win is a mid-game milestone: it only says "keep going" (no New Game+).
    // The full win is the true completion and the ONLY path to New Game+.
    const btnY = VIRTUAL_HEIGHT - 110;
    if (isFull) {
      this.makeButton(cx - 170, btnY, 300, 56, 'New Game+', 0x3a7d44, () =>
        this.startNewGamePlus()
      );
      this.makeButton(cx + 170, btnY, 300, 56, 'Return to Menu', 0x36322e, () => this.toMenu());
    } else {
      this.makeButton(cx - 170, btnY, 300, 56, 'Continue Playing', 0x3a7d44, () =>
        this.continuePlaying()
      );
      this.makeButton(cx + 170, btnY, 300, 56, 'Return to Menu', 0x36322e, () => this.toMenu());
    }
  }

  // Full-win celebratory screen flash that fades away.
  playBloom() {
    const flash = this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x8ab87e, 0.6)
      .setOrigin(0, 0)
      .setDepth(201);
    this.tweens.add({ targets: flash, alpha: 0, duration: 1400, onComplete: () => flash.destroy() });
  }

  // Demo win: six plant icons pop in one at a time with a soft chime.
  buildPlantIcons(cx, y) {
    const gap = 110;
    const startX = cx - (gap * (PLANT_ORDER.length - 1)) / 2;
    PLANT_ORDER.forEach((pt, i) => {
      const x = startX + i * gap;
      const color = hexToNum(entitiesData.plants[pt].color);
      const icon = this.add.circle(x, y, 26, color).setDepth(202).setAlpha(0).setScale(0.2);
      this.time.delayedCall(400 + i * ICON_STEP_MS, () => {
        this.chime();
        this.tweens.add({
          targets: icon,
          alpha: 1,
          scale: 1,
          duration: 280,
          ease: 'Back.easeOut'
        });
      });
    });
  }

  // Full win: twelve upgrade icons (stat + gear track per plant) glow in sequence.
  buildUpgradeIcons(cx, y) {
    const gap = 92;
    const startX = cx - (gap * (PLANT_ORDER.length - 1)) / 2;
    const rows = [
      { dy: 0, label: 'STAT' },
      { dy: 56, label: 'GEAR' }
    ];
    rows.forEach((row, r) => {
      PLANT_ORDER.forEach((pt, i) => {
        const x = startX + i * gap;
        const color = hexToNum(entitiesData.plants[pt].color);
        const icon = this.add
          .rectangle(x, y + row.dy, 34, 34, color)
          .setStrokeStyle(2, 0x000000)
          .setDepth(202)
          .setAlpha(0.18);
        const order = r * PLANT_ORDER.length + i;
        this.time.delayedCall(500 + order * 150, () => {
          this.chime();
          this.tweens.add({
            targets: icon,
            alpha: 1,
            scaleX: { from: 1.3, to: 1 },
            scaleY: { from: 1.3, to: 1 },
            duration: 260,
            ease: 'Back.easeOut'
          });
        });
      });
    });
  }

  // Run summary (Sprint 11) — a one-page recap shown above the win buttons.
  buildStats(cx, y) {
    const s = this.stats;
    const grown = s.plantsGrown || {};
    const kills = s.killsByType || {};
    const totalGrown = Object.values(grown).reduce((a, b) => a + (b || 0), 0);

    const nameOf = (pt) => (pt && entitiesData.plants[pt] ? entitiesData.plants[pt].name : '—');
    const rarest = RARITY_ORDER.find((pt) => (grown[pt] || 0) > 0);

    this.add
      .text(cx, y, `YOUR RUN — DAY ${s.daysSurvived ?? '—'}`, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: COLOR_GOLD
      })
      .setOrigin(0.5, 0)
      .setDepth(202);

    const pad = (label, value) => `${label.padEnd(20, ' ')}${value}`;
    const lines = [
      pad('Days Survived', s.daysSurvived ?? '—'),
      pad(
        'Enemies Defeated',
        `${s.enemiesDefeated ?? 0}  (Green ${kills.green_slime || 0} · Dark ${kills.dark_slime || 0} · Skel ${kills.skeleton || 0})`
      ),
      pad('Seeds Collected', s.seedsCollected ?? 0),
      pad('Plants Grown', totalGrown),
      pad('Times Died', s.deaths ?? 0),
      pad('Upgrades Purchased', s.upgradesPurchased ?? 0),
      '',
      pad('First Plant Grown', nameOf(s.firstPlantGrown)),
      pad('Rarest Find', rarest ? nameOf(rarest) : '—')
    ];

    this.add
      .text(cx, y + 38, lines.join('\n'), {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '19px',
        color: COLOR_TEXT,
        align: 'left',
        lineSpacing: 8
      })
      .setOrigin(0.5, 0)
      .setDepth(202);

    this.add
      .text(cx, y + 38 + lines.length * 27 + 6, `${s.achievementsUnlocked ?? 0} / ${ACHIEVEMENT_COUNT} Achievements`, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '16px',
        color: COLOR_MUTED
      })
      .setOrigin(0.5, 0)
      .setDepth(202);
  }

  chime() {
    if (this.cache.audio.exists('sfx_collect')) {
      this.sound.play('sfx_collect', { volume: 0.5 });
    }
  }

  makeButton(cx, cy, w, h, label, color, onClick) {
    const rect = this.add
      .rectangle(cx, cy, w, h, color)
      .setStrokeStyle(2, 0x000000)
      .setDepth(202)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy, label, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: COLOR_TEXT
      })
      .setOrigin(0.5)
      .setDepth(203);
    rect.on('pointerover', () => rect.setStrokeStyle(2, 0xeac34f));
    rect.on('pointerout', () => rect.setStrokeStyle(2, 0x000000));
    rect.on('pointerup', onClick);
    return rect;
  }

  // Demo win → just close and resume the run normally (NO New Game+ here).
  continuePlaying() {
    EventBus.emit('win:closed', {});
    this.scene.stop();
  }

  // Full win → activate New Game+ (the only place it triggers) and resume the
  // run with the harder NG+ enemy density. newGamePlus:activated persists the
  // flag, bumps density, lights the HUD indicator, and unlocks the achievement.
  startNewGamePlus() {
    EventBus.emit('newGamePlus:activated', {});
    EventBus.emit('win:closed', {});
    this.scene.stop();
  }

  // Save, leave the run, and route to the menu through a valid state transition.
  toMenu() {
    const gameScene = this.scene.get('GameScene');
    if (gameScene && typeof gameScene.autoSave === 'function') gameScene.autoSave();

    GameState.transition('WIN'); // PLAYING → WIN (MenuScene settles WIN → MENU)

    ['UpgradeScene', 'SignpostScene', 'UIScene', 'GameScene'].forEach((key) => {
      if (this.scene.get(key)) this.scene.stop(key);
    });

    this.scene.start('MenuScene');
    this.scene.stop();
  }
}
