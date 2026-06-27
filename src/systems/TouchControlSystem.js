// TouchControlSystem.js
//
// The entire mobile control layer: a fixed virtual joystick (left thumb), a
// cluster of action buttons (right thumb), and mobile-only HUD buttons (MAP /
// pause). Both orientations are supported (no rotate gate); layout() branches on
// aspect so the controls reflow live on rotation. Instantiated by UIScene ONLY when
// MobileDetect.isMobile() is true, so desktop never builds a single object here.
//
// It is pure output: every control EMITS an EventBus event (touch:move,
// touch:attack, …). Player/GameScene own the behaviour. That keeps this a thin,
// swappable input surface with no gameplay coupling.

import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import {
  TOUCH_JOYSTICK_BASE_RADIUS,
  TOUCH_JOYSTICK_HANDLE_RADIUS,
  TOUCH_BUTTON_RADIUS,
  TOUCH_BUTTON_LABEL_PX,
  TOUCH_BUTTON_LOCKED_ALPHA,
  MAP_CHEAT_TAP_COUNT,
  MAP_CHEAT_RESET_MS
} from '../core/Constants.js';

export default class TouchControlSystem {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.joystickPointer = null; // Phaser pointer.id currently driving the stick
    this.joystickActive = false;
    this._sceneHandlers = []; // [event, fn] pairs on scene.input, removed on destroy
    this._busHandlers = []; // [event, fn] pairs on EventBus, removed on destroy
    this._winHandlers = []; // [event, fn] pairs on window, removed on destroy

    if (!MobileDetect.isMobile()) return;
    this.active = true;

    // Safe area in virtual px so no control sits under a notch or home bar.
    this.safe = this.computeSafeArea();

    this.createJoystick();
    this.createActionButtons();
    this.createMobileHUDAdjustments();

    // Seat every control at the current viewport. UIScene also calls layout() right
    // after constructing us (and on every Scale 'resize'), but doing it here keeps
    // the controls correct even if that initial pass is ever skipped.
    this.layout(this.scene.scale.width, this.scene.scale.height, this.safe);
  }

  // Raw CSS-pixel safe-area insets. Under the mobile RESIZE scale mode the control
  // layer's coordinate space IS the on-screen CSS-pixel space (game size == display
  // size), so the notch/home-bar insets apply 1:1 with no virtual-space conversion.
  computeSafeArea() {
    return MobileDetect.getRawInsets();
  }

  // Track a scene-level pointer handler so destroy() can detach it.
  _onScene(event, fn) {
    this.scene.input.on(event, fn);
    this._sceneHandlers.push([event, fn]);
  }

  // Track an EventBus handler so destroy() can detach it (EventBus.off needs the
  // exact reference — passing only the event name is a silent no-op).
  _onBus(event, fn) {
    EventBus.on(event, fn);
    this._busHandlers.push([event, fn]);
  }

  _onWin(event, fn) {
    window.addEventListener(event, fn);
    this._winHandlers.push([event, fn]);
  }

  // --- Virtual joystick (bottom-left, fixed base) ---------------------------

  createJoystick() {
    const BASE_RADIUS = TOUCH_JOYSTICK_BASE_RADIUS;
    const HANDLE_RADIUS = TOUCH_JOYSTICK_HANDLE_RADIUS;
    this.joystickBaseRadius = BASE_RADIUS;
    // Bottom-left, inset past a left notch and the home indicator. layout()
    // recomputes these on resize; this is just the initial seat.
    const JOYSTICK_X = 150 + this.safe.left;
    const JOYSTICK_Y = this.scene.scale.height - 150 - this.safe.bottom;

    // Base disc + ring — static, semi-transparent. The ring + arrows are Graphics
    // (redrawn by _drawJoystickDecor on every layout); the disc/handle/dot just move.
    this.joystickBase = this.scene.add
      .circle(JOYSTICK_X, JOYSTICK_Y, BASE_RADIUS, 0xffffff, 0.12)
      .setScrollFactor(0)
      .setDepth(100);
    this.baseRing = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    // Four faint directional arrows so the control reads as a D-pad at a glance.
    this.dirGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    this._drawJoystickDecor(JOYSTICK_X, JOYSTICK_Y, BASE_RADIUS);

    // Handle + inner dot — these track the thumb.
    this.joystickHandle = this.scene.add
      .circle(JOYSTICK_X, JOYSTICK_Y, HANDLE_RADIUS, 0xffffff, 0.5)
      .setScrollFactor(0)
      .setDepth(101);
    this.joystickDot = this.scene.add
      .circle(JOYSTICK_X, JOYSTICK_Y, 8, 0xffffff, 0.9)
      .setScrollFactor(0)
      .setDepth(102);

    this.joystick = {
      baseX: JOYSTICK_X,
      baseY: JOYSTICK_Y,
      baseRadius: BASE_RADIUS,
      handleRadius: HANDLE_RADIUS,
      currentX: 0,
      currentY: 0
    };

    // Claim a pointer that lands in the left half; the right half belongs to the
    // action buttons. The split is the live screen midpoint (scale.width), not the
    // 1600 base — under RESIZE pointer coords are in screen px. Tracked by pointer.id
    // so a second finger never hijacks it.
    this._onScene('pointerdown', (pointer) => {
      if (pointer.x < this.scene.scale.width / 2 && this.joystickPointer === null) {
        this.joystickPointer = pointer.id;
        this.joystickActive = true;
        this.updateJoystick(pointer.x, pointer.y);
      }
    });
    this._onScene('pointermove', (pointer) => {
      if (pointer.id === this.joystickPointer) this.updateJoystick(pointer.x, pointer.y);
    });
    const release = (pointer) => {
      if (pointer.id === this.joystickPointer) {
        this.joystickPointer = null;
        this.joystickActive = false;
        this.resetJoystick();
      }
    };
    this._onScene('pointerup', release);
    this._onScene('pointerupoutside', release);
  }

  updateJoystick(px, py) {
    const { baseX, baseY, baseRadius } = this.joystick;
    const dx = px - baseX;
    const dy = py - baseY;
    const dist = Math.hypot(dx, dy);
    const maxDist = baseRadius * 0.8;
    const clampedDist = Math.min(dist, maxDist);
    const angle = Math.atan2(dy, dx);

    const handleX = baseX + Math.cos(angle) * clampedDist;
    const handleY = baseY + Math.sin(angle) * clampedDist;
    this.joystickHandle.setPosition(handleX, handleY);
    this.joystickDot.setPosition(handleX, handleY);

    // Normalize to -1..1, with an 8px dead zone so resting thumbs don't drift.
    const nx = clampedDist > 8 ? Math.cos(angle) * (clampedDist / maxDist) : 0;
    const ny = clampedDist > 8 ? Math.sin(angle) * (clampedDist / maxDist) : 0;
    this.joystick.currentX = nx;
    this.joystick.currentY = ny;
    EventBus.emit('touch:move', { x: nx, y: ny });
  }

  resetJoystick() {
    const { baseX, baseY } = this.joystick;
    this.joystickHandle.setPosition(baseX, baseY);
    this.joystickDot.setPosition(baseX, baseY);
    this.joystick.currentX = 0;
    this.joystick.currentY = 0;
    EventBus.emit('touch:move', { x: 0, y: 0 });
  }

  // (Re)draw the static ring + D-pad arrows at a given centre. Both are Graphics
  // with baked coords, so a resize clears and redraws them at the new joystick seat.
  _drawJoystickDecor(cx, cy, r) {
    this.baseRing.clear();
    this.baseRing.lineStyle(2, 0xffffff, 0.4);
    this.baseRing.strokeCircle(cx, cy, r);

    this.dirGfx.clear();
    this.dirGfx.fillStyle(0xffffff, 0.2);
    const a = 8; // arrow half-width
    const inset = 12; // distance of the arrow tip from the ring
    // up
    this.dirGfx.fillTriangle(cx, cy - r + inset, cx - a, cy - r + inset + a * 1.5, cx + a, cy - r + inset + a * 1.5);
    // down
    this.dirGfx.fillTriangle(cx, cy + r - inset, cx - a, cy + r - inset - a * 1.5, cx + a, cy + r - inset - a * 1.5);
    // left
    this.dirGfx.fillTriangle(cx - r + inset, cy, cx - r + inset + a * 1.5, cy - a, cx - r + inset + a * 1.5, cy + a);
    // right
    this.dirGfx.fillTriangle(cx + r - inset, cy, cx + r - inset - a * 1.5, cy - a, cx + r - inset - a * 1.5, cy + a);
  }

  // --- Action buttons (bottom-right cluster) --------------------------------

  createActionButtons() {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const safeBottom = this.safe.bottom;
    const safeRight = this.safe.right;
    const BTN_RADIUS = TOUCH_BUTTON_RADIUS;
    const BTN_ALPHA = 0.75;
    this.buttonRadius = BTN_RADIUS;

    // Offsets from the bottom-right corner (dx from the right edge, dy from the
    // bottom). Stored so layout() can re-seat each button against the live screen
    // size + insets on resize. Staggered for thumb reach. Sprint mobile-playability:
    // all four render from game start (dash is a base ability; ranged unlocks early).
    // ranged starts `lockedInitially` — visible but dimmed + inert until a ranged
    // weapon is acquired (ranged:equipped), so the 2x2 cluster reads complete without
    // letting the player fire before they can. 2x2 layout is unchanged (the
    // rearrange is a later sprint); only the per-button size shrank.
    this._buttonDefs = [
      { id: 'attack', dx: 90, dy: 190, color: 0xcc2222, label: '⚔', event: 'touch:attack' },
      { id: 'interact', dx: 185, dy: 105, color: 0x228822, label: 'F', event: 'touch:interact' },
      { id: 'dash', dx: 90, dy: 105, color: 0x2244cc, label: '⚡', event: 'touch:dash' },
      { id: 'ranged', dx: 185, dy: 190, color: 0xcc8822, label: '\u{1f3f9}', event: 'touch:ranged', lockedInitially: true }
    ];

    this.touchButtons = {};

    this._buttonDefs.forEach((btn) => {
      const x = W - btn.dx - safeRight;
      const y = H - btn.dy - safeBottom;
      const bg = this.scene.add.circle(x, y, BTN_RADIUS, btn.color, BTN_ALPHA).setScrollFactor(0).setDepth(100);

      const ring = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
      ring.lineStyle(2, 0xffffff, 0.5);
      ring.strokeCircle(x, y, BTN_RADIUS);

      const label = this.scene.add
        .text(x, y, btn.label, { fontSize: TOUCH_BUTTON_LABEL_PX, color: '#ffffff' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(101);

      // Hit zone is larger than the visual for forgiving thumb taps.
      const hitZone = this.scene.add
        .circle(x, y, BTN_RADIUS + 10, 0x000000, 0.001)
        .setScrollFactor(0)
        .setDepth(99)
        .setInteractive();

      const entry = { bg, ring, label, hitZone, locked: !!btn.lockedInitially };
      this.touchButtons[btn.id] = entry;

      // A locked button renders dimmed and swallows taps until unlocked.
      if (entry.locked) {
        bg.setAlpha(TOUCH_BUTTON_LOCKED_ALPHA);
        ring.setAlpha(TOUCH_BUTTON_LOCKED_ALPHA);
        label.setAlpha(TOUCH_BUTTON_LOCKED_ALPHA);
      }

      hitZone.on('pointerdown', (pointer) => {
        // Never let the stick's pointer double as a button press.
        if (pointer.id === this.joystickPointer) return;
        if (entry.locked) return; // inert until unlocked (e.g. ranged before pickup)
        bg.setScale(0.85);
        label.setScale(0.85);
        EventBus.emit(btn.event, {});
      });
      const relax = () => {
        bg.setScale(1);
        label.setScale(1);
      };
      hitZone.on('pointerup', relax);
      hitZone.on('pointerout', relax);
    });

    // Ranged starts locked; activate it (full alpha + live taps) once a ranged weapon
    // is acquired. ranged:equipped is the existing equip/load signal. Dash needs no
    // such gate — it is a base ability, active from the start.
    this._onBus('ranged:equipped', () => this.unlockButton('ranged'));
  }

  // Promote a locked button to active: full opacity and its taps now emit.
  unlockButton(id) {
    const b = this.touchButtons && this.touchButtons[id];
    if (!b || !b.locked) return;
    b.locked = false;
    b.bg.setAlpha(1);
    b.ring.setAlpha(1);
    b.label.setAlpha(1);
  }

  // --- Mobile-only HUD buttons (MAP toggle + pause) -------------------------

  createMobileHUDAdjustments() {
    // The 120x90 minimap is too small to read on a phone — hide it, and offer a
    // MAP button to peek it. UIScene owns the minimap and these two events.
    EventBus.emit('minimap:setVisible', false);

    const safeTop = this.safe.top;
    const safeRight = this.safe.right;
    const safeLeft = this.safe.left;

    const mapBtn = this.scene.add
      .text(this.scene.scale.width - 20 - safeRight, safeTop + 18, 'MAP', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 5 }
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive();
    // Single tap toggles the minimap. There is no tilde key on a phone, so the dev
    // cheat menu is unreachable on device — open it via MAP_CHEAT_TAP_COUNT rapid taps
    // here (each tap must land within MAP_CHEAT_RESET_MS of the last, so ordinary
    // map-toggling never trips it). The toggle still fires on every tap, so normal
    // use is unaffected.
    this._mapTapCount = 0;
    this._mapLastTap = 0;
    mapBtn.on('pointerdown', () => {
      EventBus.emit('minimap:toggle');
      const now = Date.now();
      this._mapTapCount = now - this._mapLastTap > MAP_CHEAT_RESET_MS ? 1 : this._mapTapCount + 1;
      this._mapLastTap = now;
      if (this._mapTapCount >= MAP_CHEAT_TAP_COUNT) {
        this._mapTapCount = 0;
        EventBus.emit('dev:toggleMenu');
      }
    });

    const pauseBtn = this.scene.add
      .text(20 + safeLeft, safeTop + 18, '⏸', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 10, y: 4 }
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive();
    pauseBtn.on('pointerdown', () => EventBus.emit('game:pauseRequested'));

    this.mapBtn = mapBtn;
    this.pauseBtn = pauseBtn;
  }

  // --- Live reflow ----------------------------------------------------------
  // Re-seat every control against the current viewport size + safe insets. Called by
  // UIScene on each Scale 'resize' (rotation / toolbar collapse) so the joystick,
  // action buttons and MAP/pause buttons reflow with no reload. Repositions existing
  // objects only — never re-binds input or re-emits events. Sprint mobile-playability:
  // both orientations are supported (no rotate gate); in portrait the joystick hugs
  // the left edge so it doesn't collide with the right-hand button cluster on a narrow
  // width. The 2x2 cluster keeps the same offsets in both orientations.
  layout(width, height, safe) {
    if (!this.active) return;
    this.safe = safe;
    const portrait = width < height;

    // Joystick (bottom-left). Landscape keeps the original 150px inset; portrait hugs
    // the left edge (radius + a small margin) so the narrow width still fits both the
    // stick and the bottom-right action cluster without overlap.
    const jx = (portrait ? this.joystickBaseRadius + 24 : 150) + safe.left;
    const jy = height - 150 - safe.bottom;
    this.joystick.baseX = jx;
    this.joystick.baseY = jy;
    this.joystickBase.setPosition(jx, jy);
    this._drawJoystickDecor(jx, jy, this.joystickBaseRadius);
    // Don't yank the handle out from under an active thumb mid-drag.
    if (!this.joystickActive) {
      this.joystickHandle.setPosition(jx, jy);
      this.joystickDot.setPosition(jx, jy);
    }

    // Action buttons (bottom-right, inset past a right notch + the home indicator).
    this._buttonDefs.forEach((btn) => {
      const b = this.touchButtons[btn.id];
      if (!b) return;
      const x = width - btn.dx - safe.right;
      const y = height - btn.dy - safe.bottom;
      b.bg.setPosition(x, y);
      b.label.setPosition(x, y);
      b.hitZone.setPosition(x, y);
      b.ring.clear();
      b.ring.lineStyle(2, 0xffffff, 0.5);
      b.ring.strokeCircle(x, y, this.buttonRadius);
    });

    // MAP (top-right) + pause (top-left) buttons.
    if (this.mapBtn) this.mapBtn.setPosition(width - 20 - safe.right, safe.top + 18);
    if (this.pauseBtn) this.pauseBtn.setPosition(20 + safe.left, safe.top + 18);
  }

  // Reserved for UIScene's update loop — everything here is event-driven, so
  // there is nothing to poll per frame.
  update() {}

  destroy() {
    this._sceneHandlers.forEach(([event, fn]) => this.scene.input.off(event, fn));
    this._sceneHandlers = [];
    this._busHandlers.forEach(([event, fn]) => EventBus.off(event, fn));
    this._busHandlers = [];
    this._winHandlers.forEach(([event, fn]) => window.removeEventListener(event, fn));
    this._winHandlers = [];
  }
}
