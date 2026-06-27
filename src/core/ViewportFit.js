// ViewportFit.js
//
// Letterbox-fit a scene that is authored in the fixed 1600x900 virtual space into
// the live screen via its main camera, and keep it fit on resize.
//
// Why this exists: the mobile scale mode is Phaser.Scale.RESIZE (see main.js), which
// fills the viewport but makes every scene's coordinate space the raw on-screen px
// instead of a fixed 1600x900. GameScene (world) and UIScene (HUD) embrace that — the
// world shows more and the HUD reflows via layoutHUD(). But the menu/modal scenes
// hardcode 1600x900 coordinates (titles at VIRTUAL_WIDTH/2, footers at
// VIRTUAL_HEIGHT-40, etc.); without this their content would render off-screen on a
// phone and the play-slot buttons would be unreachable. Fitting the camera keeps them
// centred + scaled (pillar/letterboxed) exactly as FIT used to, with no per-element
// rework.
//
// Desktop is unaffected: there the mode is FIT, gameSize stays 1600x900, so the zoom
// resolves to 1 and centerOn(800,450) reproduces the default camera — a no-op.

import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './Constants.js';

export function fitCameraToVirtual(scene) {
  const cam = scene.cameras.main;
  if (!cam) return;

  const apply = () => {
    const sw = scene.scale.width;
    const sh = scene.scale.height;
    if (!sw || !sh) return;
    // Uniform scale that fits the whole 1600x900 design inside the screen (the
    // limiting axis fills exactly; the other gets symmetric margin = letterbox).
    const zoom = Math.min(sw / VIRTUAL_WIDTH, sh / VIRTUAL_HEIGHT);
    cam.setZoom(zoom);
    // Set zoom BEFORE centring — centerOn derives scroll from the current zoom.
    cam.centerOn(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2);
  };

  apply();
  scene.scale.on('resize', apply);
  scene.events.once('shutdown', () => scene.scale.off('resize', apply));
}
