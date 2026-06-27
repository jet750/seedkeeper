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
  TOUCH_PORTRAIT_SCALE,
  TOUCH_DIAMOND_SPREAD,
  TOUCH_DIAMOND_CENTER_X,
  TOUCH_DIAMOND_CENTER_Y,
  TOUCH_BOTTOM_SAFE_MIN,
  RADIAL_LONGPRESS_MS
} from '../core/Constants.js';

// Bow glyph (ranged) vs spell glyph — the diamond's ability button swaps between these
// to reflect which secondary is loaded (Sprint combat-input-mobile-consolidated).
const RANGED_GLYPH = '\u{1f3f9}';
const SPELL_GLYPH = '✦'; // ✦

// Interact-button icon (Sprint mobile-control-feel). Interact is used mostly on plants,
// so a small sprout reads as the obvious "use" button — replacing the "E" glyph. Uses a
// mid-growth frame of a plant growth-sheet (carrots = 112x16 = 7 frames of 16x16). If
// the sheet didn't emit in this build (Vite glob emits only a subset — see memory note),
// createActionButtons() falls back to the "E" text label. Frame/fill are easily swapped.
const INTERACT_ICON_KEY = 'carrots';
const INTERACT_ICON_FRAME = 4; // leafy growth stage — clear "plant" silhouette
const INTERACT_ICON_SRC_PX = 16; // source frame size (square sheet)
const INTERACT_ICON_FILL = 1.15; // icon height as a multiple of the button RADIUS

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

  // Effective bottom inset (Sprint mobile-control-feel). env(safe-area-inset-bottom) is
  // 0 in a non-PWA Android Chrome tab even though a bottom nav/URL bar overlaps, so the
  // raw inset alone let the bottom (dash) button fall under the chrome. Floor it at
  // TOUCH_BOTTOM_SAFE_MIN so every bottom-anchored control clears the chrome / home
  // indicator in BOTH orientations.
  _bottomInset(safe) {
    return Math.max(safe.bottom, TOUCH_BOTTOM_SAFE_MIN);
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
    const JOYSTICK_Y = this.scene.scale.height - 150 - this._bottomInset(this.safe);

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
    const BTN_RADIUS = TOUCH_BUTTON_RADIUS;
    const BTN_ALPHA = 0.75;
    this.buttonRadius = BTN_RADIUS;

    // Diamond face-button cluster (Sprint combat-input-mobile-consolidated). The old 2x2
    // grid's POSITIONS were rotated 45° into a diamond (the icons are NOT rotated) so the
    // right thumb falls onto a console-style face cross:
    //   TOP = interact · MIDDLE-LEFT (inner) = melee · MIDDLE-RIGHT (outer) = ranged/
    //   ability (long-press → radial) · BOTTOM = dash.
    // Each button's screen position is derived from the cluster centre + TOUCH_DIAMOND_
    // SPREAD via _diamondXY(); raise the spread tunable to space the four apart with no
    // re-layout. The ranged button is the generic "Ranged-Magic" control — tap = fire the
    // loaded ability, long-press = radial select — and is ALWAYS active (firing no-ops
    // until something castable is loaded); its icon reflects the loaded ability.
    this._buttonDefs = [
      { id: 'interact', pos: 'top', color: 0x228822, label: 'E', event: 'touch:interact' },
      { id: 'attack', pos: 'left', color: 0xcc2222, label: '⚔', event: 'touch:attack' },
      { id: 'ranged', pos: 'right', color: 0xcc8822, label: RANGED_GLYPH, event: 'touch:ranged' },
      { id: 'dash', pos: 'bottom', color: 0x2244cc, label: '⚡', event: 'touch:dash' }
    ];

    this.touchButtons = {};

    this._buttonDefs.forEach((btn) => {
      const { x, y } = this._diamondXY(btn.pos, W, H, this.safe, 1);
      const bg = this.scene.add.circle(x, y, BTN_RADIUS, btn.color, BTN_ALPHA).setScrollFactor(0).setDepth(100);

      const ring = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
      ring.lineStyle(2, 0xffffff, 0.5);
      ring.strokeCircle(x, y, BTN_RADIUS);

      const label = this.scene.add
        .text(x, y, btn.label, { fontSize: TOUCH_BUTTON_LABEL_PX, color: '#ffffff' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(101);

      // Interact gets a small plant sprite instead of the "E" glyph (Sprint mobile-
      // control-feel) — interact is used mostly on plants, so a sprout is the obvious
      // "use" icon. Guarded by textures.exists: if the growth-sheet didn't emit in this
      // build, keep the "E" label (the sprite just isn't created). layout() rescales it.
      let icon = null;
      let iconBaseScale = 1;
      if (btn.id === 'interact' && this.scene.textures.exists(INTERACT_ICON_KEY)) {
        iconBaseScale = (BTN_RADIUS * INTERACT_ICON_FILL) / INTERACT_ICON_SRC_PX;
        icon = this.scene.add
          .image(x, y, INTERACT_ICON_KEY, INTERACT_ICON_FRAME)
          .setOrigin(0.5)
          .setScale(iconBaseScale)
          .setScrollFactor(0)
          .setDepth(102);
        label.setText(''); // sprite replaces the glyph
      }

      // Hit zone is larger than the visual for forgiving thumb taps.
      const hitZone = this.scene.add
        .circle(x, y, BTN_RADIUS + 10, 0x000000, 0.001)
        .setScrollFactor(0)
        .setDepth(99)
        .setInteractive();

      const entry = { bg, ring, label, icon, iconBaseScale, hitZone, locked: !!btn.lockedInitially };
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
        if (entry.icon) entry.icon.setScale(entry.iconBaseScale * 0.85);
        // The Ranged-Magic button is tap-to-fire / hold-to-radial, so it resolves on
        // RELEASE (see _beginRangedPress). Every other button fires immediately.
        if (btn.id === 'ranged') {
          this._beginRangedPress(pointer);
        } else {
          EventBus.emit(btn.event, {});
        }
      });
      const relax = () => {
        bg.setScale(1);
        label.setScale(1);
        if (entry.icon) entry.icon.setScale(entry.iconBaseScale);
      };
      hitZone.on('pointerup', relax);
      hitZone.on('pointerout', relax);
    });

    // Long-press radial tracking for the ranged button (Sprint control-scheme-combat-
    // input). The release can land OFF the button (thumb dragged to a radial option),
    // so resolution is wired at SCENE level, not on the button's own hitZone.
    this._rangedPointerId = null;
    this._rangedRadialOpen = false;
    this._rangedPressTimer = null;
    this._onScene('pointermove', (pointer) => {
      if (pointer.id === this._rangedPointerId && this._rangedRadialOpen) {
        EventBus.emit('combat:radialMove', { x: pointer.x, y: pointer.y });
      }
    });
    const endRanged = (pointer) => {
      if (pointer.id === this._rangedPointerId) this._endRangedPress();
    };
    this._onScene('pointerup', endRanged);
    this._onScene('pointerupoutside', endRanged);

    // The Ranged-Magic button's icon reflects the currently loaded ability (slot 1 =
    // ranged bow; slots 2-5 = spell glyph). The radial is now the SOLE mobile switcher
    // (the 1-5 strip was removed on mobile), so this is the only on-HUD cue of what's
    // loaded. Default slot 1 already shows the bow, so no initial emit is needed.
    this._onBus('secondary:changed', ({ slot } = {}) => this._setRangedIcon(slot));
  }

  // Diamond cluster geometry: each button sits TOUCH_DIAMOND_SPREAD from the cluster
  // centre along an up/down/left/right axis. The centre is inset from the bottom-right
  // corner past the safe insets; portrait scales the inset + spread by `cs` so the whole
  // diamond shrinks to fit a narrow width without a separate layout branch.
  _diamondXY(pos, width, height, safe, cs) {
    const spread = TOUCH_DIAMOND_SPREAD * cs;
    const btnR = TOUCH_BUTTON_RADIUS * cs;
    const sb = this._bottomInset(safe);
    const cx = width - TOUCH_DIAMOND_CENTER_X * cs - safe.right;
    let cy = height - TOUCH_DIAMOND_CENTER_Y * cs - sb;
    // Never let the BOTTOM (dash) button dip under the effective bottom inset: clamp the
    // cluster centre up so cy + spread + btnR stays above it (Sprint mobile-control-feel).
    const maxCy = height - sb - spread - btnR;
    if (cy > maxCy) cy = maxCy;
    switch (pos) {
      case 'top': return { x: cx, y: cy - spread };
      case 'bottom': return { x: cx, y: cy + spread };
      case 'left': return { x: cx - spread, y: cy };
      case 'right': return { x: cx + spread, y: cy };
      default: return { x: cx, y: cy };
    }
  }

  _setRangedIcon(slot) {
    const r = this.touchButtons && this.touchButtons.ranged;
    if (!r) return;
    r.label.setText(slot === 1 ? RANGED_GLYPH : SPELL_GLYPH);
  }

  // Ranged-Magic press begins: start the long-press timer. A release before it elapses
  // is a tap (fire active secondary); if it elapses while still held, open the radial
  // centred on the button. The timer runs on UIScene's clock, which is NOT slowed by
  // the radial slow-mo (that only scales GameScene), so timing stays real.
  _beginRangedPress(pointer) {
    this._rangedPointerId = pointer.id;
    this._rangedRadialOpen = false;
    if (this._rangedPressTimer) this._rangedPressTimer.remove(false);
    const r = this.touchButtons.ranged;
    const cx = r ? r.bg.x : this.scene.scale.width;
    const cy = r ? r.bg.y : this.scene.scale.height;
    this._rangedPressTimer = this.scene.time.delayedCall(RADIAL_LONGPRESS_MS, () => {
      if (this._rangedPointerId === null) return; // already released
      this._rangedRadialOpen = true;
      EventBus.emit('combat:radialOpen', { cx, cy });
    });
  }

  // Ranged-Magic release: close the radial (selecting the highlighted slot) if it was
  // open, otherwise treat the press as a tap and fire the active secondary.
  _endRangedPress() {
    if (this._rangedPressTimer) {
      this._rangedPressTimer.remove(false);
      this._rangedPressTimer = null;
    }
    const r = this.touchButtons.ranged;
    if (r) {
      r.bg.setScale(1);
      r.label.setScale(1);
    }
    if (this._rangedRadialOpen) {
      EventBus.emit('combat:radialClose', {});
    } else {
      EventBus.emit('touch:ranged', {});
    }
    this._rangedRadialOpen = false;
    this._rangedPointerId = null;
  }

  // Promote a locked button to active: full opacity and its taps now emit. Retained as
  // a generic helper; the ranged button no longer starts locked (Sprint control-scheme-
  // combat-input un-gated it), so nothing calls this in normal play now.
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
    // Single tap opens the full-screen pause map (Sprint mobile-playability-2 —
    // replaced the persistent minimap). GameScene owns the toggle AND the rapid-tap dev
    // cheat counter, so 10 rapid taps (whether they land on this button while closed or
    // on the map backdrop while open) still reaches DevMenuScene — there is no tilde key
    // on a phone. The button is disabled while the map is up (MapScene's backdrop then
    // owns the close tap) so a single physical tap never double-fires across scenes.
    mapBtn.on('pointerdown', () => EventBus.emit('game:mapRequested', {}));
    this._onBus('map:opened', () => mapBtn.disableInteractive());
    this._onBus('map:closed', () => mapBtn.setInteractive());

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
    // Portrait shrinks every control by TOUCH_PORTRAIT_SCALE (the landscape radii read
    // oversized on a narrow width); landscape keeps full size. Applied to the actual
    // radii/fonts here — not just position — so the shrink genuinely takes effect in
    // BOTH orientation branches (previously the size was baked once at create()).
    const cs = portrait ? TOUCH_PORTRAIT_SCALE : 1;

    // Joystick (bottom-left). Landscape keeps the original 150px inset; portrait hugs
    // the left edge (radius + a small margin) so the narrow width still fits both the
    // stick and the bottom-right action cluster without overlap.
    const baseR = TOUCH_JOYSTICK_BASE_RADIUS * cs;
    const handleR = TOUCH_JOYSTICK_HANDLE_RADIUS * cs;
    this.joystickBaseRadius = baseR;
    this.joystick.baseRadius = baseR;
    this.joystick.handleRadius = handleR;
    const jx = (portrait ? baseR + 24 : 150) + safe.left;
    const jy = height - 150 - this._bottomInset(safe);
    this.joystick.baseX = jx;
    this.joystick.baseY = jy;
    this.joystickBase.setPosition(jx, jy).setRadius(baseR);
    this._drawJoystickDecor(jx, jy, baseR);
    // Don't yank the handle out from under an active thumb mid-drag.
    if (!this.joystickActive) {
      this.joystickHandle.setPosition(jx, jy).setRadius(handleR);
      this.joystickDot.setPosition(jx, jy);
    }

    // Action buttons — diamond cluster (bottom-right, inset past a right notch + the home
    // indicator). Positions come from the shared _diamondXY() so create() and every
    // resize/rotation agree; portrait shrinks the diamond via `cs`.
    const btnR = TOUCH_BUTTON_RADIUS * cs;
    this.buttonRadius = btnR;
    const labelPx = `${Math.round(parseInt(TOUCH_BUTTON_LABEL_PX, 10) * cs)}px`;
    this._buttonDefs.forEach((btn) => {
      const b = this.touchButtons[btn.id];
      if (!b) return;
      const { x, y } = this._diamondXY(btn.pos, width, height, safe, cs);
      b.bg.setPosition(x, y).setRadius(btnR);
      b.label.setPosition(x, y).setFontSize(labelPx);
      b.hitZone.setPosition(x, y).setRadius(btnR + 10);
      b.ring.clear();
      b.ring.lineStyle(2, 0xffffff, 0.5);
      b.ring.strokeCircle(x, y, btnR);
      // Interact plant icon tracks the button: re-seat + rescale to the (portrait-scaled)
      // radius so it stays centred and proportional across rotation.
      if (b.icon) {
        b.iconBaseScale = (btnR * INTERACT_ICON_FILL) / INTERACT_ICON_SRC_PX;
        b.icon.setPosition(x, y).setScale(b.iconBaseScale);
      }
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
