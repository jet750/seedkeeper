// spellGlyphs.js — shared procedural per-spell glyph drawing (Sprint mobile-polish-menus, Phase 1).
//
// Extracted from UIScene's mobile-radial so the SAME shape+hue glyph can also render on the
// TouchControlSystem fire button (the "what secondary is loaded" cue). No PNG — every glyph is
// drawn with Phaser Graphics, shape-distinct AND hue-distinct (double-encoded so they read for
// colour-blind players). Keyed by spell id; slot 1 = 'ranged'; 'spell' is the generic fallback.
//
// Consumers:
//   • UIScene.openRadial   — the long-press secondary-select ring
//   • TouchControlSystem   — the diamond ability button's active-spell icon

// Per-kind glyph colour. // TUNE
export const SPELL_GLYPH_COLORS = {
  ranged: 0xf5efe6, // arrow — parchment
  ember: 0xff8a3c, // flame — orange
  arc: 0xffe44f, // lightning — yellow
  frost: 0x9fe0ff, // snowflake — ice blue
  thornfield: 0x4f9e3a, // thorn — deep green
  bulwark: 0xa9c6e8, // shield — steel blue
  sprout_sentinel: 0x8ae66b, // sprout — leaf green
  spell: 0xd8c98a // unknown spell — muted gold
};

// Draw a high-contrast, shape-distinct glyph for `kind` into Graphics `g`, centred on g's local
// origin (so it scales about its own centre). `s` is the glyph half-extent in source px.
export function drawSpellGlyph(g, kind, color, s) {
  g.clear();
  g.fillStyle(color, 1);
  g.lineStyle(Math.max(2, s * 0.26), color, 1);
  switch (kind) {
    case 'ranged': // arrow pointing up (+ fletching)
      g.lineBetween(0, s, 0, -s * 0.35);
      g.fillTriangle(0, -s, -s * 0.5, -s * 0.2, s * 0.5, -s * 0.2);
      g.lineBetween(0, s, -s * 0.45, s * 0.55);
      g.lineBetween(0, s, s * 0.45, s * 0.55);
      break;
    case 'ember': // flame teardrop (pointed top, fat notched bottom)
      g.fillPoints(
        [
          { x: 0, y: -s }, { x: s * 0.62, y: s * 0.15 }, { x: s * 0.34, y: s * 0.8 },
          { x: 0, y: s * 0.5 }, { x: -s * 0.34, y: s * 0.8 }, { x: -s * 0.62, y: s * 0.15 }
        ],
        true
      );
      break;
    case 'arc': // lightning bolt zigzag
      g.fillPoints(
        [
          { x: s * 0.2, y: -s }, { x: -s * 0.5, y: s * 0.12 }, { x: -s * 0.05, y: s * 0.12 },
          { x: -s * 0.2, y: s }, { x: s * 0.55, y: -s * 0.18 }, { x: s * 0.08, y: -s * 0.18 }
        ],
        true
      );
      break;
    case 'frost': // snowflake — 3 crossing spokes + a small hub
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        g.lineBetween(-Math.cos(a) * s, -Math.sin(a) * s, Math.cos(a) * s, Math.sin(a) * s);
      }
      g.fillCircle(0, 0, s * 0.18);
      break;
    case 'thornfield': // thorny vine (diagonal stem + two thorns)
      g.lineBetween(-s * 0.5, s, s * 0.45, -s);
      g.fillTriangle(-s * 0.08, s * 0.25, -s * 0.6, s * 0.12, -s * 0.18, s * 0.6);
      g.fillTriangle(s * 0.2, -s * 0.2, s * 0.65, -s * 0.05, s * 0.28, -s * 0.6);
      break;
    case 'bulwark': // shield (flat top, pointed bottom)
      g.fillPoints(
        [
          { x: -s * 0.72, y: -s * 0.8 }, { x: s * 0.72, y: -s * 0.8 },
          { x: s * 0.72, y: s * 0.15 }, { x: 0, y: s }, { x: -s * 0.72, y: s * 0.15 }
        ],
        true
      );
      break;
    case 'sprout_sentinel': // sprout — stem + two leaves
      g.lineBetween(0, s, 0, -s * 0.1);
      g.fillTriangle(0, -s * 0.05, -s * 0.72, -s * 0.5, -s * 0.05, -s * 0.72);
      g.fillTriangle(0, -s * 0.05, s * 0.72, -s * 0.5, s * 0.05, -s * 0.72);
      break;
    default: // generic spell — a 4-point diamond
      g.fillPoints([{ x: 0, y: -s }, { x: s * 0.4, y: 0 }, { x: 0, y: s }, { x: -s * 0.4, y: 0 }], true);
  }
}
