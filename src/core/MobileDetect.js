// MobileDetect.js
//
// Single source of truth for "are we on a touch device?" and for translating the
// CSS safe-area insets (notch / home indicator / dynamic island) into the game's
// virtual 1600x900 coordinate space. Everything mobile-only keys off isMobile()
// so desktop never instantiates a single touch control or shifts a HUD pixel.

const MobileDetect = {
  // Treat phones/tablets, multi-touch devices, and narrow viewports as mobile.
  // maxTouchPoints > 1 catches touch laptops in tablet mode; the width check
  // catches narrow browser windows used for testing.
  isMobile() {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      navigator.maxTouchPoints > 1 ||
      window.innerWidth < 768
    );
  },

  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  },

  isAndroid() {
    return /Android/.test(navigator.userAgent);
  },

  // Read a single --sa* CSS variable (set in index.html) as an integer of CSS px.
  _cssInset(name) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  },

  // Raw CSS-pixel safe-area insets, no virtual-space conversion. Under the mobile
  // RESIZE scale mode the HUD coordinate space IS the on-screen CSS-pixel space
  // (game size == display size), so the insets need no scaling — a notch of 44 CSS
  // px is 44 HUD px. layoutHUD()/TouchControlSystem.layout() consume these directly.
  getRawInsets() {
    return {
      top: this._cssInset('--sat'),
      bottom: this._cssInset('--sab'),
      left: this._cssInset('--sal'),
      right: this._cssInset('--sar')
    };
  }
};

export default MobileDetect;
