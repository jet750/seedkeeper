// UIScene.js
//
// Parallel HUD scene. Receives ALL state via EventBus — it never imports
// GameScene, Player, or Slime. Positions are screen coordinates (the virtual
// 1600x900 space), fixed to this scene's own camera.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import {
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GARDEN_X,
  GARDEN_Y,
  GARDEN_WIDTH,
  GARDEN_HEIGHT,
  FONT_FAMILY
} from '../core/Constants.js';
import WorldZoneSystem from '../systems/WorldZoneSystem.js';
import MobileDetect from '../core/MobileDetect.js';
import TouchControlSystem from '../systems/TouchControlSystem.js';
import entitiesData from '../data/entities.json';

const COLOR_NORMAL = '#F5EFE6';
const COLOR_WARNING = '#ffaa00';
const COLOR_URGENT = '#ff3333';
const HP_BAR_MAX_WIDTH = 240;
const HP_BAR_HEIGHT = 22;

// HP bar fill colour by current-health fraction (Task 3). Green when healthy,
// yellow when wounded, red when critical. Thresholds are inclusive lower bounds:
// ratio >= HIGH → green, >= LOW (but < HIGH) → yellow, else red. Tunable.
const HP_THRESHOLD_HIGH = 0.66; // ≥66% health → green
const HP_THRESHOLD_LOW = 0.33; // 33–66% → yellow; <33% → red
const HP_COLOR_HIGH = 0x6abe30; // green
const HP_COLOR_MID = 0xeac34f; // yellow/gold
const HP_COLOR_LOW = 0xff3333; // red (the bar's original colour)
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
    this.raw = this.remaining; // Sprint 12 — possibly-negative overtime value for the HUD
    this.warningTime = entitiesData.daySystem.warningTime;
    this.urgentTime = entitiesData.daySystem.urgentTime;
    this.passOutFloorMs = entitiesData.daySystem.passOutFloorMs || 0; // Sprint 12 overtime floor
    this._busHandlers = [];
    this._pulseTween = null;
    this._promptTween = null;
    this._banner = null; // transient top-center banner (weather/notice/dict)
    this._bannerEvent = null;
    this._worldDetailObjs = null; // examine popup
    this._worldDetailTimer = null;
    this._toastQueue = [];
    this._toastActive = false;
    this._tutorialQueue = []; // Sprint 12 first-run hint pills
    this._tutorialActive = false;
    this._comboFadeEvent = null; // Sprint 13 combo counter
    this._swapOpen = false;
    this._swapObjects = [];
    this._swapSlots = [];
    this._swapNewType = null;
    // Planting picker (Sprint 10c)
    this._plantOpen = false;
    this._plantObjects = [];
    this._plantSlots = [];
    this._plantBedIndex = null;
    // Minimap (Sprint 10c) — its own copy of the deterministic zone system so the
    // HUD can sample the same organic layout GameScene builds.
    this._minimapVisible = true;
    this._minimapObjects = [];
    this.worldZoneSystem = new WorldZoneSystem();
  }

  create() {
    this.buildHud();
    this.createMinimap();
    this.subscribeAll();
    this.refreshHP();
    this.refreshZone();
    this.refreshTimer();

    // Number keys / Esc drive the swap picker (Sprint 7) and the planting picker
    // (Sprint 10c) — each only responds while its own picker is open.
    this.input.keyboard.on('keydown', (e) => this.onSwapKey(e));
    this.input.keyboard.on('keydown', (e) => this.onPlantKey(e));
    // M toggles the minimap (Sprint 10c).
    this.input.keyboard.on('keydown-M', () => this.toggleMinimap());
    // Esc also closes an open world-detail popup (Sprint 11).
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._worldDetailObjs) this.closeWorldDetail();
    });

    // Mobile control layer (joystick + buttons + orientation gate). Built last so
    // it draws over the HUD, and only on touch devices — desktop stays untouched.
    if (MobileDetect.isMobile()) {
      this.touchControls = new TouchControlSystem(this);
    }

    // Live reflow: under the mobile RESIZE scale mode the game size IS the screen
    // size and changes on rotation / toolbar collapse. Re-lay-out the whole HUD on
    // every Scale 'resize' so it reflows without a page reload. On desktop (FIT) the
    // game size stays 1600x900, so this reproduces the exact same positions — a
    // no-op for desktop. Run once now to seat everything at the current viewport.
    this.scale.on('resize', this.onResize, this);
    this.layoutAll(this.scale.width, this.scale.height);

    this.events.once('shutdown', this.teardown, this);
    this.events.once('destroy', this.teardown, this);
  }

  // Scale Manager 'resize' → reflow. gameSize is the live (screen-sized under RESIZE)
  // game dimensions; everything in the HUD is a function of these + the safe insets.
  onResize(gameSize) {
    this.layoutAll(gameSize.width, gameSize.height);
  }

  // One entry point for both the initial create() pass and every resize. Safe insets
  // are the raw CSS-pixel notch/home-bar values on mobile (HUD space == screen px
  // under RESIZE), zero on desktop so the desktop layout is byte-for-byte unchanged.
  layoutAll(width, height) {
    const safe = MobileDetect.isMobile()
      ? MobileDetect.getRawInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };
    this.layoutHUD(width, height, safe);
    if (this.touchControls) this.touchControls.layout(width, height, safe);
  }

  // --- HUD construction -----------------------------------------------------

  buildHud() {
    const pad = 32;

    // Semi-transparent dark bars behind the top and bottom HUD clusters so the
    // text reads clearly over any garden/forest background (Sprint 8 polish).
    // Created first so every HUD element draws on top of them. Stored so layoutHUD
    // can re-span them to the current width and re-seat the bottom one on resize.
    this.topBar = this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, 80, 0x000000, 0.42)
      .setOrigin(0, 0)
      .setDepth(-1);
    this.bottomBar = this.add
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

    // TOP RIGHT (under timer + overtime slot) — mute indicator, shown only while
    // muted. Sits below the overtime countdown's reserved row so the two never clash.
    this.muteIndicator = this.add
      .text(VIRTUAL_WIDTH - 40, 112, '🔇 MUTED', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '16px',
        color: '#9B9389'
      })
      .setOrigin(1, 0.5)
      .setVisible(false);

    // TOP RIGHT (under timer) — overtime / pass-out countdown (Sprint 12). Hidden
    // until the day timer runs past 0:00 into overtime, then shows the red, pulsing
    // time-left before the pass-out floor. Sits just below the 0:00 timer readout.
    this.overtimeText = this.add
      .text(VIRTUAL_WIDTH - 40, 78, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: COLOR_URGENT
      })
      .setOrigin(1, 0.5)
      .setVisible(false);
    this._overtimePulse = null;

    // TOP STATUS BAR (left of centre, right of the HP bar) — banked coin counter
    // (Sprint 2 dual economy). Relocated here in Sprint 3-polish so currency sits
    // alongside the Day / HP readout instead of crowding the minimap. Always
    // visible; updated via the 'coins:changed' event.
    this.coinText = this.add
      .text(300, 40, '🪙 0', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setOrigin(0, 0.5);

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

    this.seedsLabel = this.add
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

    // CENTER-RIGHT — combo counter (Sprint 13), hidden until a 3+ hit streak.
    this.comboText = this.add
      .text(VIRTUAL_WIDTH * 0.72, VIRTUAL_HEIGHT / 2, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#F5EFE6',
        stroke: '#141210',
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(240)
      .setAlpha(0);
  }

  refreshAmmo(ammo, max) {
    this.ammoText.setText(`Ammo  ${ammo} / ${max}`).setVisible(true);
    this.ammoText.setColor(ammo === 0 ? '#ff6b6b' : '#EDD49A');
  }

  // --- Combo counter (Sprint 13) --------------------------------------------
  // Big temporary text near center-right. Colour + size scale with the streak;
  // each new hit refreshes it, and it fades 1s after the last hit (or on reset).

  showCombo(count) {
    let color = '#F5EFE6';
    let size = '40px';
    let label = `${count} HIT`;
    if (count >= 15) {
      color = '#ff4444';
      size = '58px';
      label = 'MAX!!';
      this.flashCombo();
    } else if (count >= 10) {
      color = '#ff9a3c';
      size = '50px';
    } else if (count >= 5) {
      color = '#ffe066';
      size = '44px';
    }
    this.comboText.setText(label).setColor(color).setFontSize(size).setAlpha(1).setScale(1.3);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 180, ease: 'Back.easeOut' });
    if (this._comboFadeEvent) this._comboFadeEvent.remove(false);
    this._comboFadeEvent = this.time.delayedCall(1000, () => this.hideCombo());
  }

  hideCombo() {
    if (this._comboFadeEvent) {
      this._comboFadeEvent.remove(false);
      this._comboFadeEvent = null;
    }
    this.tweens.add({ targets: this.comboText, alpha: 0, duration: 300 });
  }

  flashCombo() {
    const f = this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0xffffff, 0.18)
      .setOrigin(0, 0)
      .setDepth(239);
    this.tweens.add({ targets: f, alpha: 0, duration: 200, onComplete: () => f.destroy() });
  }

  refreshWater(charges, capacity) {
    this.waterIndicator.setText(`💧 ${charges}/${capacity}`);
    this.waterIndicator.setColor(charges > 0 ? '#6B92BC' : '#9B9389');
  }

  // --- Contextual interaction prompt (Sprint 9) -----------------------------

  showInteractPrompt(text, actionable) {
    this.interactPrompt.setText(text);
    this.interactPrompt.setColor(actionable ? COLOR_NORMAL : '#9B9389');
    // Suppress while a picker overlay owns the screen.
    if (this._swapOpen || this._plantOpen) {
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
      // raw is the (possibly negative) overtime value; older emits omit it, so fall
      // back to remaining to stay backward compatible.
      this.raw = d.raw !== undefined ? d.raw : d.remaining;
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
    this.subscribe('coins:changed', (d) => this.refreshCoins(d.coins));

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

    // --- Sprint 10c — planting picker + minimap ---
    this.subscribe('bed:plantPrompt', (d) => this.openPlantPicker(d));
    this.subscribe('bed:plantPromptClose', () => this.closePlantPicker());
    this.subscribe('player:moved', (d) => this.updateMinimapPlayer(d.x, d.y));

    // --- Sprint Mobile — minimap toggled/forced from the touch HUD ---
    this.subscribe('minimap:toggle', () => this.toggleMinimap());
    this.subscribe('minimap:setVisible', (visible) => this.setMinimapVisible(visible));

    // --- Sprint 9 — contextual interaction prompt ---
    this.subscribe('interact:nearObject', (d) => this.showInteractPrompt(d.text, d.actionable));
    this.subscribe('interact:leftObject', () => this.hideInteractPrompt());

    // --- Sprint 12 — first-run tutorial hint pills ---
    this.subscribe('tutorial:hint', (d) => this.enqueueTutorial(d));

    // --- Sprint 13 — combo counter ---
    this.subscribe('combat:combo', (d) => this.showCombo(d.count));
    this.subscribe('combat:comboEnd', () => this.hideCombo());

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

  // --- Tutorial hint pills (Sprint 12) --------------------------------------
  // Small non-blocking pills that teach the first-run loop. Queued so two hints
  // never overlap (500ms gap), fade in 300ms, hold, fade out 500ms. Each id only
  // ever arrives once (TutorialSystem dedupes against the save).

  enqueueTutorial(hint) {
    if (!hint || !hint.text) return;
    this._tutorialQueue.push(hint);
    if (!this._tutorialActive) this.showNextTutorial();
  }

  showNextTutorial() {
    if (this._tutorialQueue.length === 0) {
      this._tutorialActive = false;
      return;
    }
    this._tutorialActive = true;
    this.buildTutorialPill(this._tutorialQueue.shift());
  }

  tutorialPosition(position) {
    switch (position) {
      case 'center':
        return { x: VIRTUAL_WIDTH / 2, y: VIRTUAL_HEIGHT / 2 - 90 };
      case 'bottom_center':
        return { x: VIRTUAL_WIDTH / 2, y: VIRTUAL_HEIGHT - 150 };
      case 'top_center':
      default:
        return { x: VIRTUAL_WIDTH / 2, y: 210 };
    }
  }

  buildTutorialPill(hint) {
    const pos = this.tutorialPosition(hint.position);
    const pill = this.add
      .text(pos.x, pos.y, hint.text, {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#F5EFE6',
        align: 'center',
        backgroundColor: 'rgba(20,18,16,0.78)',
        padding: { x: 16, y: 9 },
        stroke: '#141210',
        strokeThickness: 2
      })
      .setOrigin(0.5)
      .setDepth(330)
      .setAlpha(0);

    this.tweens.add({ targets: pill, alpha: 1, duration: 300 });
    this.time.delayedCall(300 + (hint.duration || 4000), () => {
      this.tweens.add({
        targets: pill,
        alpha: 0,
        duration: 500,
        onComplete: () => {
          pill.destroy();
          // 500ms gap before the next pill so they never run together.
          this.time.delayedCall(500, () => this.showNextTutorial());
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

  // --- Planting picker (Sprint 10c) -----------------------------------------
  // Centered overlay shown when the player plants with 2+ different seeds. Each
  // option card shows the plant colour, name, grow days (the strategic info) and
  // its number-key shortcut. Click a card or press its number to plant; Esc /
  // Cancel aborts. GameScene owns the bed and performs the plant on confirm.

  openPlantPicker({ bedIndex, slots, hasGoldenCan }) {
    this.closePlantPicker();
    this._plantSlots = slots;
    this._plantBedIndex = bedIndex;

    const filled = [];
    slots.forEach((pt, i) => {
      if (pt !== null) filled.push({ pt, i });
    });
    if (filled.length === 0) return;
    this._plantOpen = true;
    if (this.interactPrompt) this.interactPrompt.setAlpha(0);

    const cx = VIRTUAL_WIDTH / 2;
    const cy = VIRTUAL_HEIGHT / 2;
    const cardW = 150;
    const cardH = 150;
    const gap = 16;
    const totalW = filled.length * cardW + (filled.length - 1) * gap;
    const panelW = Math.max(totalW + 80, 460);
    const panelH = 300;

    // Light dim so the choice reads as the focus, but the world stays visible.
    this._plantObjects.push(
      this.add
        .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x000000, 0.35)
        .setOrigin(0, 0)
        .setDepth(263)
    );
    this._plantObjects.push(
      this.add
        .rectangle(cx, cy, panelW, panelH, 0x221e1b, 0.97)
        .setStrokeStyle(2, 0x8ab87e)
        .setDepth(264)
    );
    this._plantObjects.push(
      this.add
        .text(cx, cy - panelH / 2 + 22, 'Choose a seed to plant', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(0.5, 0)
        .setDepth(265)
    );

    const startX = cx - totalW / 2 + cardW / 2;
    const rowY = cy - 4;
    filled.forEach((f, n) => {
      const x = startX + n * (cardW + gap);
      const plant = entitiesData.plants[f.pt];
      const color = parseInt(plant.color.replace('#', ''), 16);
      const days = plant.growthDays;

      const card = this.add
        .rectangle(x, rowY, cardW, cardH, 0x2d2926)
        .setStrokeStyle(2, 0x57514b)
        .setDepth(264)
        .setInteractive({ useHandCursor: true });
      const dot = this.add.circle(x, rowY - cardH / 2 + 34, 16, color).setDepth(265);
      const name = this.add
        .text(x, rowY - 4, plant.name, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#F5EFE6',
          align: 'center',
          wordWrap: { width: cardW - 16 }
        })
        .setOrigin(0.5)
        .setDepth(265);
      const daysT = this.add
        .text(x, rowY + 34, `${days} ${days === 1 ? 'day' : 'days'}`, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '16px',
          color: '#8AB87E'
        })
        .setOrigin(0.5)
        .setDepth(265);
      const keyT = this.add
        .text(x, rowY + cardH / 2 - 16, `[${f.i + 1}]`, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#9B9389'
        })
        .setOrigin(0.5)
        .setDepth(265);

      card.on('pointerover', () => card.setStrokeStyle(2, 0xeac34f));
      card.on('pointerout', () => card.setStrokeStyle(2, 0x57514b));
      card.on('pointerup', () => this.confirmPlant(f.i));
      this._plantObjects.push(card, dot, name, daysT, keyT);
    });

    // Golden-can note: it soaks every bed after planting, so the choice matters.
    if (hasGoldenCan) {
      this._plantObjects.push(
        this.add
          .text(cx, cy + panelH / 2 - 58, 'Golden Can: waters all beds after planting', {
            fontFamily: '"SproutLands", "Courier New", monospace',
            fontSize: '13px',
            color: '#EDD49A'
          })
          .setOrigin(0.5)
          .setDepth(265)
      );
    }

    const cancelY = cy + panelH / 2 - 26;
    const cancel = this.add
      .rectangle(cx, cancelY, 180, 34, 0x8a3a3a)
      .setStrokeStyle(2, 0x000000)
      .setDepth(264)
      .setInteractive({ useHandCursor: true });
    const cancelLabel = this.add
      .text(cx, cancelY, 'Cancel (Esc)', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(265);
    cancel.on('pointerup', () => this.cancelPlant());
    this._plantObjects.push(cancel, cancelLabel);
  }

  closePlantPicker() {
    this._plantObjects.forEach((o) => o.destroy());
    this._plantObjects = [];
    this._plantOpen = false;
  }

  onPlantKey(e) {
    if (!this._plantOpen) return;
    if (e.key === 'Escape') {
      this.cancelPlant();
      return;
    }
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= this._plantSlots.length) {
      if (this._plantSlots[n - 1] !== null) this.confirmPlant(n - 1);
    }
  }

  confirmPlant(slotIndex) {
    const plantType = this._plantSlots[slotIndex];
    if (!plantType) return;
    EventBus.emit('bed:plantConfirmed', {
      bedIndex: this._plantBedIndex,
      plantType,
      slotIndex
    });
    this.closePlantPicker();
  }

  cancelPlant() {
    EventBus.emit('bed:plantCancelled', {});
    this.closePlantPicker();
  }

  // --- Minimap (Sprint 10c revised) -----------------------------------------
  // Top-right minimap that samples the organic WorldZoneSystem (irregular zones +
  // the winding river/creeks) rather than flat horizontal bands. A static HOME
  // marker sits at the garden centre; the live cyan player dot updates on the
  // throttled 'player:moved' event (every 300ms). M toggles it.

  createMinimap() {
    const MAP_W = 120;
    const MAP_H = 90;
    const SCALE_X = MAP_W / WORLD_WIDTH;
    const SCALE_Y = MAP_H / WORLD_HEIGHT;
    const SAMPLE = 3; // minimap px per sampled cell
    // River reach for sampling: thickens the thin water enough to read as a
    // connected line at this coarse scale.
    const RIVER_MARGIN = 50;

    // Everything lives in one container drawn at relative (0,0)-based coords so the
    // whole minimap moves by a single setPosition() on resize (the zone Graphics
    // bakes its rects, so it can't be re-anchored any other way without a redraw).
    // layoutHUD positions the container's top-left to the current top-right corner.
    // Depth 150 keeps it ABOVE the mobile touch controls (action buttons sit at depth
    // 100): the bottom-right cluster used to render over the minimap's corner, hiding
    // it. The minimap is non-interactive, so taps still pass through to the button
    // hit zones beneath when (rarely) they overlap. Harmless on desktop (no buttons).
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(150);
    this.minimapContainer = container;
    this.minimapW = MAP_W;
    this.minimapH = MAP_H;

    const bg = this.add.rectangle(0, 0, MAP_W, MAP_H, 0x000000, 0.6).setOrigin(0, 0);
    container.add(bg);

    // Sampled zone + river map, batched into one Graphics (relative coords).
    const zoneGfx = this.add.graphics();
    for (let mx = 0; mx < MAP_W; mx += SAMPLE) {
      for (let my = 0; my < MAP_H; my += SAMPLE) {
        const wx = mx / SCALE_X;
        const wy = my / SCALE_Y;
        const color = this.worldZoneSystem.isNearRiver(wx, wy, RIVER_MARGIN)
          ? this.worldZoneSystem.getZoneColor('river')
          : this.worldZoneSystem.getZoneColor(this.worldZoneSystem.getZoneAt(wx, wy));
        zoneGfx.fillStyle(color, 0.85);
        zoneGfx.fillRect(mx, my, SAMPLE, SAMPLE);
      }
    }
    container.add(zoneGfx);

    // Player dot (updated by player:moved) — relative to the container.
    this.minimapPlayer = this.add.circle(0, 0, 3, 0x00ffff);
    container.add(this.minimapPlayer);

    // Border.
    container.add(
      this.add
        .rectangle(0, 0, MAP_W, MAP_H, 0xffffff, 0)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x888888)
    );

    // Home marker at the garden centre — a yellow flag (rect + orange pennant)
    // with a tiny "HOME" label. Static, so it's always shown while the minimap is.
    const homeX = (GARDEN_X + GARDEN_WIDTH / 2) * SCALE_X;
    const homeY = (GARDEN_Y + GARDEN_HEIGHT / 2) * SCALE_Y;
    container.add([
      this.add.rectangle(homeX, homeY, 8, 6, 0xffd23f),
      this.add.triangle(homeX, homeY - 7, 0, -4, -5, 3, 5, 3, 0xff7a1a),
      this.add
        .text(homeX, homeY + 5, 'HOME', {
          fontFamily: FONT_FAMILY,
          fontSize: '6px',
          color: '#ffd23f'
        })
        .setOrigin(0.5, 0)
    ]);

    this.minimapScaleX = SCALE_X;
    this.minimapScaleY = SCALE_Y;
    // Toggle helpers operate on this list; one container hides/shows every child.
    this._minimapObjects = [container];
  }

  updateMinimapPlayer(x, y) {
    if (!this.minimapPlayer) return;
    // Container-relative: the container itself carries the screen offset.
    this.minimapPlayer.setPosition(x * this.minimapScaleX, y * this.minimapScaleY);
  }

  toggleMinimap() {
    this._minimapVisible = !this._minimapVisible;
    this._minimapObjects.forEach((o) => o.setVisible(this._minimapVisible));
  }

  // Forced show/hide (mobile starts hidden; MAP button toggles). Event payload is
  // the bare boolean, not an object.
  setMinimapVisible(visible) {
    this._minimapVisible = !!visible;
    this._minimapObjects.forEach((o) => o.setVisible(this._minimapVisible));
  }

  // --- HUD layout / live reflow (Sprint Mobile viewport scaling) -------------
  // Positions EVERY persistent HUD element as a function of the current viewport
  // (width/height) and the safe-area insets, rather than baking 1600x900 coords at
  // create(). Called once in create() and again on every Scale Manager 'resize', so
  // rotation portrait<->landscape reflows the HUD live with no page reload.
  //
  // Desktop invariant: at width=1600, height=900, zero insets this reproduces the
  // original hardcoded positions byte-for-byte, so the desktop FIT build is
  // unchanged. The mobile cluster shifts (notch/home-bar insets) and the seed-row
  // relocation only kick in when insets are non-zero / on a touch device.
  layoutHUD(width, height, safe) {
    const pad = 32;
    const isMobile = MobileDetect.isMobile();
    const st = safe.top;
    const sb = safe.bottom;
    const sl = safe.left;
    const sr = safe.right;

    // Sprint mobile-playability: portrait is now supported (no rotate gate). The touch
    // controls seat in a bottom band, so in portrait the bottom HUD clusters (seed
    // slots, interact prompt, bank/ammo) lift above that band instead of sharing the
    // bottom row. Landscape + desktop keep their existing positions exactly.
    const portrait = isMobile && width < height;
    const PORTRAIT_BAND = 230; // reserved bottom control band (joystick + buttons)
    const bandTop = height - sb - PORTRAIT_BAND;

    // Dark backing bars span the full width; the bottom one re-seats to the height.
    if (this.topBar) this.topBar.setPosition(0, 0).setSize(width, 80);
    if (this.bottomBar) this.bottomBar.setPosition(0, height - 80).setSize(width, 80);

    // TOP LEFT — HP + water + coins (clear a left notch and the top bar).
    if (this.hpFill) this.hpFill.setPosition(pad + sl, 40 + st);
    if (this.hpBorder) this.hpBorder.setPosition(pad + sl, 40 + st);
    if (this.hpText) this.hpText.setPosition(pad + sl, 60 + st);
    if (this.waterIndicator) this.waterIndicator.setPosition(pad + sl, 92 + st);
    if (this.coinText) this.coinText.setPosition(300 + sl, 40 + st);

    // TOP CENTER — day + zone + weather + NG+ (drop below the top inset).
    if (this.dayText) this.dayText.setPosition(width / 2, 30 + st);
    if (this.zoneBadge) this.zoneBadge.setPosition(width / 2, 66 + st);
    if (this.weatherIcon) {
      this.weatherIcon.setPosition(
        width / 2 + (this._weatherIsSprite ? 96 : 92),
        (this._weatherIsSprite ? 46 : 32) + st
      );
    }
    if (this.ngPlusIndicator) this.ngPlusIndicator.setPosition(width / 2, 96 + st);

    // TOP RIGHT — timer + mute + overtime (clear a right notch and the top bar).
    if (this.timerText) this.timerText.setPosition(width - 40 - sr, 40 + st);
    if (this.muteIndicator) this.muteIndicator.setPosition(width - 40 - sr, 112 + st);
    if (this.overtimeText) this.overtimeText.setPosition(width - 40 - sr, 78 + st);

    // BOTTOM — seed slots. Portrait: centred just above the control band. Landscape
    // touch: shifted out of the joystick's corner into the central-bottom gap, above
    // the home indicator. Desktop: original bottom-left anchor. Re-anchoring
    // _slotBaseX/Y means later satchel-driven rebuilds land in the same place.
    if (portrait) {
      const count = this.seedSlots ? this.seedSlots.length : 3;
      const rowW = count * this._slotSize + (count - 1) * this._slotGap;
      this._slotBaseX = Math.max(pad + sl, (width - rowW) / 2);
      this._slotBaseY = bandTop - 28;
    } else if (isMobile) {
      this._slotBaseX = 270;
      this._slotBaseY = height - 64 - sb;
    } else {
      this._slotBaseX = pad;
      this._slotBaseY = height - 48;
    }
    this.repositionSeedSlots();
    if (this.seedsLabel) {
      this.seedsLabel.setPosition(this._slotBaseX, this._slotBaseY + 28);
      this.seedsLabel.setVisible(!isMobile); // on mobile the frames are self-evident
    }

    // BOTTOM CENTER — interaction prompt (above the control band in portrait).
    if (this.interactPrompt) {
      this.interactPrompt.setPosition(width / 2, portrait ? bandTop - 64 : height - 112);
    }

    // BOTTOM RIGHT — bank + ammo. Portrait lifts them above the right-hand button
    // cluster; landscape/desktop keep the bottom-right corner (clear of insets).
    if (this.bankText) {
      this.bankText.setPosition(width - pad - sr, portrait ? bandTop - 8 : height - 40 - sb);
    }
    if (this.ammoText) {
      this.ammoText.setPosition(width - pad - sr, portrait ? bandTop - 36 : height - 72 - sb);
    }

    // CENTER RIGHT — combo counter.
    if (this.comboText) this.comboText.setPosition(width * 0.72, height / 2);

    // Minimap — top-right, below the top HUD bar, clear of a right notch.
    if (this.minimapContainer) {
      this.minimapContainer.setPosition(width - this.minimapW - 16 - sr, 96 + st);
    }
  }

  // Move existing seed-slot graphics to the current _slotBaseX/_slotBaseY without a
  // rebuild, so a resize keeps each slot's fill colour (rebuilding would blank them
  // until the next inventory:changed). Mirrors the cx formula in buildSeedSlots.
  repositionSeedSlots() {
    if (!this.seedSlots) return;
    const size = this._slotSize;
    const gap = this._slotGap;
    this.seedSlots.forEach((slot, i) => {
      const cx = this._slotBaseX + i * (size + gap) + size / 2;
      slot.box.setPosition(cx, this._slotBaseY);
      slot.fill.setPosition(cx, this._slotBaseY);
    });
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

  refreshCoins(coins) {
    this.coinText.setText(`🪙 ${coins || 0}`);
  }

  // --- Refreshers -----------------------------------------------------------

  refreshHP() {
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHP, 0, 1);
    this.hpFill.width = HP_BAR_MAX_WIDTH * ratio;
    // Colour the fill by health band: green (healthy) → yellow (wounded) → red.
    const color =
      ratio >= HP_THRESHOLD_HIGH ? HP_COLOR_HIGH
      : ratio >= HP_THRESHOLD_LOW ? HP_COLOR_MID
      : HP_COLOR_LOW;
    this.hpFill.setFillStyle(color);
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
      this.hideOvertime();
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

    // Overtime (Sprint 12): once the day runs past 0:00 the raw timer goes negative.
    // Surface a red countdown of the time left before the pass-out floor — counts
    // DOWN from the full overtime window (e.g. 5:00) to 0:00 as danger climbs.
    if (this.raw < 0 && this.passOutFloorMs > 0) {
      const timeToPassOut = Math.max(0, this.passOutFloorMs + this.raw);
      this.overtimeText.setText(`⚠ PASS OUT IN ${formatTime(timeToPassOut)}`);
      this.showOvertime();
    } else {
      this.hideOvertime();
    }
  }

  // --- Overtime countdown (Sprint 12) ---------------------------------------

  showOvertime() {
    this.overtimeText.setVisible(true);
    if (this._overtimePulse) return;
    this._overtimePulse = this.tweens.add({
      targets: this.overtimeText,
      alpha: { from: 1, to: 0.35 },
      duration: 450,
      yoyo: true,
      repeat: -1
    });
  }

  hideOvertime() {
    if (this._overtimePulse) {
      this._overtimePulse.stop();
      this._overtimePulse = null;
    }
    if (this.overtimeText) {
      this.overtimeText.setAlpha(1);
      this.overtimeText.setVisible(false);
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
    this.scale.off('resize', this.onResize, this);
    if (this.touchControls) {
      this.touchControls.destroy();
      this.touchControls = null;
    }
    this._busHandlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._busHandlers = [];
    this.stopPulse();
    this.hideOvertime();
  }
}
