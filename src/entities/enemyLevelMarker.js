// enemyLevelMarker.js
//
// Small level read (Sprint 5): a row of pips above an enemy showing its level
// (1-5), colored by how dangerous it is relative to the player's current power
// — green safe / yellow risky / red dangerous. Kept here (rather than duplicated
// per enemy) since Slime and Skeleton use it identically. The owning enemy
// creates one, repositions it each frame, refreshes its color when player power
// changes, and hides/destroys it on death.

import { FONT_FAMILY } from '../core/Constants.js';

const OFFSET_Y = 34; // px above the enemy centre — just above the "!" alert tell
const DEPTH = 31; // above the alert indicator (30)

export function createLevelMarker(scene) {
  return scene.add
    .text(0, 0, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#6FCF6F',
      stroke: '#1a1410',
      strokeThickness: 3
    })
    .setOrigin(0.5, 0.5)
    .setDepth(DEPTH);
}

// Render the level as pips and (optionally) recolor by danger.
export function setMarkerLevel(marker, level, color) {
  if (!marker) return;
  marker.setText('●'.repeat(Math.max(1, level)));
  if (color) marker.setColor(color);
}

// Follow the enemy each frame (no allocation — just a position set).
export function positionLevelMarker(marker, enemy) {
  if (marker) marker.setPosition(enemy.x, enemy.y - OFFSET_Y);
}
