// enemyIndicator.js
//
// Shared "!" / "?" alert tell used by both Slime and Skeleton when they spot or
// lose the player. Kept here (rather than duplicated per enemy) since the motion
// is identical: a coloured glyph pops above the enemy, bounces upward, optionally
// holds, then fades out and destroys itself.

import { FONT_FAMILY } from '../core/Constants.js';

const RISE_PX = 20;
const RISE_MS = 300;
const HOLD_MS = 200; // alert "!" lingers; the lost "?" skips this
const ALERT_FADE_MS = 500;
const LOST_FADE_MS = 300; // 300 rise + 300 fade = 600ms total for the "?"
const OFFSET_Y = 30; // px above the enemy centre

// enemy: the Phaser sprite. char: '!' or '?'. color: CSS hex string. fast: when
// true, fade immediately after the rise (no hold) and fade faster.
export function spawnEnemyAlert(enemy, char, color, fast) {
  const scene = enemy.scene;
  const ind = scene.add
    .text(enemy.x, enemy.y - OFFSET_Y, char, {
      fontFamily: FONT_FAMILY,
      fontSize: '20px',
      fontStyle: 'bold',
      color
    })
    .setOrigin(0.5)
    .setDepth(30);

  const fade = () =>
    scene.tweens.add({
      targets: ind,
      alpha: 0,
      duration: fast ? LOST_FADE_MS : ALERT_FADE_MS,
      onComplete: () => ind.destroy()
    });

  scene.tweens.add({
    targets: ind,
    y: ind.y - RISE_PX,
    duration: RISE_MS,
    ease: 'Bounce.easeOut',
    onComplete: () => {
      if (fast) fade();
      else scene.time.delayedCall(HOLD_MS, fade);
    }
  });

  return ind;
}
