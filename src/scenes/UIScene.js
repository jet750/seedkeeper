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
const UI_SLOT_FRAME = 4; // frame index into ui_slot_frame.png (3x3 of 48px slots)

// Weather id → frame in the small Sprout Lands weather sheet (32px, top row is a
// sun→cloud→rain→…→swirl sequence). Best-fit indices — tune if an icon mismatches.
const WEATHER_FRAMES = { clear: 0, sunny: 0, cloudy: 2, rain: 3, fog: 1, wind: 6 };

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
    this._promptTween = null;
    this._banner = null; // transient top-center banner (weather/notice/dict)
    this._bannerEvent = null;
    this._worldDetailObjs = null; // examine popup
    this._worldDetailTimer = null;
    this._toastQueue = [];
    this._toastActive = false;
    this._swapOpen = false;
    this._swapObjects = [];
    this._swapSlots = [];
    this._swapNewType = null;
  }

  create() {
    this.buildHud();
    this.subscribeAll();
    this.refreshHP();
    this.refreshZone();
    this.refreshTimer();

    // Number keys / Esc drive the swap picker (Sprint 7) — only while it's open.
    this.input.keyboard.on('keydown', (e) => this.onSwapKey(e));
    // Esc also closes an open world-detail popup (Sprint 11).
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._worldDetailObjs) this.closeWorldDetail();
    });

    this.events.once('shutdown', this.teardown, this);
    this.events.once('destroy', this.teardown, this);
  }

  // --- HUD construction -----------------------------------------------------

  buildHud() {
    const pad = 32;

    // Semi-transparent dark bars behind the top and bottom HUD clusters so the
    // text reads clearly over any garden/forest background (Sprint 8 polish).
    // Created first so every HUD element draws on top of them.
    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, 80, 0x000000, 0.42)
      .setOrigin(0, 0)
      .setDepth(-1);
    this.add
      .rectangle(0, VIRTUAL_HEIGHT - 80, VIRTUAL_WIDTH, 80, 0x000000, 0.42)
      .setOrigin(0, 0)
      .setDepth(-1);

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
      fontFamily: '"SproutLands", "Courier New", monospace',
      fontSize: '18px',
      color: COLOR_NORMAL
    });

    // TOP CENTER — Day + zone badge
    this.dayText = this.add
      .text(VIRTUAL_WIDTH / 2, 30, `Day ${this.dayNumber}`, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: COLOR_NORMAL
      })
      .setOrigin(0.5, 0);
    this.zoneBadge = this.add
      .text(VIRTUAL_WIDTH / 2, 66, 'GARDEN', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#8AB87E'
      })
      .setOrigin(0.5, 0);

    // TOP CENTER (right of the day counter) — persistent weather icon. Real
    // sprite from the Sprout Lands weather sheet when present, else emoji text.
    if (this.textures.exists('weather_icons')) {
      this.weatherIcon = this.add
        .sprite(VIRTUAL_WIDTH / 2 + 96, 46, 'weather_icons', 0)
        .setOrigin(0.5, 0.5)
        .setScale(1.4);
      this._weatherIsSprite = true;
    } else {
      this.weatherIcon = this.add
        .text(VIRTUAL_WIDTH / 2 + 92, 32, '', { fontSize: '24px' })
        .setOrigin(0.5, 0);
      this._weatherIsSprite = false;
    }

    // TOP RIGHT — Timer (forest only)
    this.timerText = this.add
      .text(VIRTUAL_WIDTH - 40, 40, formatTime(this.remaining), {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '40px',
        fontStyle: 'bold',
        color: COLOR_NORMAL
      })
      .setOrigin(1, 0.5);

    // TOP RIGHT (under timer) — mute indicator, shown only while muted.
    this.muteIndicator = this.add
      .text(VIRTUAL_WIDTH - 40, 84, '🔇 MUTED', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '16px',
        color: '#9B9389'
      })
      .setOrigin(1, 0.5)
      .setVisible(false);

    // TOP CENTER (under zone badge) — New Game+ indicator, shown only on NG+.
    this.ngPlusIndicator = this.add
      .text(VIRTUAL_WIDTH / 2, 96, '⭐ NG+', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setOrigin(0.5, 0)
      .setVisible(false);

    // TOP LEFT (under HP) — watering-can charge counter "💧 N/Max" (Sprint 9).
    // Replaces the old binary "has water" flag with current / capacity charges.
    this.waterIndicator = this.add
      .text(pad, 92, '💧 0/1', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '18px',
        color: '#9B9389'
      })
      .setOrigin(0, 0.5);

    // BOTTOM LEFT — seed slot row (real plant-color circles in Sprint 2).
    this._slotSize = 40;
    this._slotGap = 12;
    this._slotBaseX = pad;
    this._slotBaseY = VIRTUAL_HEIGHT - 48;
    this.slotCount = entitiesData.player.seedSlots;
    this.buildSeedSlots(this.slotCount);

    this.add
      .text(pad, this._slotBaseY + 28, 'SEEDS', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '12px',
        color: '#9B9389'
      })
      .setOrigin(0, 0);

    // BOTTOM CENTER (above the seed bar) — contextual interaction prompt
    // (Sprint 9). Fades in for the nearest interactable; greyed when not an
    // actionable [F] prompt. White-on-dark for legibility over any background.
    this.interactPrompt = this.add
      .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 112, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: COLOR_NORMAL,
        stroke: '#141210',
        strokeThickness: 4,
        align: 'center'
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(200);

    // BOTTOM RIGHT — plant bank readout (chest UI proper arrives in Sprint 4).
    this.bankText = this.add
      .text(VIRTUAL_WIDTH - pad, VIRTUAL_HEIGHT - 40, 'Bank: empty', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '16px',
        color: '#9B9389',
        align: 'right'
      })
      .setOrigin(1, 1);

    // BOTTOM RIGHT (above bank) — ranged ammo counter, hidden until equipped.
    this.ammoText = this.add
      .text(VIRTUAL_WIDTH - pad, VIRTUAL_HEIGHT - 72, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
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

  refreshWater(charges, capacity) {
    this.waterIndicator.setText(`💧 ${charges}/${capacity}`);
    this.waterIndicator.setColor(charges > 0 ? '#6B92BC' : '#9B9389');
  }

  // --- Contextual interaction prompt (Sprint 9) -----------------------------

  showInteractPrompt(text, actionable) {
    this.interactPrompt.setText(text);
    this.interactPrompt.setColor(actionable ? COLOR_NORMAL : '#9B9389');
    // Suppress while the swap picker owns the bottom-center space.
    if (this._swapOpen) {
      this.interactPrompt.setAlpha(0);
      return;
    }
    if (this._promptTween) this._promptTween.stop();
    this._promptTween = this.tweens.add({
      targets: this.interactPrompt,
      alpha: 1,
      duration: 150
    });
  }

  hideInteractPrompt() {
    if (this._promptTween) this._promptTween.stop();
    this._promptTween = this.tweens.add({
      targets: this.interactPrompt,
      alpha: 0,
      duration: 150
    });
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
    // Sprout Lands UI slot frame (48x48 sheet) replaces the grey rectangle when
    // present (Sprint 10); the plant-colour circle renders on top of the frame.
    const hasFrame = this.textures.exists('ui_slot_frame');
    for (let i = 0; i < count; i++) {
      const cx = this._slotBaseX + i * (this._slotSize + this._slotGap) + this._slotSize / 2;
      let box;
      if (hasFrame) {
        box = this.add
          .image(cx, this._slotBaseY, 'ui_slot_frame', UI_SLOT_FRAME)
          .setDisplaySize(this._slotSize, this._slotSize);
      } else {
        box = this.add
          .rectangle(cx, this._slotBaseY, this._slotSize, this._slotSize, 0x3a3531)
          .setStrokeStyle(2, 0x57514b);
      }
      const fill = this.add
        .circle(cx, this._slotBaseY, this._slotSize / 2 - 8, 0xffffff)
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
    // Water charges (Sprint 9): fill at the well, spend per bed, capacity from
    // the well-upgrade track — all three events refresh the same "💧 N/Max".
    this.subscribe('player:waterFilled', (d) => this.refreshWater(d.charges, d.capacity));
    this.subscribe('player:waterUsed', (d) => this.refreshWater(d.charges, d.capacity));
    this.subscribe('player:waterChanged', (d) => this.refreshWater(d.charges, d.capacity));
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

    // --- Sprint 7 — swap picker + death message ---
    this.subscribe('inventory:swapRequested', (d) => this.openSwapPicker(d.slots, d.newPlantType));
    this.subscribe('inventory:swapClosed', () => this.closeSwapPicker());
    this.subscribe('player:died', () => this.showDeathMessage());

    // --- Sprint 9 — contextual interaction prompt ---
    this.subscribe('interact:nearObject', (d) => this.showInteractPrompt(d.text, d.actionable));
    this.subscribe('interact:leftObject', () => this.hideInteractPrompt());

    // --- Sprint 11 — weather, world details, dictionary, notices ---
    this.subscribe('weather:changed', (d) => this.onWeather(d));
    this.subscribe('worlddetail:opened', (d) => this.showWorldDetail(d));
    this.subscribe('dictionary:newEntry', (d) => this.showDictToast(d.plantType));
    this.subscribe('ui:notice', (d) => this.showBanner(d.text, 4500, COLOR_NORMAL));
  }

  // --- Weather, banners, world-detail popup (Sprint 11) ---------------------

  onWeather({ weather, isNewDay }) {
    if (!weather) return;
    if (this._weatherIsSprite) {
      this.weatherIcon.setFrame(WEATHER_FRAMES[weather.id] ?? 0);
      this.weatherIcon.setVisible(true);
    } else {
      this.weatherIcon.setText(weather.icon || '');
    }
    if (isNewDay) {
      this.showBanner(`${weather.icon} ${weather.name}\n"${weather.description}"`, 5000, '#EDD49A');
    }
  }

  showDictToast(plantType) {
    const name = entitiesData.plants[plantType] ? entitiesData.plants[plantType].name : plantType;
    this.showBanner(`📖 New entry: ${name}`, 2600, '#8AB87E');
  }

  // Single transient top-center banner. A new banner replaces the previous one.
  showBanner(text, holdMs, color) {
    if (this._banner) {
      this._banner.destroy();
      this._banner = null;
    }
    if (this._bannerEvent) {
      this._bannerEvent.remove(false);
      this._bannerEvent = null;
    }
    const t = this.add
      .text(VIRTUAL_WIDTH / 2, 150, text, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '20px',
        color: color || COLOR_NORMAL,
        align: 'center',
        backgroundColor: 'rgba(20,18,16,0.85)',
        padding: { x: 18, y: 10 },
        stroke: '#141210',
        strokeThickness: 2
      })
      .setOrigin(0.5, 0)
      .setDepth(320)
      .setAlpha(0);
    this._banner = t;
    this.tweens.add({ targets: t, alpha: 1, duration: 200 });
    this._bannerEvent = this.time.delayedCall(holdMs, () => {
      this.tweens.add({
        targets: t,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          t.destroy();
          if (this._banner === t) this._banner = null;
        }
      });
    });
  }

  showWorldDetail({ title, text }) {
    this.closeWorldDetail();
    const cx = VIRTUAL_WIDTH / 2;
    const cy = VIRTUAL_HEIGHT / 2;
    const w = 640;
    const h = 250;
    const bg = this.add
      .rectangle(cx, cy, w, h, 0x221e1b, 0.97)
      .setStrokeStyle(2, 0x8ab87e)
      .setDepth(310);
    const titleT = this.add
      .text(cx, cy - h / 2 + 22, title, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setOrigin(0.5, 0)
      .setDepth(311);
    const divider = this.add.rectangle(cx, cy - h / 2 + 58, w - 60, 2, 0x4d4843).setDepth(311);
    const body = this.add
      .text(cx, cy - h / 2 + 76, text, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '16px',
        fontStyle: 'italic',
        color: '#D1CCC6',
        align: 'center',
        wordWrap: { width: w - 64 },
        lineSpacing: 6
      })
      .setOrigin(0.5, 0)
      .setDepth(311);
    const hint = this.add
      .text(cx, cy + h / 2 - 26, '[Esc] Close', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '14px',
        color: '#9B9389'
      })
      .setOrigin(0.5)
      .setDepth(311);
    this._worldDetailObjs = [bg, titleT, divider, body, hint];
    this._worldDetailTimer = this.time.delayedCall(6000, () => this.closeWorldDetail());
  }

  closeWorldDetail() {
    if (this._worldDetailTimer) {
      this._worldDetailTimer.remove(false);
      this._worldDetailTimer = null;
    }
    if (this._worldDetailObjs) {
      this._worldDetailObjs.forEach((o) => o.destroy());
      this._worldDetailObjs = null;
      EventBus.emit('worlddetail:closed', {});
    }
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
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#D4A83F'
      })
      .setOrigin(0, 0.5);
    const name = this.add
      .text(-w / 2 + 60, -6, a.name, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0, 0.5);
    const flavor = this.add
      .text(-w / 2 + 60, 22, `"${a.flavor}"`, {
        fontFamily: '"SproutLands", "Courier New", monospace',
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

  // --- Swap picker (Sprint 7) -----------------------------------------------
  // Shown when the player tries to collect a seed with a full inventory. Lists
  // the filled slots as options; clicking one (or pressing its number key)
  // drops that seed and collects the new one. Cancel / Esc / walking away abort.

  openSwapPicker(slots, newPlantType) {
    this.closeSwapPicker();
    this._swapSlots = slots;
    this._swapNewType = newPlantType;

    const filled = [];
    slots.forEach((pt, i) => {
      if (pt !== null) filled.push({ pt, i });
    });
    if (filled.length === 0) return;
    this._swapOpen = true;
    // The picker occupies the bottom-center; hide the contextual prompt under it.
    if (this.interactPrompt) this.interactPrompt.setAlpha(0);

    const cx = VIRTUAL_WIDTH / 2;
    const panelY = VIRTUAL_HEIGHT - 200;
    const btnW = 150;
    const btnH = 48;
    const gap = 14;
    const totalW = filled.length * btnW + (filled.length - 1) * gap;
    const panelW = Math.max(totalW + 60, 420);
    const panelH = 150;

    const bg = this.add
      .rectangle(cx, panelY, panelW, panelH, 0x221e1b, 0.97)
      .setStrokeStyle(2, 0xd4a83f)
      .setDepth(250);
    this._swapObjects.push(bg);

    this._swapObjects.push(
      this.add
        .text(cx, panelY - panelH / 2 + 16, 'Swap which seed?', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(0.5, 0)
        .setDepth(251)
    );

    const newName = entitiesData.plants[newPlantType]
      ? entitiesData.plants[newPlantType].name
      : newPlantType;
    this._swapObjects.push(
      this.add
        .text(cx, panelY - panelH / 2 + 44, `Picking up: ${newName}`, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '14px',
          color: '#D1CCC6'
        })
        .setOrigin(0.5, 0)
        .setDepth(251)
    );

    const startX = cx - totalW / 2 + btnW / 2;
    const rowY = panelY + 6;
    filled.forEach((f, n) => {
      const x = startX + n * (btnW + gap);
      const color = parseInt(entitiesData.plants[f.pt].color.replace('#', ''), 16);
      const name = entitiesData.plants[f.pt].name;
      const rect = this.add
        .rectangle(x, rowY, btnW, btnH, 0x2d2926)
        .setStrokeStyle(2, 0x57514b)
        .setDepth(251)
        .setInteractive({ useHandCursor: true });
      const dot = this.add.circle(x - btnW / 2 + 18, rowY, 9, color).setDepth(252);
      const label = this.add
        .text(x - btnW / 2 + 34, rowY, `${f.i + 1}. ${name}`, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '13px',
          color: '#F5EFE6'
        })
        .setOrigin(0, 0.5)
        .setDepth(252);
      rect.on('pointerover', () => rect.setStrokeStyle(2, 0xeac34f));
      rect.on('pointerout', () => rect.setStrokeStyle(2, 0x57514b));
      rect.on('pointerup', () => this.confirmSwap(f.i));
      this._swapObjects.push(rect, dot, label);
    });

    const cancelY = panelY + panelH / 2 - 22;
    const cancel = this.add
      .rectangle(cx, cancelY, 170, 34, 0x8a3a3a)
      .setStrokeStyle(2, 0x000000)
      .setDepth(251)
      .setInteractive({ useHandCursor: true });
    const cancelLabel = this.add
      .text(cx, cancelY, 'Cancel (Esc)', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(252);
    cancel.on('pointerup', () => this.cancelSwap());
    this._swapObjects.push(cancel, cancelLabel);
  }

  closeSwapPicker() {
    this._swapObjects.forEach((o) => o.destroy());
    this._swapObjects = [];
    this._swapOpen = false;
  }

  onSwapKey(e) {
    if (!this._swapOpen) return;
    if (e.key === 'Escape') {
      this.cancelSwap();
      return;
    }
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= this._swapSlots.length) {
      if (this._swapSlots[n - 1] !== null) this.confirmSwap(n - 1);
    }
  }

  confirmSwap(dropSlotIndex) {
    EventBus.emit('inventory:swapConfirmed', {
      dropSlotIndex,
      newPlantType: this._swapNewType
    });
    this.closeSwapPicker();
  }

  cancelSwap() {
    EventBus.emit('inventory:swapCancelled', {});
    this.closeSwapPicker();
  }

  // --- Death message (Sprint 7 + death-fix) ---------------------------------
  // Death now costs a day, so the headline is "Day lost." with the seed-recovery
  // window as a secondary line. Both fade out together with the respawn fade.

  showDeathMessage() {
    const cx = VIRTUAL_WIDTH / 2;
    const cy = VIRTUAL_HEIGHT / 2;
    const headline = this.add
      .text(cx, cy - 52, 'Day lost.', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ff3333',
        backgroundColor: 'rgba(20,18,16,0.85)',
        padding: { x: 16, y: 8 }
      })
      .setOrigin(0.5)
      .setDepth(260);
    const sub = this.add
      .text(cx, cy + 4, 'Seeds dropped — 30 seconds to recover', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '20px',
        color: '#EDD49A',
        backgroundColor: 'rgba(20,18,16,0.85)',
        padding: { x: 12, y: 6 }
      })
      .setOrigin(0.5)
      .setDepth(260);
    this.tweens.add({
      targets: [headline, sub],
      alpha: 0,
      delay: 2000,
      duration: 1000,
      onComplete: () => {
        headline.destroy();
        sub.destroy();
      }
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
