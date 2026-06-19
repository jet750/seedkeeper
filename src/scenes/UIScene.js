// UIScene.js
//
// Parallel HUD scene. Receives ALL state via EventBus — it never imports
// GameScene, Player, or Slime. Positions are screen coordinates (the virtual
// 1600x900 space), fixed to this scene's own camera.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';
import entitiesData from '../data/entities.json';

const COLOR_NORMAL = '#F5EFE6';
const COLOR_WARNING = '#ffaa00';
const COLOR_URGENT = '#ff3333';
const HP_BAR_MAX_WIDTH = 240;
const HP_BAR_HEIGHT = 22;

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  init(data) {
    // Sensible fresh-game defaults; events refine these as play proceeds.
    this.maxHP = entitiesData.player.maxHP;
    this.hp = this.maxHP;
    this.zone = 'garden';
    this.dayNumber = data && data.dayNumber ? data.dayNumber : 1;
    this.remaining = entitiesData.daySystem.timerDuration;
    this.warningTime = entitiesData.daySystem.warningTime;
    this.urgentTime = entitiesData.daySystem.urgentTime;
    this._busHandlers = [];
    this._pulseTween = null;
    this._toastQueue = [];
    this._toastActive = false;
  }

  create() {
    this.buildHud();
    this.subscribeAll();
    this.refreshHP();
    this.refreshZone();
    this.refreshTimer();

    this.events.once('shutdown', this.teardown, this);
    this.events.once('destroy', this.teardown, this);
  }

  // --- HUD construction -----------------------------------------------------

  buildHud() {
    const pad = 32;

    // TOP LEFT — HP bar
    this.hpFill = this.add
      .rectangle(pad, 40, HP_BAR_MAX_WIDTH, HP_BAR_HEIGHT, 0xff3333)
      .setOrigin(0, 0.5);
    this.hpBorder = this.add
      .rectangle(pad, 40, HP_BAR_MAX_WIDTH, HP_BAR_HEIGHT)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0xffffff)
      .setFillStyle();
    this.hpText = this.add.text(pad, 60, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: COLOR_NORMAL
    });

    // TOP CENTER — Day + zone badge
    this.dayText = this.add
      .text(VIRTUAL_WIDTH / 2, 30, `Day ${this.dayNumber}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: COLOR_NORMAL
      })
      .setOrigin(0.5, 0);
    this.zoneBadge = this.add
      .text(VIRTUAL_WIDTH / 2, 66, 'GARDEN', {
        fontFamily: '"Courier New", monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#8AB87E'
      })
      .setOrigin(0.5, 0);

    // TOP RIGHT — Timer (forest only)
    this.timerText = this.add
      .text(VIRTUAL_WIDTH - 40, 40, formatTime(this.remaining), {
        fontFamily: '"Courier New", monospace',
        fontSize: '40px',
        fontStyle: 'bold',
        color: COLOR_NORMAL
      })
      .setOrigin(1, 0.5);

    // TOP RIGHT (under timer) — mute indicator, shown only while muted.
    this.muteIndicator = this.add
      .text(VIRTUAL_WIDTH - 40, 84, '🔇 MUTED', {
        fontFamily: '"Courier New", monospace',
        fontSize: '16px',
        color: '#9B9389'
      })
      .setOrigin(1, 0.5)
      .setVisible(false);

    // TOP CENTER (under zone badge) — New Game+ indicator, shown only on NG+.
    this.ngPlusIndicator = this.add
      .text(VIRTUAL_WIDTH / 2, 96, '⭐ NG+', {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setOrigin(0.5, 0)
      .setVisible(false);

    // TOP LEFT (under HP) — watering can indicator, shown only while carrying.
    this.waterIndicator = this.add
      .text(pad, 92, '💧 Water', {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: '#6B92BC'
      })
      .setOrigin(0, 0.5)
      .setVisible(false);

    // BOTTOM LEFT — seed slot row (real plant-color circles in Sprint 2).
    this._slotSize = 40;
    this._slotGap = 12;
    this._slotBaseX = pad;
    this._slotBaseY = VIRTUAL_HEIGHT - 48;
    this.slotCount = entitiesData.player.seedSlots;
    this.buildSeedSlots(this.slotCount);

    this.add
      .text(pad, this._slotBaseY + 28, 'SEEDS', {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: '#9B9389'
      })
      .setOrigin(0, 0);

    // BOTTOM RIGHT — plant bank readout (chest UI proper arrives in Sprint 4).
    this.bankText = this.add
      .text(VIRTUAL_WIDTH - pad, VIRTUAL_HEIGHT - 40, 'Bank: empty', {
        fontFamily: '"Courier New", monospace',
        fontSize: '16px',
        color: '#9B9389',
        align: 'right'
      })
      .setOrigin(1, 1);

    // BOTTOM RIGHT (above bank) — ranged ammo counter, hidden until equipped.
    this.ammoText = this.add
      .text(VIRTUAL_WIDTH - pad, VIRTUAL_HEIGHT - 72, '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#EDD49A',
        align: 'right'
      })
      .setOrigin(1, 1)
      .setVisible(false);
  }

  refreshAmmo(ammo, max) {
    this.ammoText.setText(`Ammo  ${ammo} / ${max}`).setVisible(true);
    this.ammoText.setColor(ammo === 0 ? '#ff6b6b' : '#EDD49A');
  }

  buildSeedSlots(count) {
    // Tear down any previous slot graphics (slot count can grow in Sprint 4).
    if (this.seedSlots) {
      this.seedSlots.forEach((s) => {
        s.box.destroy();
        s.fill.destroy();
      });
    }
    this.seedSlots = [];
    this.slotCount = count;
    for (let i = 0; i < count; i++) {
      const cx = this._slotBaseX + i * (this._slotSize + this._slotGap) + this._slotSize / 2;
      const box = this.add
        .rectangle(cx, this._slotBaseY, this._slotSize, this._slotSize, 0x3a3531)
        .setStrokeStyle(2, 0x57514b);
      const fill = this.add
        .circle(cx, this._slotBaseY, this._slotSize / 2 - 6, 0xffffff)
        .setVisible(false);
      this.seedSlots.push({ box, fill });
    }
  }

  refreshSeedSlots(slots) {
    if (slots.length !== this.slotCount) {
      this.buildSeedSlots(slots.length);
    }
    slots.forEach((plantType, i) => {
      const slot = this.seedSlots[i];
      if (!slot) return;
      if (plantType && entitiesData.plants[plantType]) {
        const color = parseInt(entitiesData.plants[plantType].color.replace('#', ''), 16);
        slot.fill.setFillStyle(color).setVisible(true);
      } else {
        slot.fill.setVisible(false);
      }
    });
  }

  // --- EventBus subscriptions ----------------------------------------------

  subscribe(event, handler) {
    EventBus.on(event, handler);
    this._busHandlers.push([event, handler]);
  }

  subscribeAll() {
    this.subscribe('player:damaged', (d) => {
      if (d.currentHP === undefined) return; // ignore raw damage requests
      this.hp = d.currentHP;
      this.maxHP = d.maxHP;
      this.refreshHP();
    });
    this.subscribe('player:healed', (d) => {
      this.hp = d.currentHP;
      this.maxHP = d.maxHP;
      this.refreshHP();
    });
    this.subscribe('player:zoneChanged', (d) => {
      this.zone = d.zone;
      this.refreshZone();
      this.refreshTimer();
    });
    this.subscribe('day:timerTick', (d) => {
      this.remaining = d.remaining;
      this.refreshTimer();
    });
    this.subscribe('day:timerUrgent', () => this.startPulse());
    this.subscribe('day:dayChanged', (d) => {
      this.dayNumber = d.day;
      this.dayText.setText(`Day ${this.dayNumber}`);
    });

    // --- Sprint 2 ---
    this.subscribe('day:advanced', (d) => {
      this.dayNumber = d.dayNumber;
      this.dayText.setText(`Day ${this.dayNumber}`);
    });
    this.subscribe('inventory:changed', (d) => this.refreshSeedSlots(d.slots));
    this.subscribe('player:gotWater', () => this.waterIndicator.setVisible(true));
    this.subscribe('player:usedWater', () => this.waterIndicator.setVisible(false));
    this.subscribe('bank:updated', (d) => this.refreshBank(d.bank));

    // --- Sprint 4 ---
    this.subscribe('player:statsChanged', (d) => {
      this.hp = d.currentHP;
      this.maxHP = d.maxHP;
      this.refreshHP();
    });
    this.subscribe('ranged:equipped', (d) => this.refreshAmmo(d.ammo, d.max));
    this.subscribe('ranged:fired', (d) => this.refreshAmmo(d.ammo, d.max));

    // --- Sprint 5 ---
    this.subscribe('audio:muteChanged', (d) => this.muteIndicator.setVisible(!!d.muted));
    this.subscribe('ngplus:status', (d) => this.ngPlusIndicator.setVisible(!!d.active));
    this.subscribe('newGamePlus:activated', () => this.ngPlusIndicator.setVisible(true));

    // --- Sprint 6 — achievement toasts ---
    this.subscribe('achievement:unlocked', (d) => this.enqueueToast(d.achievement));
  }

  // --- Achievement toasts (Sprint 6) ----------------------------------------
  // Slide in from the top-right, hold 4s, fade out. Concurrent unlocks queue
  // and play one at a time (max depth 5 — oldest dropped on overflow).

  enqueueToast(achievement) {
    if (!achievement) return;
    this._toastQueue.push(achievement);
    if (this._toastQueue.length > 5) this._toastQueue.shift();
    if (!this._toastActive) this.showNextToast();
  }

  showNextToast() {
    if (this._toastQueue.length === 0) {
      this._toastActive = false;
      return;
    }
    this._toastActive = true;
    this.buildToast(this._toastQueue.shift());
  }

  buildToast(a) {
    const w = 380;
    const h = 96;
    const pad = 24;
    const y = 160; // below the timer / mute / NG+ indicators
    const xHidden = VIRTUAL_WIDTH + w;
    const xShown = VIRTUAL_WIDTH - pad - w / 2;

    const container = this.add.container(xHidden, y).setDepth(300);
    const bg = this.add
      .rectangle(0, 0, w, h, 0x221e1b, 0.97)
      .setStrokeStyle(2, 0xd4a83f);
    const icon = this.add.text(-w / 2 + 30, 0, a.icon, { fontSize: '34px' }).setOrigin(0.5);
    const title = this.add
      .text(-w / 2 + 60, -28, 'ACHIEVEMENT UNLOCKED', {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#D4A83F'
      })
      .setOrigin(0, 0.5);
    const name = this.add
      .text(-w / 2 + 60, -6, a.name, {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0, 0.5);
    const flavor = this.add
      .text(-w / 2 + 60, 22, `"${a.flavor}"`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: '#9B9389',
        wordWrap: { width: w - 80 }
      })
      .setOrigin(0, 0.5);

    container.add([bg, icon, title, name, flavor]);

    this.tweens.add({ targets: container, x: xShown, duration: 350, ease: 'Back.easeOut' });
    this.time.delayedCall(4000, () => {
      this.tweens.add({
        targets: container,
        x: xHidden,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          container.destroy();
          this.showNextToast();
        }
      });
    });
  }

  refreshBank(bank) {
    const parts = Object.entries(bank)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => {
        const name = entitiesData.plants[type] ? entitiesData.plants[type].name : type;
        return `${name}: ${count}`;
      });
    this.bankText.setText(parts.length ? `Bank — ${parts.join('  ·  ')}` : 'Bank: empty');
    console.log('[bank] updated:', bank);
  }

  // --- Refreshers -----------------------------------------------------------

  refreshHP() {
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHP, 0, 1);
    this.hpFill.width = HP_BAR_MAX_WIDTH * ratio;
    this.hpText.setText(`HP: ${Math.round(this.hp)} / ${this.maxHP}`);
  }

  refreshZone() {
    const inForest = this.zone === 'forest';
    this.zoneBadge.setText(inForest ? 'FOREST' : 'GARDEN');
    this.zoneBadge.setColor(inForest ? '#ff6b6b' : '#8AB87E');
  }

  refreshTimer() {
    // Timer is only visible in the forest.
    const visible = this.zone === 'forest';
    this.timerText.setVisible(visible);
    if (!visible) {
      this.stopPulse();
      return;
    }

    this.timerText.setText(formatTime(this.remaining));

    if (this.remaining <= this.urgentTime) {
      this.timerText.setColor(COLOR_URGENT);
      this.startPulse();
    } else if (this.remaining <= this.warningTime) {
      this.timerText.setColor(COLOR_WARNING);
      this.stopPulse();
    } else {
      this.timerText.setColor(COLOR_NORMAL);
      this.stopPulse();
    }
  }

  // --- Urgent pulse tween ---------------------------------------------------

  startPulse() {
    if (this._pulseTween || !this.timerText.visible) return;
    this._pulseTween = this.tweens.add({
      targets: this.timerText,
      scale: { from: 1, to: 1.15 },
      duration: 350,
      yoyo: true,
      repeat: -1
    });
  }

  stopPulse() {
    if (this._pulseTween) {
      this._pulseTween.stop();
      this._pulseTween = null;
      this.timerText.setScale(1);
    }
  }

  teardown() {
    this._busHandlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._busHandlers = [];
    this.stopPulse();
  }
}
