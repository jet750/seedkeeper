// enemyLevelMarker.js
//
// Floating enemy status (Sprint 7): a thin health bar + a "Lv#" number above the
// enemy. Replaces the Sprint 5 colored level pips. The level number is ALWAYS
// visible and its colour reflects danger vs. player power (green safe / yellow
// risky / red dangerous), so threat reads before engaging. The health bar shows
// only once the enemy has taken damage OR the player is within interaction range,
// to cut clutter. Shared by Slime + Skeleton (identical usage): the owner creates
// one, repositions it each frame (which also refreshes the bar), recolours the
// level on power change, and hides/destroys it on death.
//
// The returned marker is a Phaser Container so existing call sites keep working
// with setVisible() / setPosition() / destroy().

import Phaser from 'phaser';
import { FONT_FAMILY } from '../core/Constants.js';

const OFFSET_Y = 40; // px above the enemy centre
const DEPTH = 31; // above the alert indicator (30)
const BAR_W = 32; // health bar width (px)
const BAR_H = 4; // health bar height (px)
const BAR_Y = 7; // bar offset below the level number, within the container
const LEVEL_Y = -6; // level number offset above the bar, within the container
const HP_BAR_SHOW_RANGE = 120; // px — bar appears when the player is this close

const COLOR_BG = 0x1a1410;
const HP_GREEN = 0x6fcf6f;
const HP_YELLOW = 0xf2c94c;
const HP_RED = 0xeb5757;

export function createLevelMarker(scene) {
  const barBg = scene.add
    .rectangle(0, BAR_Y, BAR_W, BAR_H, COLOR_BG)
    .setOrigin(0.5, 0.5)
    .setStrokeStyle(1, 0x000000);
  // Left-anchored fill: deplete via scaleX so it shrinks from the right edge.
  const barFill = scene.add
    .rectangle(-BAR_W / 2, BAR_Y, BAR_W, BAR_H, HP_GREEN)
    .setOrigin(0, 0.5);
  const levelText = scene.add
    .text(0, LEVEL_Y, 'Lv1', {
      fontFamily: FONT_FAMILY,
      fontSize: '8px',
      fontStyle: 'bold',
      color: '#6FCF6F',
      stroke: '#1a1410',
      strokeThickness: 3
    })
    .setOrigin(0.5, 0.5)
    .setScale(2);

  const marker = scene.add.container(0, 0, [barBg, barFill, levelText]).setDepth(DEPTH);
  marker.barBg = barBg;
  marker.barFill = barFill;
  marker.levelText = levelText;
  return marker;
}

// Set the level number and recolor it by danger (green safe / yellow / red).
export function setMarkerLevel(marker, level, color) {
  if (!marker) return;
  marker.levelText.setText(`Lv${Math.max(1, level)}`);
  if (color) marker.levelText.setColor(color);
}

// Follow the enemy each frame; also refresh the health bar fill/colour and show
// it only when the enemy is hurt or the player is near (no allocation).
export function positionLevelMarker(marker, enemy) {
  if (!marker) return;
  marker.setPosition(enemy.x, enemy.y - OFFSET_Y);
  const maxHP = enemy.maxHP || 1;
  const frac = Phaser.Math.Clamp(enemy.hp / maxHP, 0, 1);
  marker.barFill.scaleX = frac;
  marker.barFill.setFillStyle(frac > 0.5 ? HP_GREEN : frac > 0.25 ? HP_YELLOW : HP_RED);

  const player = enemy.scene && enemy.scene.player;
  const near = player
    ? Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y) <= HP_BAR_SHOW_RANGE
    : false;
  const showBar = frac < 1 || near;
  marker.barBg.setVisible(showBar);
  marker.barFill.setVisible(showBar);
}
