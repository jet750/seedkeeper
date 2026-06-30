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
  SECONDARY_SLOT_COUNT,
  MANA_BAR_MAX_WIDTH,
  MANA_BAR_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GARDEN_CENTER_X,
  GARDEN_CENTER_Y,
  WORLD_MAP_TEXTURE_KEY
} from '../core/Constants.js';
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

// --- In-scene overlay layout (Sprint mobile-playability-2) -----------------
// The plant/swap pickers and transient popups were authored at fixed 1600x900
// virtual coords, so under the mobile RESIZE scale mode (UIScene's coord space ==
// live screen px) they rendered off-screen — the planting blocker. They now lay out
// from the LIVE viewport via _vp() + these named metrics, so they sit on-screen in
// either orientation and reflow on rotation. On desktop (FIT, 1600x900, zero insets)
// the panel simply centres in the larger space — still fully usable, just not pinned
// to the old hardcoded pixel. All sizes are tunable.
const CHOICE_PANEL_MAX_W = 460; // widest the picker panel grows (desktop cap)
const CHOICE_MARGIN = 18; // gap kept from the screen edges / safe insets
const CHOICE_HEADER_H = 70; // title + subtitle zone at the panel top
const CHOICE_FOOTER_H = 64; // Cancel-button zone at the panel bottom
const CHOICE_NOTE_H = 28; // extra note line (e.g. golden-can) above the footer
const CHOICE_ROW_H = 56; // natural per-option row height
const CHOICE_ROW_H_MIN = 36; // floor when shrinking rows to fit a short screen
const CHOICE_ROW_GAP = 10; // gap between option rows
const CHOICE_ROW_PAD = 16; // inset of a row inside the panel
const ACCENT_GOLD = 0xd4a83f;
const ACCENT_BOTANICAL = 0x8ab87e;

// --- Persistent minimap (Sprint minimap-realmap-seed-chest) -----------------
// The small corner minimap (removed in a prior mobile sprint for colliding with the
// touch buttons) re-added, now showing the REAL world via the cached world-map
// texture. Top-LEFT, below the stat-bar cluster — the opposite end of the screen from
// the bottom control clusters (joystick + diamond), so the old collision can't recur.
const MINIMAP_SIZE = 116; // on-screen square size (desktop / where space allows)
const MINIMAP_TOP = 116; // gap from the top inset to clear the HP/mana/water cluster
const MINIMAP_PAD = 32; // left inset (matches the HUD pad)
const MINIMAP_MIN = 64; // floor when a short landscape screen squeezes it
const MINIMAP_BG = 0x141210; // backing fill (shown before the world texture exists)
const MINIMAP_BORDER = 0x4d4843; // frame border (matches UI dividers)
const MINIMAP_HOME = 0xffd23f; // HOME marker (garden centre)
const MINIMAP_YOU = 0x00ffff; // live YOU marker (player)

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
    // Persistent minimap (Sprint minimap-realmap-seed-chest). Player starts at the
    // garden centre; the live YOU marker tracks 'player:moved'. _minimapRect is the
    // current on-screen {x,y,size} the markers map world coords onto.
    this._playerPos = { x: GARDEN_CENTER_X, y: GARDEN_CENTER_Y };
    this._minimapRect = null;
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
    // Secondary-slot strip + mana scaffold (Sprint control-scheme-combat-input)
    this._secActive = 1;
    this._manaUnlocked = false; // bar stays hidden until the first spell unlock
    this._mana = 0;
    this._manaMax = 0;
    // Mobile radial overlay state (Phase D)
    this._radialOpen = false;
    this._radialObjects = [];
    this._radialSlots = [];
    this._radialCenter = { x: 0, y: 0 };
    this._radialSel = 1;
    // Which secondary slots are SELECTABLE (Sprint magic-1). Slot 1 (ranged) always;
    // a spell slot joins once purified at the Mage Mart ('secondary:unlocks'). Drives
    // the lock badge / dim in both the desktop strip and the mobile radial.
    this._unlockedSlots = new Set([1]);
    // Per-slot metadata (Sprint magic-2): { slot → { cost, unlocked, name } } for the
    // mana-cost + lock labels on the strip + radial ('secondary:meta').
    this._slotMeta = {};
  }

  create() {
    this.buildHud();
    this.subscribeAll();
    this.refreshHP();
    this.refreshZone();
    this.refreshTimer();

    // Number keys / Esc drive the swap picker (Sprint 7) and the planting picker
    // (Sprint 10c) — each only responds while its own picker is open.
    this.input.keyboard.on('keydown', (e) => this.onSwapKey(e));
    this.input.keyboard.on('keydown', (e) => this.onPlantKey(e));
    // M opens the full-screen pause map (Sprint mobile-playability-2 — replaced the
    // persistent minimap). GameScene owns the open/pause; mobile uses the MAP button.
    this.input.keyboard.on('keydown-M', () => EventBus.emit('game:mapRequested', {}));
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

    // In-scene overlays are drawn from the live viewport (not baked at create), so a
    // rotation/toolbar resize must rebuild any open picker at the new dimensions —
    // otherwise it would keep last orientation's geometry. Rebuilt from stored state.
    if (this._plantOpen) {
      this.openPlantPicker({
        bedIndex: this._plantBedIndex,
        slots: this._plantSlots,
        hasGoldenCan: this._plantHasGoldenCan
      });
    }
    if (this._swapOpen) this.openSwapPicker(this._swapSlots, this._swapNewType);
  }

  // Live viewport + safe insets. Under the mobile RESIZE scale mode this scene's
  // coordinate space IS the on-screen px, so width/height track the real device and
  // the insets apply 1:1. On desktop (FIT) it resolves to 1600x900 with zero insets.
  _vp() {
    const w = this.scale.width;
    const h = this.scale.height;
    const safe = MobileDetect.isMobile()
      ? MobileDetect.getRawInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };
    return { w, h, cx: w / 2, cy: h / 2, safe };
  }

  // --- HUD construction -----------------------------------------------------

  buildHud() {
    const pad = 32;

    // Semi-transparent dark bar behind the TOP HUD cluster so the text reads clearly
    // over any garden/forest background (Sprint 8 polish). Created first so every HUD
    // element draws on top of it; layoutHUD re-spans it to the current width. The old
    // bottom grey bar was removed (Sprint mobile-playability-2 — it conveyed nothing;
    // the seed inventory now sits in its own bottom strip/tray).
    this.topBar = this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, 80, 0x000000, 0.42)
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

    // TOP LEFT (directly under the HP bar) — mana bar SCAFFOLD (Sprint control-scheme-
    // combat-input). Dormant: renders only after the first spell unlock (none exist
    // yet), so it starts hidden. Built here so it's ready; layoutHUD seats it under HP.
    this.manaFill = this.add
      .rectangle(pad, 62, MANA_BAR_MAX_WIDTH, MANA_BAR_HEIGHT, 0x4a78c8)
      .setOrigin(0, 0.5)
      .setVisible(false);
    this.manaBorder = this.add
      .rectangle(pad, 62, MANA_BAR_MAX_WIDTH, MANA_BAR_HEIGHT)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x9ab4dc)
      .setFillStyle()
      .setVisible(false);

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

    // Corrupted-souls counter (Sprint magic-1) — the third currency. Sits directly
    // under the coin readout in the same left-of-centre cluster, tinted the corrupted-
    // spirit purple the Mage Mart uses. Always visible; updated via 'souls:changed'.
    this.soulsText = this.add
      .text(300, 64, '👻 0', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#C29BE0'
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

    // BOTTOM — seed slot row (real plant-color circles in Sprint 2). Relocated to a
    // clean, centred bottom strip in Sprint mobile-playability-2 (was floating
    // bottom-left / mid-playfield in portrait). A contained tray sits behind the row
    // so it reads as an intentional inventory strip, not stray slots; layoutHUD sizes
    // and seats both the tray and the slots from the live viewport.
    this._slotSize = 40;
    this._slotGap = 12;
    this._slotBaseX = pad;
    this._slotBaseY = VIRTUAL_HEIGHT - 48;
    this.seedTray = this.add
      .rectangle(0, 0, 10, 10, 0x000000, 0.42)
      .setOrigin(0.5, 0.5)
      .setDepth(-1);
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

    // BOTTOM RIGHT — ranged ammo counter, hidden until equipped. (The plant-bank
    // readout that used to live here was removed in Sprint mobile-playability-2.)
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

    // Desktop keeps the 1-5 secondary strip; on mobile it's removed entirely (Sprint
    // combat-input-mobile-consolidated). The radial (long-press the ability button) is
    // the sole mobile switcher and the ability button's icon shows what's loaded — so the
    // strip is redundant there and removing it clears the strip-over-buttons (landscape)
    // and strip-over-tray (portrait) overlaps.
    if (!MobileDetect.isMobile()) this.buildSecondaryStrip();

    // Persistent minimap (Sprint minimap-realmap-seed-chest) — built last so it draws
    // over the top backing bar; layoutMinimap seats + sizes it from the live viewport.
    this.buildMinimap();
  }

  // --- Persistent minimap (Sprint minimap-realmap-seed-chest) ----------------
  // Build the corner minimap objects once: a backing fill, the cached real-world image
  // (created only once GameScene's texture exists — guarded so it never renders as a
  // missing-texture swatch), a frame border, the static HOME marker and the live YOU
  // marker. All positioning/sizing happens in layoutMinimap so it reflows on resize.
  buildMinimap() {
    this.minimapBg = this.add.rectangle(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, MINIMAP_BG, 0.85).setOrigin(0, 0).setDepth(5);
    this.minimapImg = this.textures.exists(WORLD_MAP_TEXTURE_KEY)
      ? this.add.image(0, 0, WORLD_MAP_TEXTURE_KEY).setOrigin(0, 0).setDepth(6)
      : null;
    this.minimapBorder = this.add
      .rectangle(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)
      .setOrigin(0, 0)
      .setStrokeStyle(2, MINIMAP_BORDER)
      .setFillStyle()
      .setDepth(7);
    this.minimapHome = this.add.rectangle(0, 0, 7, 7, MINIMAP_HOME).setDepth(8).setVisible(false);
    this.minimapYou = this.add.circle(0, 0, 4, MINIMAP_YOU).setStrokeStyle(1.5, 0xffffff).setDepth(9).setVisible(false);
  }

  // The world texture became available (or was regenerated) after the minimap was
  // built — create the image now and re-seat everything.
  onWorldMapReady() {
    if (!this.minimapImg && this.textures.exists(WORLD_MAP_TEXTURE_KEY)) {
      this.minimapImg = this.add.image(0, 0, WORLD_MAP_TEXTURE_KEY).setOrigin(0, 0).setDepth(6);
    }
    this.layoutAll(this.scale.width, this.scale.height);
  }

  // Seat + size the minimap top-left, below the stat cluster and clear of the bottom
  // control band in BOTH orientations (the size is clamped against the space left above
  // the controls so a short landscape screen can't push it under the joystick).
  layoutMinimap(width, height, safe) {
    if (!this.minimapBg) return;
    const isMobile = MobileDetect.isMobile();
    const portrait = isMobile && width < height;
    // Reach (px up from the bottom) the control clusters / home indicator occupy. Zero
    // on desktop (no touch controls); a portrait reserves the full control band.
    const controlReach = portrait ? 230 : isMobile ? 150 : 0;
    const top = safe.top + MINIMAP_TOP;
    const bottomLimit = height - safe.bottom - controlReach - 12;
    const size = Math.max(MINIMAP_MIN, Math.min(MINIMAP_SIZE, bottomLimit - top));
    const x = safe.left + MINIMAP_PAD;
    const y = top;

    this._minimapRect = { x, y, size };
    this.minimapBg.setPosition(x, y).setSize(size, size);
    this.minimapBorder.setPosition(x, y).setSize(size, size);
    if (this.minimapImg) this.minimapImg.setPosition(x, y).setDisplaySize(size, size).setVisible(true);

    // HOME marker — static, at the garden centre.
    const hx = x + (GARDEN_CENTER_X / WORLD_WIDTH) * size;
    const hy = y + (GARDEN_CENTER_Y / WORLD_HEIGHT) * size;
    this.minimapHome.setPosition(hx, hy).setVisible(true);

    // YOU marker — live; seat it at the last known player position.
    this.updateMinimapPlayer();
  }

  // Reposition the live YOU dot from the last 'player:moved' broadcast. Cheap — a single
  // marker move, the only per-update work the minimap does (the map itself is cached).
  updateMinimapPlayer() {
    if (!this.minimapYou || !this._minimapRect) return;
    const { x, y, size } = this._minimapRect;
    const px = x + (this._playerPos.x / WORLD_WIDTH) * size;
    const py = y + (this._playerPos.y / WORLD_HEIGHT) * size;
    this.minimapYou.setPosition(px, py).setVisible(true);
  }

  // --- Secondary-slot strip (Sprint control-scheme-combat-input) ------------
  // A compact row of SECONDARY_SLOT_COUNT mini-slots, bottom-right. Slot 1 = ranged
  // (functional); slots 2-7 are spell SELECTORS — dimmed + 🔒 until that spell is
  // purified at the Mage Mart (Sprint magic-1), then they brighten + show their index.
  // The active slot gets a gold border. Driven over EventBus ('secondary:changed' /
  // 'secondary:unlocks'); layoutHUD seats the row per viewport.
  buildSecondaryStrip() {
    this._secSize = 30;
    this._secGap = 6;
    this.secondarySlots = [];
    for (let i = 0; i < SECONDARY_SLOT_COUNT; i++) {
      const box = this.add
        .rectangle(0, 0, this._secSize, this._secSize, 0x2d2926, 0.92)
        .setStrokeStyle(2, 0x57514b)
        .setDepth(5);
      const glyph = this.add
        .text(0, 0, i === 0 ? '\u{1f3f9}' : '✦', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '16px',
          color: '#F5EFE6'
        })
        .setOrigin(0.5)
        .setDepth(6);
      // A locked (un-purified) spell slot is dimmed; slot 1 + any purified spell are
      // full-bright (Sprint magic-1). The corner badge shows 🔒 when locked, else index.
      const unlocked = this._unlockedSlots.has(i + 1);
      if (!unlocked) glyph.setAlpha(0.35);
      const num = this.add
        .text(0, 0, unlocked ? `${i + 1}` : '🔒', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '10px',
          color: '#9B9389'
        })
        .setOrigin(1, 1)
        .setDepth(6);
      // Mana-cost label under each spell slot (Sprint magic-2). Empty for ranged + any
      // slot we have no meta for yet; filled by refreshSlotMeta. Mana-blue to read as
      // "this costs mana", distinct from the gold slot index.
      const meta = this._slotMeta[i + 1];
      const cost = this.add
        .text(0, 0, meta && meta.cost != null ? `${meta.cost}` : '', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '10px',
          color: '#7FB0E0'
        })
        .setOrigin(0.5, 0)
        .setDepth(6);
      this.secondarySlots.push({ box, glyph, num, cost });
    }
    this.refreshSecondary(this._secActive);
  }

  // Spell purification changed which slots are selectable (Sprint magic-1). Store the
  // set and rebuild the desktop strip so newly-purified slots brighten. Mobile has no
  // strip — the radial reads _unlockedSlots fresh each time it opens.
  refreshUnlocks(slots) {
    this._unlockedSlots = new Set([1, ...(slots || [])]);
    if (this.secondarySlots && this.secondarySlots.length) {
      this.secondarySlots.forEach((s) => { s.box.destroy(); s.glyph.destroy(); s.num.destroy(); s.cost.destroy(); });
      this.buildSecondaryStrip();
      this.layoutAll(this.scale.width, this.scale.height);
    }
  }

  // Per-slot mana cost + lock state changed (Sprint magic-2, 'secondary:meta'). Store it
  // and rebuild the strip so each spell slot shows its cost. Mobile radial reads it live.
  refreshSlotMeta(meta) {
    this._slotMeta = {};
    (meta || []).forEach((m) => { this._slotMeta[m.slot] = m; });
    if (this.secondarySlots && this.secondarySlots.length) {
      this.secondarySlots.forEach((s) => { s.box.destroy(); s.glyph.destroy(); s.num.destroy(); s.cost.destroy(); });
      this.buildSecondaryStrip();
      this.layoutAll(this.scale.width, this.scale.height);
    }
  }

  // Insufficient-mana denial cue (Sprint magic-2): a brief red pulse on the mana bar +
  // the active spell slot, so a blocked cast reads as "no mana", never a dropped input.
  flashSpellDenied() {
    if (this.manaFill && this.manaBorder && this.manaBorder.visible) {
      this.manaBorder.setStrokeStyle(2, 0xff5a5a);
      this.tweens.add({
        targets: this.manaFill,
        alpha: { from: 1, to: 0.35 },
        yoyo: true,
        duration: 90,
        repeat: 1,
        onComplete: () => {
          this.manaFill.setAlpha(1);
          this.manaBorder.setStrokeStyle(2, 0x9ab4dc);
        }
      });
    }
    if (this.secondarySlots && this.secondarySlots.length) {
      const s = this.secondarySlots[this._secActive - 1];
      if (s && s.box) {
        s.box.setFillStyle(0x6a2a2a, 0.95);
        this.tweens.add({
          targets: s.box,
          alpha: { from: 1, to: 0.45 },
          yoyo: true,
          duration: 90,
          repeat: 1,
          onComplete: () => {
            s.box.setFillStyle(0x2d2926, 0.92);
            s.box.setAlpha(1);
          }
        });
      }
    }
  }

  // Highlight the active secondary slot; called on 'secondary:changed' and on build.
  refreshSecondary(slot, total) {
    // Track the active slot even on mobile (no strip there) — the radial opens centred
    // on it (_radialSel = _secActive) and the ability button's icon follows it.
    this._secActive = slot;
    if (!this.secondarySlots || !this.secondarySlots.length) return; // mobile: strip removed
    if (total && total !== this.secondarySlots.length) {
      // Slot count changed (e.g. SECONDARY_SLOT_COUNT retune) — rebuild to match.
      this.secondarySlots.forEach((s) => { s.box.destroy(); s.glyph.destroy(); s.num.destroy(); s.cost.destroy(); });
      this.buildSecondaryStrip();
      this.layoutAll(this.scale.width, this.scale.height);
      return;
    }
    this.secondarySlots.forEach((s, i) => {
      const active = i + 1 === this._secActive;
      s.box.setStrokeStyle(2, active ? 0xeac34f : 0x57514b);
      s.box.setScale(active ? 1.12 : 1);
      s.glyph.setScale(active ? 1.12 : 1);
    });
  }

  // --- Mana bar scaffold (Sprint control-scheme-combat-input) ---------------
  // DORMANT until the first spell unlock. No spell unlocks exist yet, so by default
  // the bar stays hidden — but the render + gating are built and wired so the spell
  // sprint only has to call unlockMana()/emit mana:changed.

  unlockMana({ mana, max } = {}) {
    this._manaUnlocked = true;
    this._manaMax = max != null ? max : (this._manaMax || 0);
    this._mana = mana != null ? mana : this._manaMax;
    this.manaFill.setVisible(true);
    this.manaBorder.setVisible(true);
    this.refreshMana(this._mana, this._manaMax);
  }

  refreshMana(mana, max) {
    if (mana != null) this._mana = mana;
    if (max != null) this._manaMax = max;
    if (!this._manaUnlocked) return; // stays hidden until unlocked
    const ratio = this._manaMax > 0 ? Phaser.Math.Clamp(this._mana / this._manaMax, 0, 1) : 0;
    this.manaFill.width = MANA_BAR_MAX_WIDTH * ratio;
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
    const { w, h } = this._vp();
    const f = this.add
      .rectangle(0, 0, w, h, 0xffffff, 0.18)
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
    // TODO: surface bank on a garden sign/chest — the BANK readout was removed from
    // active play (Sprint mobile-playability-2); it only matters once the
    // sortie/extraction economy exists. The shops still listen to bank:updated.
    this.subscribe('coins:changed', (d) => this.refreshCoins(d.coins));
    this.subscribe('souls:changed', (d) => this.refreshSouls(d.souls));

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

    // --- Sprint 10c — planting picker ---
    this.subscribe('bed:plantPrompt', (d) => this.openPlantPicker(d));
    this.subscribe('bed:plantPromptClose', () => this.closePlantPicker());

    // --- Sprint 9 — contextual interaction prompt ---
    this.subscribe('interact:nearObject', (d) => this.showInteractPrompt(d.text, d.actionable));
    this.subscribe('interact:leftObject', () => this.hideInteractPrompt());

    // --- Sprint 12 — first-run tutorial hint pills ---
    this.subscribe('tutorial:hint', (d) => this.enqueueTutorial(d));

    // --- Sprint 13 — combo counter ---
    this.subscribe('combat:combo', (d) => this.showCombo(d.count));
    this.subscribe('combat:comboEnd', () => this.hideCombo());

    // --- Sprint control-scheme-combat-input — secondary slots + mana scaffold + radial ---
    this.subscribe('secondary:changed', (d) => this.refreshSecondary(d.slot, d.total));
    // Spell purification (Sprint magic-1): which secondary slots are now selectable.
    this.subscribe('secondary:unlocks', (d) => this.refreshUnlocks(d.slots));
    // Per-slot mana cost + lock labels (Sprint magic-2).
    this.subscribe('secondary:meta', (d) => this.refreshSlotMeta(d.meta));
    // Insufficient-mana denial — grey the active slot + a soft cue, NOT a dropped input.
    this.subscribe('spell:denied', () => this.flashSpellDenied());
    // Mana scaffold: dormant until the first spell unlock (no spells yet → unused).
    this.subscribe('mana:unlocked', (d) => this.unlockMana(d));
    this.subscribe('mana:changed', (d) => this.refreshMana(d.mana, d.max));
    // Mobile radial secondary-select (Phase D).
    this.subscribe('combat:radialOpen', (d) => this.openRadial(d));
    this.subscribe('combat:radialMove', (d) => this.moveRadial(d));
    this.subscribe('combat:radialClose', () => this.closeRadial());

    // --- Sprint 11 — weather, world details, dictionary, notices ---
    // Persistent minimap (Sprint minimap-realmap-seed-chest): live YOU marker + a
    // rebuild hook if the world texture lands after the HUD was built.
    this.subscribe('player:moved', (d) => {
      this._playerPos = { x: d.x, y: d.y };
      this.updateMinimapPlayer();
    });
    this.subscribe('worldmap:ready', () => this.onWorldMapReady());

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
    const { w, safe } = this._vp();
    const t = this.add
      .text(w / 2, 150 + safe.top, text, {
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
    const vp = this._vp();
    const cx = vp.cx;
    const cy = vp.cy;
    const w = Math.min(640, vp.w - 2 * CHOICE_MARGIN);
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
    const vp = this._vp();
    const w = 380;
    const h = 96;
    const pad = 24;
    const y = 160 + vp.safe.top; // below the timer / mute / NG+ indicators (clear a notch)
    const xHidden = vp.w + w;
    const xShown = vp.w - pad - vp.safe.right - w / 2;

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
    const { w, h, safe } = this._vp();
    switch (position) {
      case 'center':
        return { x: w / 2, y: h / 2 - 90 };
      case 'bottom_center':
        return { x: w / 2, y: h - 150 - safe.bottom };
      case 'top_center':
      default:
        return { x: w / 2, y: 200 + safe.top };
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
    if (this.interactPrompt) this.interactPrompt.setAlpha(0);

    const newName = entitiesData.plants[newPlantType]
      ? entitiesData.plants[newPlantType].name
      : newPlantType;

    // Live-viewport centred list (Sprint mobile-playability-2) — was a fixed
    // bottom-anchored 1600x900 strip that rendered off-screen on a phone.
    this._buildChoicePanel({
      accent: ACCENT_GOLD,
      title: 'Swap which seed?',
      subtitle: `Picking up: ${newName}`,
      rows: filled.map((f) => {
        const plant = entitiesData.plants[f.pt];
        return {
          color: parseInt(plant.color.replace('#', ''), 16),
          label: plant.name,
          right: `[${f.i + 1}]`,
          onPick: () => this.confirmSwap(f.i)
        };
      }),
      onCancel: () => this.cancelSwap(),
      store: this._swapObjects
    });
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
    this._plantHasGoldenCan = hasGoldenCan;

    const filled = [];
    slots.forEach((pt, i) => {
      if (pt !== null) filled.push({ pt, i });
    });
    if (filled.length === 0) return;
    this._plantOpen = true;
    if (this.interactPrompt) this.interactPrompt.setAlpha(0);

    // Live-viewport centred list (Sprint mobile-playability-2) — was a fixed
    // 1600x900 card row centred at (800,450), i.e. off-screen on a phone (THE
    // planting blocker). Grow days stay on each row as the strategic info.
    this._buildChoicePanel({
      accent: ACCENT_BOTANICAL,
      title: 'Choose a seed to plant',
      rows: filled.map((f) => {
        const plant = entitiesData.plants[f.pt];
        const days = plant.growthDays;
        return {
          color: parseInt(plant.color.replace('#', ''), 16),
          label: plant.name,
          right: `${days} ${days === 1 ? 'day' : 'days'}  ·  [${f.i + 1}]`,
          onPick: () => this.confirmPlant(f.i)
        };
      }),
      note: hasGoldenCan ? 'Golden Can: waters all beds after planting' : null,
      onCancel: () => this.cancelPlant(),
      store: this._plantObjects
    });
  }

  // Shared centred modal panel for the plant + swap pickers (Sprint mobile-playability-2).
  // Draws a dim full-screen backdrop, a panel sized to the LIVE viewport (so it fits a
  // phone in either orientation and reflows on rotation), a title (+ optional subtitle),
  // a vertical list of selectable rows, an optional note, and a Cancel button that clears
  // the bottom safe-area inset. Every object is pushed into `store` so the caller's
  // close() tears them all down. Rows: { color, label, right, onPick }.
  _buildChoicePanel({ accent, title, subtitle, rows, note, onCancel, store }) {
    const { w, h, cx, safe } = this._vp();
    const n = rows.length;

    // Vertical budget between the safe insets; shrink row height to fit a short screen.
    const availTop = safe.top + CHOICE_MARGIN;
    const availBottom = h - safe.bottom - CHOICE_MARGIN;
    const availH = availBottom - availTop;
    const noteH = note ? CHOICE_NOTE_H : 0;
    const chromeH = CHOICE_HEADER_H + noteH + CHOICE_FOOTER_H;
    let rowH = CHOICE_ROW_H;
    if (n * rowH + (n - 1) * CHOICE_ROW_GAP > availH - chromeH) {
      rowH = Math.max(CHOICE_ROW_H_MIN, (availH - chromeH - (n - 1) * CHOICE_ROW_GAP) / n);
    }
    const rowsH = n * rowH + (n - 1) * CHOICE_ROW_GAP;

    const panelW = Math.min(w - 2 * CHOICE_MARGIN, CHOICE_PANEL_MAX_W);
    const panelH = CHOICE_HEADER_H + noteH + rowsH + CHOICE_FOOTER_H;
    const panelTop = Math.max(availTop, (h - panelH) / 2);
    const panelLeft = cx - panelW / 2;
    const rowW = panelW - 2 * CHOICE_ROW_PAD;

    // Dim backdrop — deliberately NON-interactive. The picker is opened synchronously
    // from the touch-interact button's pointerdown, so an interactive backdrop would
    // catch that very tap's pointerup and cancel the picker the instant it opened. Dim
    // only; dismissal is the Cancel button / Esc / walking away from the bed.
    store.push(
      this.add.rectangle(0, 0, w, h, 0x000000, 0.5).setOrigin(0, 0).setDepth(260)
    );

    store.push(
      this.add
        .rectangle(cx, panelTop + panelH / 2, panelW, panelH, 0x221e1b, 0.98)
        .setStrokeStyle(2, accent)
        .setDepth(264)
    );
    store.push(
      this.add
        .text(cx, panelTop + 18, title, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#EDD49A',
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(266)
    );
    if (subtitle) {
      store.push(
        this.add
          .text(cx, panelTop + 46, subtitle, {
            fontFamily: '"SproutLands", "Courier New", monospace',
            fontSize: '14px',
            color: '#D1CCC6',
            align: 'center'
          })
          .setOrigin(0.5, 0)
          .setDepth(266)
      );
    }

    const rowTop = panelTop + CHOICE_HEADER_H;
    rows.forEach((row, i) => {
      const ry = rowTop + i * (rowH + CHOICE_ROW_GAP) + rowH / 2;
      const rect = this.add
        .rectangle(cx, ry, rowW, rowH, 0x2d2926)
        .setStrokeStyle(2, 0x57514b)
        .setDepth(265)
        .setInteractive({ useHandCursor: true });
      const dot = this.add.circle(panelLeft + CHOICE_ROW_PAD + 18, ry, 11, row.color).setDepth(266);
      const label = this.add
        .text(panelLeft + CHOICE_ROW_PAD + 40, ry, row.label, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '17px',
          fontStyle: 'bold',
          color: '#F5EFE6'
        })
        .setOrigin(0, 0.5)
        .setDepth(266);
      const right = this.add
        .text(panelLeft + panelW - CHOICE_ROW_PAD, ry, row.right || '', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '15px',
          color: '#8AB87E'
        })
        .setOrigin(1, 0.5)
        .setDepth(266);
      rect.on('pointerover', () => rect.setStrokeStyle(2, 0xeac34f));
      rect.on('pointerout', () => rect.setStrokeStyle(2, 0x57514b));
      rect.on('pointerup', () => row.onPick());
      store.push(rect, dot, label, right);
    });

    if (note) {
      store.push(
        this.add
          .text(cx, rowTop + rowsH + 6, note, {
            fontFamily: '"SproutLands", "Courier New", monospace',
            fontSize: '13px',
            color: '#EDD49A',
            align: 'center'
          })
          .setOrigin(0.5, 0)
          .setDepth(266)
      );
    }

    const cancelY = panelTop + panelH - CHOICE_FOOTER_H / 2;
    const cancel = this.add
      .rectangle(cx, cancelY, Math.min(220, rowW), 38, 0x8a3a3a)
      .setStrokeStyle(2, 0x000000)
      .setDepth(265)
      .setInteractive({ useHandCursor: true });
    const cancelLabel = this.add
      .text(cx, cancelY, 'Cancel', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(266);
    cancel.on('pointerup', () => onCancel());
    store.push(cancel, cancelLabel);
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

  // --- Mobile radial secondary-select (Sprint control-scheme-combat-input) ---
  // Opened by a long-press on the Ranged-Magic button (TouchControlSystem) while the
  // world runs in slow-mo (GameScene). Draws SECONDARY_SLOT_COUNT options on a ring
  // around the press point (clamped on-screen via _vp + safe insets), tracks the drag
  // to highlight a sector, and on release sets the active secondary. Slot 1 = ranged;
  // slots 2-5 are dimmed spell selectors (inert).

  openRadial({ cx, cy } = {}) {
    this.closeRadial(true); // silent teardown of any prior radial
    const vp = this._vp();
    const R = 92; // ring radius from the hub to each option
    const margin = 76; // keep the whole ring clear of the screen edges / insets
    const ccx = Phaser.Math.Clamp(cx != null ? cx : vp.cx, vp.safe.left + margin, vp.w - vp.safe.right - margin);
    const ccy = Phaser.Math.Clamp(cy != null ? cy : vp.cy, vp.safe.top + margin, vp.h - vp.safe.bottom - margin);
    this._radialCenter = { x: ccx, y: ccy };
    this._radialOpen = true;
    this._radialSel = this._secActive;
    this._radialNodes = [];

    this._radialObjects.push(
      this.add.rectangle(0, 0, vp.w, vp.h, 0x000000, 0.45).setOrigin(0, 0).setDepth(350)
    );
    this._radialObjects.push(
      this.add.circle(ccx, ccy, 26, 0x221e1b, 0.95).setStrokeStyle(2, 0xeac34f).setDepth(351)
    );
    this._radialObjects.push(
      this.add
        .text(ccx, ccy, 'PICK', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '12px',
          color: '#EDD49A'
        })
        .setOrigin(0.5)
        .setDepth(352)
    );

    const total = SECONDARY_SLOT_COUNT;
    for (let i = 0; i < total; i++) {
      const ang = -Math.PI / 2 + (i / total) * Math.PI * 2; // start at top, clockwise
      const ox = ccx + Math.cos(ang) * R;
      const oy = ccy + Math.sin(ang) * R;
      // A spell slot is LOCKED until purified at the Mage Mart (Sprint magic-1): render
      // it dimmed with a 🔒 badge. Releasing on a locked sector still emits the select,
      // but Player.selectSecondary rejects an un-purified slot, so it stays on the
      // current pick. Once purified the slot brightens and becomes selectable (still
      // inert to FIRE — no spell effects yet). Slot 1 (ranged) is always unlocked.
      const locked = !this._unlockedSlots.has(i + 1);
      const box = this.add
        .circle(ox, oy, 28, 0x2d2926, locked ? 0.6 : 0.96)
        .setStrokeStyle(2, 0x57514b)
        .setDepth(351);
      const glyph = this.add
        .text(ox, oy, i === 0 ? '\u{1f3f9}' : '✦', {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: '20px',
          color: '#F5EFE6'
        })
        .setOrigin(0.5)
        .setDepth(352);
      if (locked) glyph.setAlpha(0.4);
      const num = this.add
        .text(ox, oy + 20, locked ? '🔒' : `${i + 1}`, {
          fontFamily: '"SproutLands", "Courier New", monospace',
          fontSize: locked ? '12px' : '11px',
          color: '#9B9389'
        })
        .setOrigin(0.5)
        .setDepth(352);
      // Mana-cost label above each unlocked spell node (Sprint magic-2).
      const meta = this._slotMeta[i + 1];
      let costText = null;
      if (!locked && meta && meta.cost != null) {
        costText = this.add
          .text(ox, oy - 22, `${meta.cost}`, {
            fontFamily: '"SproutLands", "Courier New", monospace',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#7FB0E0'
          })
          .setOrigin(0.5)
          .setDepth(352);
      }
      this._radialNodes.push({ box, glyph, ang, locked });
      this._radialObjects.push(box, glyph, num);
      if (costText) this._radialObjects.push(costText);
    }
    this.highlightRadial();
  }

  moveRadial({ x, y } = {}) {
    if (!this._radialOpen || !this._radialNodes) return;
    const dx = x - this._radialCenter.x;
    const dy = y - this._radialCenter.y;
    if (Math.hypot(dx, dy) < 26) return; // deadzone near the hub — keep current pick
    const ang = Math.atan2(dy, dx);
    let best = 0;
    let bestD = Infinity;
    this._radialNodes.forEach((n, i) => {
      const d = Math.abs(Phaser.Math.Angle.Wrap(ang - n.ang));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this._radialSel = best + 1;
    this.highlightRadial();
  }

  highlightRadial() {
    if (!this._radialNodes) return;
    this._radialNodes.forEach((n, i) => {
      const active = i + 1 === this._radialSel;
      n.box.setStrokeStyle(2, active ? 0xeac34f : 0x57514b);
      n.box.setScale(active ? 1.18 : 1);
      n.glyph.setScale(active ? 1.18 : 1);
    });
  }

  closeRadial(silent) {
    if (!this._radialOpen && this._radialObjects.length === 0) return;
    const sel = this._radialSel;
    this._radialObjects.forEach((o) => o.destroy());
    this._radialObjects = [];
    this._radialNodes = null;
    this._radialOpen = false;
    if (!silent) EventBus.emit('secondary:select', { slot: sel });
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

    // Dark backing bar spans the full width behind the top cluster (the bottom grey
    // bar was removed in Sprint mobile-playability-2).
    if (this.topBar) this.topBar.setPosition(0, 0).setSize(width, 80);

    // TOP LEFT — HP + mana + water + coins (clear a left notch and the top bar).
    if (this.hpFill) this.hpFill.setPosition(pad + sl, 40 + st);
    if (this.hpBorder) this.hpBorder.setPosition(pad + sl, 40 + st);
    if (this.hpText) this.hpText.setPosition(pad + sl, 60 + st);
    // Mana bar scaffold sits directly under the HP readout (Sprint control-scheme-
    // combat-input). Hidden by default (dormant); when revealed it pushes the water
    // counter down so nothing overlaps.
    if (this.manaFill) this.manaFill.setPosition(pad + sl, 80 + st);
    if (this.manaBorder) this.manaBorder.setPosition(pad + sl, 80 + st);
    if (this.waterIndicator) this.waterIndicator.setPosition(pad + sl, (this._manaUnlocked ? 100 : 92) + st);
    if (this.coinText) this.coinText.setPosition(300 + sl, 40 + st);
    if (this.soulsText) this.soulsText.setPosition(300 + sl, 64 + st);

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

    // BOTTOM — seed inventory strip (Sprint mobile-playability-2). A contained tray
    // backs the slot row so it reads as one clean strip. Mobile centres the row clear
    // of the joystick/buttons and the home indicator (portrait lifts it above the
    // control band); desktop keeps the bottom-left anchor so the desktop HUD is
    // unchanged. Re-anchoring _slotBaseX/Y means later satchel rebuilds land in place.
    const slotCount = this.seedSlots ? this.seedSlots.length : 3;
    const rowW = slotCount * this._slotSize + (slotCount - 1) * this._slotGap;
    if (portrait) {
      this._slotBaseX = Math.max(pad + sl, (width - rowW) / 2);
      this._slotBaseY = bandTop - 28;
    } else if (isMobile) {
      this._slotBaseX = Math.max(pad + sl, (width - rowW) / 2);
      this._slotBaseY = height - 48 - sb;
    } else {
      this._slotBaseX = pad;
      this._slotBaseY = height - 48;
    }
    this.repositionSeedSlots();
    if (this.seedTray) {
      const trayPad = 12;
      this.seedTray
        .setPosition(this._slotBaseX + rowW / 2, this._slotBaseY)
        .setSize(rowW + trayPad * 2, this._slotSize + trayPad * 2);
    }
    if (this.seedsLabel) {
      this.seedsLabel.setPosition(this._slotBaseX, this._slotBaseY + 28);
      this.seedsLabel.setVisible(!isMobile); // on mobile the frames are self-evident
    }

    // BOTTOM CENTER — interaction prompt (above the control band in portrait).
    if (this.interactPrompt) {
      this.interactPrompt.setPosition(width / 2, portrait ? bandTop - 64 : height - 112);
    }

    // BOTTOM RIGHT — ammo. Portrait lifts it above the right-hand button cluster;
    // landscape/desktop keep the bottom-right corner (clear of insets).
    if (this.ammoText) {
      this.ammoText.setPosition(width - pad - sr, portrait ? bandTop - 36 : height - 72 - sb);
    }

    // CENTER RIGHT — combo counter.
    if (this.comboText) this.comboText.setPosition(width * 0.72, height / 2);

    // BOTTOM RIGHT (above ammo) — secondary-slot strip (Sprint control-scheme-combat-
    // input). Right-aligned; portrait lifts it above the control band.
    if (this.secondarySlots && this.secondarySlots.length) {
      const n = this.secondarySlots.length;
      const size = this._secSize;
      const gap = this._secGap;
      const right = width - pad - sr;
      const secY = portrait ? bandTop - 84 : height - 104 - sb;
      this.secondarySlots.forEach((s, i) => {
        const cx = right - (n - 1 - i) * (size + gap) - size / 2;
        s.box.setPosition(cx, secY);
        s.glyph.setPosition(cx, secY);
        s.num.setPosition(cx + size / 2 - 3, secY + size / 2 - 2);
        if (s.cost) s.cost.setPosition(cx, secY + size / 2 + 1);
      });
    }

    // TOP LEFT (below the stat cluster) — persistent minimap.
    this.layoutMinimap(width, height, safe);
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
    const { cx, cy } = this._vp();
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

  refreshCoins(coins) {
    this.coinText.setText(`🪙 ${coins || 0}`);
  }

  refreshSouls(souls) {
    if (this.soulsText) this.soulsText.setText(`👻 ${souls || 0}`);
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
    this.closeRadial(true);
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
