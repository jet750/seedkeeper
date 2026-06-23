# Seedkeeper — Sprint Mobile: Full Touch Adaptation

**What this sprint produces:** A complete, professional-grade mobile browser
experience. Virtual joystick, action buttons, safe zone awareness, touch-
optimized UI, performance tuning for mobile GPU, and orientation handling.
The game is fully playable on an iPhone or Android in Chrome with no
keyboard required. Desktop experience is completely unchanged.

**The standard:** Someone opens seedkeeper.jaxontravis.com on their phone
at a BBQ and can play immediately without instructions.

**Depends on:** Sprint 10d complete and on dev.

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b feature/mobile-touch
```

---

## Critical Mobile Browser Constraints — Read First

These are non-negotiable realities of mobile Chrome that will break the
game if not handled. Every design decision below accounts for them.

### Safe Area Insets (The Most Common Mobile Game Killer)
Modern phones have notches, home indicators, and dynamic islands that
eat into the viewport. Chrome on iPhone has a bottom bar (~83px) and
status bar (~44px) that shrink the usable viewport. Android Chrome has
a bottom nav bar that may appear or disappear.

**Never place interactive elements within 90px of the bottom edge or
50px of the top edge in CSS/screen coordinates.**

Use CSS environment variables for safe positioning:
```javascript
// In Phaser, get safe area from CSS env vars
const safeTop    = parseInt(getComputedStyle(document.documentElement)
  .getPropertyValue('--sat') || '0');
const safeBottom = parseInt(getComputedStyle(document.documentElement)
  .getPropertyValue('--sab') || '0');
const safeLeft   = parseInt(getComputedStyle(document.documentElement)
  .getPropertyValue('--sal') || '0');
const safeRight  = parseInt(getComputedStyle(document.documentElement)
  .getPropertyValue('--sar') || '0');
```

Set these CSS variables in index.html:
```html
<style>
  :root {
    --sat: env(safe-area-inset-top);
    --sab: env(safe-area-inset-bottom);
    --sal: env(safe-area-inset-left);
    --sar: env(safe-area-inset-right);
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #1a2410;
    /* Prevent bounce scroll on iOS */
    position: fixed;
    touch-action: none;
    -webkit-overflow-scrolling: none;
  }
  canvas {
    display: block;
    /* Prevent iOS callout on long press */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: none;
  }
</style>
```

Viewport meta tag (critical — without this Chrome zooms on input focus):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0,
  maximum-scale=1.0, minimum-scale=1.0, user-scalable=no,
  viewport-fit=cover">
```

`viewport-fit=cover` is required for notch/dynamic island support.

### Chrome URL Bar Viewport Shift
Chrome mobile hides/shows its URL bar as the user scrolls, changing
the viewport height by ~56px. This causes layout jumps in games.

Fix by locking to window.innerHeight at load time:
```javascript
// In main.js, before creating Phaser game:
const MOBILE_HEIGHT = window.innerHeight;
const MOBILE_WIDTH  = window.innerWidth;

// Pass to Phaser config as fixed dimensions
// Do NOT use '100%' — use the locked pixel values
```

### Double-Tap Zoom Prevention
```javascript
// Add to index.html
document.addEventListener('touchstart', e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTap = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTap < 300) e.preventDefault();
  lastTap = now;
}, { passive: false });
```

### Pointer Events vs Touch Events
Use Phaser's built-in pointer system — do NOT add raw touch event
listeners to the canvas. Phaser unifies mouse and touch into pointer
events and handles multi-touch correctly. All joystick and button
input should use `scene.input.on('pointerdown')` etc.

---

## Mobile Detection

```javascript
// src/core/MobileDetect.js
const MobileDetect = {
  isMobile: () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      .test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1)
      || window.innerWidth < 768;
  },

  isIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent),

  isAndroid: () => /Android/.test(navigator.userAgent),

  // Get safe area padding in Phaser screen coordinates
  getSafeArea(virtualWidth, virtualHeight, screenWidth, screenHeight) {
    const scaleX = virtualWidth / screenWidth;
    const scaleY = virtualHeight / screenHeight;
    return {
      top:    (parseInt(getComputedStyle(document.documentElement)
                .getPropertyValue('--sat') || '0')) * scaleY,
      bottom: (parseInt(getComputedStyle(document.documentElement)
                .getPropertyValue('--sab') || '0')) * scaleY,
      left:   (parseInt(getComputedStyle(document.documentElement)
                .getPropertyValue('--sal') || '0')) * scaleX,
      right:  (parseInt(getComputedStyle(document.documentElement)
                .getPropertyValue('--sar') || '0')) * scaleX,
    };
  }
};

export default MobileDetect;
```

---

## Phaser Config — Mobile Scale Mode

Update `src/main.js` Phaser game config:

```javascript
import MobileDetect from './core/MobileDetect.js';

const isMobile = MobileDetect.isMobile();

const config = {
  type: Phaser.AUTO,
  width: 1600,
  height: 900,
  backgroundColor: '#1a2410',
  scale: {
    mode: isMobile
      ? Phaser.Scale.FIT          // fit to screen, maintain aspect ratio
      : Phaser.Scale.FIT,         // same for desktop
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1600,
    height: 900,
    // Lock to initial viewport size — prevents Chrome URL bar jump
    parent: 'game-container',
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
      // Mobile: reduce physics steps for performance
      fixedStep: true,
      fps: isMobile ? 30 : 60,  // 30fps physics on mobile is fine for this game
    }
  },
  render: {
    pixelArt: true,              // critical for crisp pixel sprites
    antialias: false,            // must be false for pixel art
    roundPixels: true,           // prevents sub-pixel blurring
    // Mobile GPU optimizations
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  },
  input: {
    activePointers: 3,           // support 3 simultaneous touches (joystick + 2 buttons)
  },
  scene: [ /* existing scenes */ ]
};

// Create a container div that accounts for safe areas
const container = document.createElement('div');
container.id = 'game-container';
container.style.cssText = `
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: env(safe-area-inset-left, 0px);
  right: env(safe-area-inset-right, 0px);
  bottom: env(safe-area-inset-bottom, 0px);
  width: calc(100% - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
  height: calc(100% - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
`;
document.body.appendChild(container);
```

---

## New File: src/systems/TouchControlSystem.js

This is the entire mobile control layer. Instantiated in UIScene only
when `MobileDetect.isMobile()` is true. Never runs on desktop.

```javascript
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/Constants.js';

export default class TouchControlSystem {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.joystickPointer = null;
    this.joystickActive = false;

    if (!MobileDetect.isMobile()) return;
    this.active = true;

    // Get safe area so we don't place controls under Chrome UI
    this.safe = MobileDetect.getSafeArea(
      VIRTUAL_WIDTH, VIRTUAL_HEIGHT,
      this.scene.scale.width, this.scene.scale.height
    );

    this.createJoystick();
    this.createActionButtons();
    this.createMobileHUDAdjustments();
    this.setupOrientationHandler();
  }

  createJoystick() {
    // Position: bottom-left, above safe area + extra padding
    const JOYSTICK_X = 130;
    const JOYSTICK_Y = VIRTUAL_HEIGHT - 140 - this.safe.bottom;
    const BASE_RADIUS = 70;
    const HANDLE_RADIUS = 30;

    // Base circle — static, semi-transparent
    this.joystickBase = this.scene.add.circle(
      JOYSTICK_X, JOYSTICK_Y, BASE_RADIUS, 0xffffff, 0.15
    ).setScrollFactor(0).setDepth(100);

    // Base ring
    const baseRing = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    baseRing.lineStyle(2, 0xffffff, 0.4);
    baseRing.strokeCircle(JOYSTICK_X, JOYSTICK_Y, BASE_RADIUS);

    // Directional indicators (subtle arrows)
    const dirGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    dirGfx.fillStyle(0xffffff, 0.2);
    const arrowSize = 8;
    // Up arrow
    dirGfx.fillTriangle(
      JOYSTICK_X, JOYSTICK_Y - BASE_RADIUS + 12,
      JOYSTICK_X - arrowSize, JOYSTICK_Y - BASE_RADIUS + 12 + arrowSize * 1.5,
      JOYSTICK_X + arrowSize, JOYSTICK_Y - BASE_RADIUS + 12 + arrowSize * 1.5
    );
    // Down, left, right arrows same pattern

    // Handle — moves with thumb
    this.joystickHandle = this.scene.add.circle(
      JOYSTICK_X, JOYSTICK_Y, HANDLE_RADIUS, 0xffffff, 0.5
    ).setScrollFactor(0).setDepth(101);

    // Handle inner dot for precision feel
    this.joystickDot = this.scene.add.circle(
      JOYSTICK_X, JOYSTICK_Y, 8, 0xffffff, 0.9
    ).setScrollFactor(0).setDepth(102);

    // Store config
    this.joystick = {
      baseX: JOYSTICK_X, baseY: JOYSTICK_Y,
      baseRadius: BASE_RADIUS, handleRadius: HANDLE_RADIUS,
      currentX: 0, currentY: 0
    };

    // Input — detect touch in joystick zone (left half of screen)
    this.scene.input.on('pointerdown', (pointer) => {
      if (pointer.x < VIRTUAL_WIDTH / 2 && !this.joystickPointer) {
        this.joystickPointer = pointer.id;
        this.joystickActive = true;
        this.updateJoystick(pointer.x, pointer.y);
      }
    });

    this.scene.input.on('pointermove', (pointer) => {
      if (pointer.id === this.joystickPointer) {
        this.updateJoystick(pointer.x, pointer.y);
      }
    });

    this.scene.input.on('pointerup', (pointer) => {
      if (pointer.id === this.joystickPointer) {
        this.joystickPointer = null;
        this.joystickActive = false;
        this.resetJoystick();
      }
    });
  }

  updateJoystick(px, py) {
    const { baseX, baseY, baseRadius } = this.joystick;
    const dx = px - baseX;
    const dy = py - baseY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, baseRadius * 0.8);
    const angle = Math.atan2(dy, dx);

    const handleX = baseX + Math.cos(angle) * clampedDist;
    const handleY = baseY + Math.sin(angle) * clampedDist;

    this.joystickHandle.setPosition(handleX, handleY);
    this.joystickDot.setPosition(handleX, handleY);

    // Normalize to -1 to 1
    const nx = clampedDist > 8 ? Math.cos(angle) * (clampedDist / (baseRadius * 0.8)) : 0;
    const ny = clampedDist > 8 ? Math.sin(angle) * (clampedDist / (baseRadius * 0.8)) : 0;

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

  createActionButtons() {
    const safeBottom = this.safe.bottom;
    const BTN_RADIUS = 36;
    const BTN_ALPHA  = 0.75;

    // Button layout — right side, above safe area
    // Staggered for thumb reach — not a straight line
    const buttons = [
      {
        id: 'attack',
        x: VIRTUAL_WIDTH - 80,
        y: VIRTUAL_HEIGHT - 180 - safeBottom,
        color: 0xcc2222,
        label: '⚔',
        event: 'touch:attack',
        alwaysVisible: true,
      },
      {
        id: 'interact',
        x: VIRTUAL_WIDTH - 170,
        y: VIRTUAL_HEIGHT - 100 - safeBottom,
        color: 0x228822,
        label: 'F',
        event: 'touch:interact',
        alwaysVisible: true,
      },
      {
        id: 'dash',
        x: VIRTUAL_WIDTH - 80,
        y: VIRTUAL_HEIGHT - 100 - safeBottom,
        color: 0x2244cc,
        label: '⚡',
        event: 'touch:dash',
        alwaysVisible: false, // only show when dash unlocked
      },
      {
        id: 'ranged',
        x: VIRTUAL_WIDTH - 170,
        y: VIRTUAL_HEIGHT - 180 - safeBottom,
        color: 0xcc8822,
        label: '🏹',
        event: 'touch:ranged',
        alwaysVisible: false, // only show when ranged unlocked
      },
    ];

    this.touchButtons = {};

    buttons.forEach(btn => {
      // Background circle
      const bg = this.scene.add.circle(btn.x, btn.y, BTN_RADIUS, btn.color, BTN_ALPHA)
        .setScrollFactor(0).setDepth(100)
        .setVisible(btn.alwaysVisible);

      // Ring
      const ring = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
      ring.lineStyle(2, 0xffffff, 0.5);
      ring.strokeCircle(btn.x, btn.y, BTN_RADIUS);
      ring.setVisible(btn.alwaysVisible);

      // Label
      const label = this.scene.add.text(btn.x, btn.y, btn.label, {
        fontSize: '22px',
        color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101)
        .setVisible(btn.alwaysVisible);

      // Hit area — slightly larger than visual for forgiving touch
      const hitZone = this.scene.add.circle(btn.x, btn.y, BTN_RADIUS + 8, 0x000000, 0)
        .setScrollFactor(0).setDepth(99)
        .setInteractive()
        .setVisible(btn.alwaysVisible);

      // Touch response
      hitZone.on('pointerdown', (pointer) => {
        // Prevent joystick from stealing this pointer
        if (pointer.id === this.joystickPointer) return;
        bg.setScale(0.85);
        label.setScale(0.85);
        EventBus.emit(btn.event, {});
      });

      hitZone.on('pointerup', () => {
        bg.setScale(1.0);
        label.setScale(1.0);
      });

      hitZone.on('pointerout', () => {
        bg.setScale(1.0);
        label.setScale(1.0);
      });

      this.touchButtons[btn.id] = { bg, ring, label, hitZone };
    });

    // Show/hide dash and ranged when unlocked
    EventBus.on('upgrade:purchased', ({ tierId }) => {
      if (tierId === 'dash_boots') {
        Object.values(this.touchButtons.dash).forEach(o => o.setVisible(true));
      }
      if (['sling', 'bow'].includes(tierId)) {
        Object.values(this.touchButtons.ranged).forEach(o => o.setVisible(true));
      }
    });
  }

  createMobileHUDAdjustments() {
    // Hide minimap by default on mobile — too small
    EventBus.emit('minimap:setVisible', false);

    // Show a mobile-only "MAP" button top-right that toggles minimap
    const safeTop = this.safe.top;
    const mapBtn = this.scene.add.text(
      VIRTUAL_WIDTH - 20, safeTop + 20, 'MAP',
      {
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#00000066',
        padding: { x: 6, y: 4 }
      }
    ).setOrigin(1, 0).setScrollFactor(0).setDepth(100).setInteractive();

    mapBtn.on('pointerdown', () => {
      EventBus.emit('minimap:toggle');
    });

    // Mobile pause button — top-left, above safe area
    const pauseBtn = this.scene.add.text(
      20, safeTop + 20, '⏸',
      {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#00000066',
        padding: { x: 8, y: 4 }
      }
    ).setOrigin(0, 0).setScrollFactor(0).setDepth(100).setInteractive();

    pauseBtn.on('pointerdown', () => {
      EventBus.emit('game:pauseRequested');
    });
  }

  setupOrientationHandler() {
    // Force landscape on mobile — portrait is not viable for this game
    const checkOrientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      if (isPortrait) {
        this.showRotatePrompt();
      } else {
        this.hideRotatePrompt();
      }
    };

    window.addEventListener('orientationchange', () => {
      // Delay check — orientation events fire before dimensions update
      setTimeout(checkOrientation, 300);
    });
    window.addEventListener('resize', checkOrientation);

    // Check on init
    checkOrientation();
  }

  showRotatePrompt() {
    if (this.rotatePrompt) return;
    this.rotatePrompt = this.scene.add.rectangle(
      VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2,
      VIRTUAL_WIDTH, VIRTUAL_HEIGHT,
      0x000000, 0.95
    ).setScrollFactor(0).setDepth(200);

    this.rotateText = this.scene.add.text(
      VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2,
      '↻\nRotate your phone\nto landscape to play',
      {
        fontFamily: '"SproutLands", monospace',
        fontSize: '28px',
        color: '#88cc44',
        align: 'center',
        lineSpacing: 10,
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(201);
  }

  hideRotatePrompt() {
    if (this.rotatePrompt) {
      this.rotatePrompt.destroy();
      this.rotateText.destroy();
      this.rotatePrompt = null;
      this.rotateText = null;
    }
  }

  // Called from UIScene update() — very lightweight
  update() {
    if (!this.active) return;
    // Nothing to poll — all driven by events
  }

  destroy() {
    EventBus.off('upgrade:purchased');
    EventBus.off('touch:move');
  }
}
```

---

## Player.js — Touch Input Integration

In Player.js `create()`, add touch listener:

```javascript
// Touch movement — additive with keyboard
this.touchVelocity = { x: 0, y: 0 };

EventBus.on('touch:move', ({ x, y }) => {
  this.touchVelocity.x = x;
  this.touchVelocity.y = y;
});

EventBus.on('touch:attack', () => {
  if (this.attackCooldownRemaining <= 0) {
    this.performAttack();
  } else {
    // Buffer the input same as keyboard
    this.attackBuffer = true;
    this.attackBufferTimer = 120;
  }
});

EventBus.on('touch:interact', () => {
  this.tryInteract();
});

EventBus.on('touch:dash', () => {
  if (this.dashEnabled && this.dashCooldownRemaining <= 0) {
    this.dash();
  }
});

EventBus.on('touch:ranged', () => {
  if (this.equippedGear?.ranged && this.rangedAmmo > 0) {
    this.fireRanged();
  }
});
```

In Player.js `update(dt)`, merge touch and keyboard velocity:

```javascript
update(dt) {
  // Keyboard input (existing)
  const keyX = (keys.right.isDown || keys.d.isDown ? 1 : 0)
              - (keys.left.isDown  || keys.a.isDown ? 1 : 0);
  const keyY = (keys.down.isDown  || keys.s.isDown ? 1 : 0)
              - (keys.up.isDown   || keys.w.isDown ? 1 : 0);

  // Merge keyboard and touch — keyboard wins if both active
  const inputX = keyX !== 0 ? keyX : this.touchVelocity.x;
  const inputY = keyY !== 0 ? keyY : this.touchVelocity.y;

  // Normalize diagonal
  const len = Math.hypot(inputX, inputY);
  const nx = len > 0 ? inputX / len : 0;
  const ny = len > 0 ? inputY / len : 0;

  // Apply movement (existing speed logic unchanged)
  this.body.setVelocity(
    nx * this.effectiveSpeed,
    ny * this.effectiveSpeed
  );

  // Update facing direction for attack arc
  if (Math.abs(inputX) > Math.abs(inputY)) {
    this.facing = inputX > 0 ? 'right' : 'left';
  } else if (ny !== 0) {
    this.facing = inputY > 0 ? 'down' : 'up';
  }

  // Idle detection
  const moving = len > 0.1;
  if (moving) {
    this.idleTimer = 0;
    this.isIdling = false;
    this.stopIdleTween();
  } else {
    this.idleTimer += dt * 1000;
    if (this.idleTimer >= 3000 && !this.isIdling) {
      this.playIdleAnimation();
    }
  }

  // Rest of update unchanged...
}
```

---

## UIScene.js — Touch Control Integration

In UIScene `create()`:

```javascript
import TouchControlSystem from '../systems/TouchControlSystem.js';
import MobileDetect from '../core/MobileDetect.js';

create() {
  // ... existing HUD creation ...

  // Mobile controls — only on touch devices
  if (MobileDetect.isMobile()) {
    this.touchControls = new TouchControlSystem(this);

    // Scale up HUD elements for touch
    this.scaleHUDForMobile();
  }

  // Listen for pause request from mobile pause button
  EventBus.on('game:pauseRequested', () => {
    EventBus.emit('game:pause');
  });
}

scaleHUDForMobile() {
  // Increase seed slot size
  // Increase HP bar height
  // Move HUD elements inside safe area
  const safe = MobileDetect.getSafeArea(
    VIRTUAL_WIDTH, VIRTUAL_HEIGHT,
    this.scale.width, this.scale.height
  );

  // Reposition HP bar below safe area top
  if (this.hpBar) {
    this.hpBar.setPosition(16, safe.top + 16);
  }

  // Reposition day/zone counter
  if (this.dayText) {
    this.dayText.setPosition(VIRTUAL_WIDTH / 2, safe.top + 16);
  }

  // Reposition timer
  if (this.timerText) {
    this.timerText.setPosition(VIRTUAL_WIDTH - 16, safe.top + 16);
  }

  // Seed slots — move up above touch buttons
  // Bottom safe area + touch button height + padding
  const seedSlotY = VIRTUAL_HEIGHT - 160 - safe.bottom;
  if (this.seedSlots) {
    this.seedSlots.forEach((slot, i) => {
      slot.setPosition(16 + i * 52, seedSlotY);
    });
  }
}
```

---

## Mobile Performance Optimizations

Add these to GameScene to maintain smooth framerate on mobile:

```javascript
// In GameScene create(), after all objects are placed:
applyMobileOptimizations() {
  if (!MobileDetect.isMobile()) return;

  // Reduce particle quantity on mobile
  if (this.particleSystem) {
    this.particleSystem.mobileMode = true; // halve particle counts
  }

  // Throttle slime AI updates on mobile
  this.slimeUpdateInterval = 3; // update every 3rd frame instead of every frame
  this.slimeUpdateFrame = 0;

  // Reduce ambient particle frequency
  if (this.gardenAmbientEmitter) {
    this.gardenAmbientEmitter.setFrequency(3000); // was 1200ms
  }

  // Disable screenshake on low-end mobile (check for reduced motion)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    this.screenShakeEnabled = false;
  }
}

// In GameScene update():
update(time, delta) {
  if (!GameState.is('PLAYING')) return;
  const dt = delta / 1000;

  this.player.update(dt);

  // Mobile: throttle enemy AI
  if (MobileDetect.isMobile()) {
    this.slimeUpdateFrame = (this.slimeUpdateFrame + 1) % this.slimeUpdateInterval;
    if (this.slimeUpdateFrame === 0) {
      this.enemies.forEach(e => e.update(dt * this.slimeUpdateInterval, this.player));
    }
  } else {
    this.enemies.forEach(e => e.update(dt, this.player));
  }

  this.daySystem.update(delta);
}
```

---

## UpgradeScene — Mobile Touch Support

The upgrade chest overlay needs touch support since it uses click events:

```javascript
// In UpgradeScene, all interactive elements already use
// Phaser's .setInteractive() + 'pointerdown' — these work on touch.
// No changes needed for basic functionality.

// However, on mobile the overlay may be too small to tap accurately.
// Scale up BUY buttons on mobile:

if (MobileDetect.isMobile()) {
  // Increase button hit areas
  this.buyButtons.forEach(btn => {
    btn.setScale(1.3);
  });

  // Add close gesture — swipe down to close
  let touchStartY = 0;
  this.input.on('pointerdown', p => { touchStartY = p.y; });
  this.input.on('pointerup', p => {
    if (p.y - touchStartY > 80) { // swipe down 80px
      EventBus.emit('upgrade:closed');
      this.scene.stop();
      this.scene.resume('GameScene');
    }
  });
}
```

---

## Pause/Settings on Mobile

In GameScene, wire the pause request:

```javascript
EventBus.on('game:pause', () => {
  if (GameState.is('PLAYING')) {
    GameState.transition('PAUSED');
    this.physics.pause();
    this.scene.launch('SettingsScene', { returnScene: 'GameScene' });
    this.scene.pause();
  }
});
```

---

## Web App Meta Tags (Add to index.html)

These make the game feel native when added to home screen:

```html
<!-- iOS home screen app -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Seedkeeper">

<!-- Android home screen app -->
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#1a2410">

<!-- Prevent phone number detection -->
<meta name="format-detection" content="telephone=no">
```

---

## EventBus Cleanup

In UIScene `shutdown()`, clean up touch listeners:

```javascript
shutdown() {
  // Existing cleanup...
  if (this.touchControls) {
    this.touchControls.destroy();
  }
  EventBus.off('touch:move');
  EventBus.off('touch:attack');
  EventBus.off('touch:interact');
  EventBus.off('touch:dash');
  EventBus.off('touch:ranged');
  EventBus.off('game:pauseRequested');
  EventBus.off('minimap:toggle');
  EventBus.off('minimap:setVisible');
}
```

In Player.js `destroy()`:
```javascript
destroy() {
  EventBus.off('touch:move');
  EventBus.off('touch:attack');
  EventBus.off('touch:interact');
  EventBus.off('touch:dash');
  EventBus.off('touch:ranged');
  super.destroy();
}
```

---

## Deliverables Checklist

```
[ ] index.html has viewport meta with viewport-fit=cover
[ ] index.html has safe area CSS variables set
[ ] body/canvas CSS prevents scroll, bounce, callout, zoom
[ ] Double-tap zoom prevention active
[ ] Phaser input.activePointers set to 3
[ ] MobileDetect.js created and exported
[ ] Touch controls only instantiate on mobile — desktop unchanged
[ ] Virtual joystick visible bottom-left on mobile
[ ] Joystick base stays fixed, handle moves with thumb
[ ] Joystick confined to left half of screen
[ ] Player moves in joystick direction at correct speed
[ ] Diagonal movement normalized correctly
[ ] Attack button visible bottom-right
[ ] Interact button visible bottom-right  
[ ] Dash button appears when dash boots purchased
[ ] Ranged button appears when sling/bow purchased
[ ] Buttons have larger-than-visual hit areas
[ ] Button press shows visual scale feedback
[ ] Joystick pointer and button presses tracked independently
[ ] Portrait mode shows rotate prompt
[ ] Landscape mode hides rotate prompt and shows game
[ ] HUD elements repositioned inside safe areas (not under notch/home bar)
[ ] Seed slots moved above touch buttons
[ ] Minimap hidden by default on mobile
[ ] MAP button in top-right toggles minimap
[ ] Pause button in top-left opens settings
[ ] Upgrade chest buttons tappable on mobile
[ ] Swipe down on upgrade chest closes it
[ ] All web app meta tags added to index.html
[ ] Slime AI throttled to every 3rd frame on mobile
[ ] Particle counts reduced on mobile
[ ] Game runs at stable 30fps+ on a mid-range phone
[ ] Desktop: zero changes to existing behavior
[ ] Desktop: touch UI completely invisible
[ ] npm run build — zero errors
[ ] Test on actual mobile browser — joystick moves player
[ ] Test attack, interact, seed collect all work via touch
[ ] Test upgrade chest opens and purchases work via touch
[ ] Test rotate prompt shows in portrait, hides in landscape

git checkout dev
git merge feature/mobile-touch
git push origin dev
```

Commit: `feat: mobile touch controls joystick safe areas orientation performance`
