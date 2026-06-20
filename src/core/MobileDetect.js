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

  // Convert the four CSS-pixel safe-area insets into virtual (1600x900) pixels,
  // using the live FIT scale factor between the virtual canvas and the screen.
  // Controls and HUD positioned with these never sit under the notch/home bar.
  getSafeArea(virtualWidth, virtualHeight, screenWidth, screenHeight) {
    const scaleX = screenWidth > 0 ? virtualWidth / screenWidth : 1;
    const scaleY = screenHeight > 0 ? virtualHeight / screenHeight : 1;
    return {
      top: this._cssInset('--sat') * scaleY,
      bottom: this._cssInset('--sab') * scaleY,
      left: this._cssInset('--sal') * scaleX,
      right: this._cssInset('--sar') * scaleX
    };
  }
};

export default MobileDetect;
