// PaginatedMenu.js
//
// The shared full-screen, game-paused, paginated menu layout used by every
// in-game overlay menu (DevMenuScene, MarketplaceScene, and any future shop).
// Extracted from the dev-menu / marketplace pair, which had each grown a private
// copy of the same machinery: a full-bleed backdrop, a page model with ◀ ▶ /
// dots / swipe navigation, safe-inset-aware framing, and a close-button footer
// lifted clear of the bottom inset.
//
// This is a LAYOUT CONTROLLER, not a base Scene — the two consumers have very
// different lifecycles (the dev menu is a persistent dormant scene toggled open;
// the marketplace is launched and stopped) and different button art, so a shared
// base class would fight both. Instead each scene OWNS itself and composes one of
// these, handing the controller its content via callbacks. The controller owns:
//
//   • the full-bleed, input-swallowing backdrop
//   • the frame math (live viewport + safe insets → left/right/innerW/cx, the
//     header/content/footer bands, and the footer anchor points)
//   • the page index + navigation (keyboard ◀ ▶, swipe-to-page, swipe-down to
//     dismiss, and the dot indicators)
//   • the footer (Close + ◀ ▶ arrows + dots)
//   • object tracking + destroy-on-rerender (a single _objs list)
//
// The scene supplies, via config:
//   getPages(frame)                        -> array of opaque page objects
//   renderHeader(frame, pageData, ctx)     -> draw the header band
//   renderBody(frame, pageData, ctx)       -> draw the content band
//   button(cx,cy,w,h,label,fill,onClick,enabled,textColor) -> footer button (self-tracks)
//   onClose()                              -> dismiss (toggle off / stop scene)
//
// Everything the scene draws is tracked through `frame.track(...)` so the
// controller can tear the whole menu down and rebuild it on every resize / data
// change — the "modal rebuild" both scenes already relied on for a single layout
// path across desktop, mobile, rotation and live readouts.

import Phaser from 'phaser';
import MobileDetect from '../core/MobileDetect.js';

const FOOTER_DOT_R = 6;
const FOOTER_DOT_ON = 0xeac34f;
const FOOTER_DOT_OFF = 0x4d4843;

export default class PaginatedMenu {
  constructor(scene, config) {
    this.scene = scene;
    // Defaults keep the per-scene config small; both consumers pass the metrics
    // that differ between them (footer sizes, depth) and leave the rest.
    this.cfg = {
      margin: 20,
      backdropColor: 0x141210,
      backdropAlpha: 0.97,
      depth: 100, // backdrop depth; dots sit at depth + 2
      // Footer geometry (Close + arrows + dots).
      closeW: 200,
      closeH: 44,
      closeColor: 0x36322e,
      closeLabelMobile: 'Close',
      closeLabelDesktop: 'Close',
      arrowW: 50,
      arrowH: 44,
      arrowColor: 0x2d2926,
      arrowDisabledColor: 0x201d1a,
      arrowOffsetMax: 190,
      arrowOffsetPad: 36,
      dotGap: 22,
      footerTextColor: '#F5EFE6',
      // Behaviour.
      isOpen: () => true,
      swipeEnabled: () => true,
      dismissOnSwipeDown: true,
      closeOnEsc: false,
      ...config
    };

    this._objs = [];
    this._page = 0; // fallback page index when the scene doesn't own one
    this._pageCount = 1;
  }

  // --- Object tracking (single list; destroyed wholesale on every rebuild) ----

  track(...objs) {
    objs.forEach((o) => this._objs.push(o));
    return objs;
  }

  clear() {
    this._objs.forEach((o) => o.destroy());
    this._objs = [];
  }

  // --- Page index (delegated to the scene when it owns one, e.g. per-tab) -----

  getPage() {
    return this.cfg.getPageIndex ? this.cfg.getPageIndex() : this._page;
  }

  setPage(n) {
    if (this.cfg.setPageIndex) this.cfg.setPageIndex(n);
    else this._page = n;
  }

  changePage(delta) {
    const cur = this.getPage();
    const next = Phaser.Math.Clamp(cur + delta, 0, this._pageCount - 1);
    if (next === cur) return;
    this.setPage(next);
    this.render();
  }

  // --- Frame: live viewport + safe insets -> all layout anchors ---------------

  computeFrame() {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const isMobile = MobileDetect.isMobile();
    const safe = isMobile
      ? MobileDetect.getRawInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };
    const m = this.cfg.margin;

    const left = safe.left + m;
    const right = W - safe.right - m;
    const innerW = Math.max(120, right - left);
    const cx = (left + right) / 2;

    const headerTop = safe.top + m;
    const contentTop = headerTop + this.cfg.headerH;
    const contentBottom = H - safe.bottom - m - this.cfg.footerH;
    const bandH = Math.max(60, contentBottom - contentTop);

    const closeCY = H - safe.bottom - m - 16;
    const dotsY = closeCY - 34;

    return {
      scene: this.scene,
      track: this.track.bind(this),
      W,
      H,
      safe,
      margin: m,
      left,
      right,
      innerW,
      cx,
      headerTop,
      contentTop,
      contentBottom,
      bandH,
      closeCY,
      dotsY,
      isMobile
    };
  }

  // --- Full rebuild (open + every resize / data change) -----------------------

  render() {
    this.clear();
    if (!this.cfg.isOpen()) return;

    const frame = this.computeFrame();

    // Full-bleed page fill — near-opaque so no game peeks, interactive so it
    // swallows taps to the world behind.
    this.track(
      this.scene.add
        .rectangle(0, 0, frame.W, frame.H, this.cfg.backdropColor, this.cfg.backdropAlpha)
        .setOrigin(0, 0)
        .setDepth(this.cfg.depth)
        .setInteractive()
    );

    const pages = this.cfg.getPages(frame) || [];
    this._pageCount = Math.max(1, pages.length);
    const page = Phaser.Math.Clamp(this.getPage(), 0, this._pageCount - 1);
    this.setPage(page);
    const pageData = pages.length ? pages[page] : null;
    const ctx = { pageIndex: page, pageCount: this._pageCount };

    if (this.cfg.renderHeader) this.cfg.renderHeader(frame, pageData, ctx);
    if (pageData != null && this.cfg.renderBody) this.cfg.renderBody(frame, pageData, ctx);

    this.buildFooter(frame, this._pageCount, page);
  }

  // --- Footer: Close (+ ◀ ▶ arrows + dots when paginated) ---------------------

  buildFooter(frame, pageCount, page) {
    const c = this.cfg;
    const { cx, closeCY, dotsY, innerW, isMobile } = frame;

    c.button(
      cx,
      closeCY,
      c.closeW,
      c.closeH,
      isMobile ? c.closeLabelMobile : c.closeLabelDesktop,
      c.closeColor,
      () => c.onClose(),
      true,
      c.footerTextColor
    );

    if (pageCount <= 1) return;

    const off = Math.min(c.arrowOffsetMax, innerW / 2 - c.arrowOffsetPad);
    const prevOn = page > 0;
    const nextOn = page < pageCount - 1;
    c.button(
      cx - off,
      closeCY,
      c.arrowW,
      c.arrowH,
      '◀',
      prevOn ? c.arrowColor : c.arrowDisabledColor,
      () => this.changePage(-1),
      prevOn,
      c.footerTextColor
    );
    c.button(
      cx + off,
      closeCY,
      c.arrowW,
      c.arrowH,
      '▶',
      nextOn ? c.arrowColor : c.arrowDisabledColor,
      () => this.changePage(1),
      nextOn,
      c.footerTextColor
    );

    const startX = cx - (c.dotGap * (pageCount - 1)) / 2;
    for (let i = 0; i < pageCount; i++) {
      this.track(
        this.scene.add
          .circle(startX + i * c.dotGap, dotsY, FOOTER_DOT_R, i === page ? FOOTER_DOT_ON : FOOTER_DOT_OFF)
          .setDepth(c.depth + 2)
      );
    }
  }

  // --- Input: keyboard ◀ ▶ (+ Esc), swipe-to-page, swipe-down-dismiss ---------
  // Attached once per scene lifetime; every handler is guarded by isOpen() so a
  // dormant/closed menu never intercepts gameplay input.

  attachInput() {
    const kb = this.scene.input.keyboard;
    const c = this.cfg;

    this._onLeft = () => {
      if (c.isOpen()) this.changePage(-1);
    };
    this._onRight = () => {
      if (c.isOpen()) this.changePage(1);
    };
    kb.on('keydown-LEFT', this._onLeft);
    kb.on('keydown-RIGHT', this._onRight);

    if (c.closeOnEsc) {
      this._onEsc = () => {
        if (c.isOpen()) c.onClose();
      };
      kb.on('keydown-ESC', this._onEsc);
    }

    let startX = 0;
    let startY = 0;
    this._onDown = (p) => {
      if (!c.isOpen() || !c.swipeEnabled()) return;
      startX = p.x;
      startY = p.y;
    };
    this._onUp = (p) => {
      if (!c.isOpen() || !c.swipeEnabled()) return;
      const dx = p.x - startX;
      const dy = p.y - startY;
      if (c.dismissOnSwipeDown && dy > 120 && Math.abs(dx) < 90) c.onClose();
      else if (Math.abs(dx) > 120 && Math.abs(dy) < 90) this.changePage(dx < 0 ? 1 : -1);
    };
    this.scene.input.on('pointerdown', this._onDown);
    this.scene.input.on('pointerup', this._onUp);
  }

  destroy() {
    const kb = this.scene.input.keyboard;
    if (kb) {
      if (this._onLeft) kb.off('keydown-LEFT', this._onLeft);
      if (this._onRight) kb.off('keydown-RIGHT', this._onRight);
      if (this._onEsc) kb.off('keydown-ESC', this._onEsc);
    }
    if (this._onDown) this.scene.input.off('pointerdown', this._onDown);
    if (this._onUp) this.scene.input.off('pointerup', this._onUp);
    this.clear();
  }
}
