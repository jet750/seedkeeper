// TouchControlSystem.js
//
// The entire mobile control layer: a fixed virtual joystick (left thumb), a
// cluster of action buttons (right thumb), mobile-only HUD buttons (MAP / pause),
// and the portrait "rotate your phone" gate. Instantiated by UIScene ONLY when
// MobileDetect.isMobile() is true, so desktop never builds a single object here.
//
// It is pure output: every control EMITS an EventBus event (touch:move,
// touch:attack, …). Player/GameScene own the behaviour. That keeps this a thin,
// swappable input surface with no gameplay coupling.

import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';

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
    this.setupOrientationHandler();
  }

  // Convert the CSS safe-area insets into virtual (1600x900) px using the real
  // on-screen canvas size (displaySize), not the 1600x900 base size.
  computeSafeArea() {
    const ds = this.scene.scale.displaySize;
    const screenW = ds && ds.width ? ds.width : window.innerWidth;
    const screenH = ds && ds.height ? ds.height : window.innerHeight;
    return MobileDetect.getSafeArea(VIRTUAL_WIDTH, VIRTUAL_HEIGHT, screenW, screenH);
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
    const JOYSTICK_X = 150;
    const JOYSTICK_Y = VIRTUAL_HEIGHT - 150 - this.safe.bottom;
    const BASE_RADIUS = 70;
    const HANDLE_RADIUS = 30;

    // Base disc + ring — static, semi-transparent.
    this.joystickBase = this.scene.add
      .circle(JOYSTICK_X, JOYSTICK_Y, BASE_RADIUS, 0xffffff, 0.12)
      .setScrollFactor(0)
      .setDepth(100);
    const baseRing = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    baseRing.lineStyle(2, 0xffffff, 0.4);
    baseRing.strokeCircle(JOYSTICK_X, JOYSTICK_Y, BASE_RADIUS);

    // Four faint directional arrows so the control reads as a D-pad at a glance.
    const dirGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    dirGfx.fillStyle(0xffffff, 0.2);
    const a = 8; // arrow half-width
    const inset = 12; // distance of the arrow tip from the ring
    const r = BASE_RADIUS;
    // up
    dirGfx.fillTriangle(
      JOYSTICK_X, JOYSTICK_Y - r + inset,
      JOYSTICK_X - a, JOYSTICK_Y - r + inset + a * 1.5,
      JOYSTICK_X + a, JOYSTICK_Y - r + inset + a * 1.5
    );
    // down
    dirGfx.fillTriangle(
      JOYSTICK_X, JOYSTICK_Y + r - inset,
      JOYSTICK_X - a, JOYSTICK_Y + r - inset - a * 1.5,
      JOYSTICK_X + a, JOYSTICK_Y + r - inset - a * 1.5
    );
    // left
    dirGfx.fillTriangle(
      JOYSTICK_X - r + inset, JOYSTICK_Y,
      JOYSTICK_X - r + inset + a * 1.5, JOYSTICK_Y - a,
      JOYSTICK_X - r + inset + a * 1.5, JOYSTICK_Y + a
    );
    // right
    dirGfx.fillTriangle(
      JOYSTICK_X + r - inset, JOYSTICK_Y,
      JOYSTICK_X + r - inset - a * 1.5, JOYSTICK_Y - a,
      JOYSTICK_X + r - inset - a * 1.5, JOYSTICK_Y + a
    );

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
    // action buttons. Tracked by pointer.id so a second finger never hijacks it.
    this._onScene('pointerdown', (pointer) => {
      if (pointer.x < VIRTUAL_WIDTH / 2 && this.joystickPointer === null) {
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

  // --- Action buttons (bottom-right cluster) --------------------------------

  createActionButtons() {
    const safeBottom = this.safe.bottom;
    const safeRight = this.safe.right;
    const BTN_RADIUS = 38;
    const BTN_ALPHA = 0.75;

    // Staggered for thumb reach. dash + ranged stay hidden until unlocked.
    const buttons = [
      { id: 'attack', x: VIRTUAL_WIDTH - 90 - safeRight, y: VIRTUAL_HEIGHT - 190 - safeBottom, color: 0xcc2222, label: '⚔', event: 'touch:attack', alwaysVisible: true },
      { id: 'interact', x: VIRTUAL_WIDTH - 185 - safeRight, y: VIRTUAL_HEIGHT - 105 - safeBottom, color: 0x228822, label: 'F', event: 'touch:interact', alwaysVisible: true },
      { id: 'dash', x: VIRTUAL_WIDTH - 90 - safeRight, y: VIRTUAL_HEIGHT - 105 - safeBottom, color: 0x2244cc, label: '⚡', event: 'touch:dash', alwaysVisible: false },
      { id: 'ranged', x: VIRTUAL_WIDTH - 185 - safeRight, y: VIRTUAL_HEIGHT - 190 - safeBottom, color: 0xcc8822, label: '\u{1f3f9}', event: 'touch:ranged', alwaysVisible: false }
    ];

    this.touchButtons = {};

    buttons.forEach((btn) => {
      const bg = this.scene.add
        .circle(btn.x, btn.y, BTN_RADIUS, btn.color, BTN_ALPHA)
        .setScrollFactor(0)
        .setDepth(100)
        .setVisible(btn.alwaysVisible);

      const ring = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
      ring.lineStyle(2, 0xffffff, 0.5);
      ring.strokeCircle(btn.x, btn.y, BTN_RADIUS);
      ring.setVisible(btn.alwaysVisible);

      const label = this.scene.add
        .text(btn.x, btn.y, btn.label, { fontSize: '24px', color: '#ffffff' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(101)
        .setVisible(btn.alwaysVisible);

      // Hit zone is larger than the visual for forgiving thumb taps.
      const hitZone = this.scene.add
        .circle(btn.x, btn.y, BTN_RADIUS + 10, 0x000000, 0.001)
        .setScrollFactor(0)
        .setDepth(99)
        .setInteractive()
        .setVisible(btn.alwaysVisible);

      hitZone.on('pointerdown', (pointer) => {
        // Never let the stick's pointer double as a button press.
        if (pointer.id === this.joystickPointer) return;
        if (!hitZone.visible) return;
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

      this.touchButtons[btn.id] = { bg, ring, label, hitZone };
    });

    // Reveal dash / ranged when the player gains them. dash:enabled fires from
    // Player.equipBoots and from GameScene.syncHud on load; ranged:equipped is
    // the existing equip/load signal. Both reach an already-subscribed UIScene.
    this._onBus('dash:enabled', () => this.showButton('dash'));
    this._onBus('ranged:equipped', () => this.showButton('ranged'));
  }

  showButton(id) {
    const b = this.touchButtons && this.touchButtons[id];
    if (!b) return;
    b.bg.setVisible(true);
    b.ring.setVisible(true);
    b.label.setVisible(true);
    b.hitZone.setVisible(true);
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
      .text(VIRTUAL_WIDTH - 20 - safeRight, safeTop + 18, 'MAP', {
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
    mapBtn.on('pointerdown', () => EventBus.emit('minimap:toggle'));

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

  // --- Orientation gate -----------------------------------------------------
  // Portrait is unplayable for a landscape action game — block it with a prompt.

  setupOrientationHandler() {
    this._checkOrientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      if (isPortrait) this.showRotatePrompt();
      else this.hideRotatePrompt();
    };
    // orientationchange fires before the dimensions settle, so re-check after.
    this._onWin('orientationchange', () => setTimeout(this._checkOrientation, 300));
    this._onWin('resize', this._checkOrientation);
    this._checkOrientation();
  }

  showRotatePrompt() {
    if (this.rotatePrompt) return;
    this.rotatePrompt = this.scene.add
      .rectangle(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x000000, 0.95)
      .setScrollFactor(0)
      .setDepth(400);
    this.rotateText = this.scene.add
      .text(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, '↻\nRotate your phone\nto landscape to play', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '36px',
        color: '#88cc44',
        align: 'center',
        lineSpacing: 12
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(401);
  }

  hideRotatePrompt() {
    if (this.rotatePrompt) {
      this.rotatePrompt.destroy();
      this.rotateText.destroy();
      this.rotatePrompt = null;
      this.rotateText = null;
    }
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
    this.hideRotatePrompt();
  }
}
