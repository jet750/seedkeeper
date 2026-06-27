// MapScene.js
//
// Full-screen pause map (Sprint mobile-playability-2) — replaces the persistent
// minimap that collided with the touch buttons in landscape and had no clean home in
// either orientation. GameScene pauses physics + transitions GameState → PAUSED, then
// launches this on top. It samples the same deterministic WorldZoneSystem the world is
// built from, draws it to fill the screen, marks HOME (garden centre) and YOU (the
// player's frozen position), and resumes on tap / Close / Esc / M.
//
// It owns no game state: every dismissal just emits 'game:mapRequested' and lets
// GameScene toggle the map closed (which stops this scene). That single event also
// feeds GameScene's 10-rapid-tap dev-menu cheat, so the cheat survives the minimap's
// removal. Laid out from the LIVE viewport so it fills the screen in either
// orientation and reflows on rotation.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';
import MobileDetect from '../core/MobileDetect.js';
import WorldZoneSystem from '../systems/WorldZoneSystem.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GARDEN_X,
  GARDEN_Y,
  GARDEN_WIDTH,
  GARDEN_HEIGHT,
  FONT_FAMILY,
  UI_BACKDROP_COLOR,
  UI_BACKDROP_ALPHA,
  UI_BORDER_COLOR
} from '../core/Constants.js';

const MAP_MARGIN = 28; // gap from the screen edges (added to the safe insets)
const MAP_TOP_RESERVE = 64; // header (title) zone above the map square
const MAP_BOTTOM_RESERVE = 72; // close-control zone below the map square
const MAP_SAMPLE = 6; // map px per sampled world cell (coarser = faster one-shot draw)
const RIVER_MARGIN = 60; // thickens the thin water so it reads at this scale
const COLOR_CLOSE = 0x36322e;

export default class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  init(data) {
    this.playerX = data && data.playerX != null ? data.playerX : WORLD_WIDTH / 2;
    this.playerY = data && data.playerY != null ? data.playerY : WORLD_HEIGHT / 2;
    this.worldZoneSystem = new WorldZoneSystem();
    this._objs = [];
  }

  create() {
    this.build();
    this.scale.on('resize', this.onResize, this);

    // Esc closes the map. (M is owned by UIScene's global handler — which toggles the
    // map both open AND closed — so binding M here too would double-fire and cancel
    // itself out.) Every close path routes through the same toggle event so GameScene
    // resumes physics + stops this scene.
    this.input.keyboard.on('keydown-ESC', () => EventBus.emit('game:mapRequested', {}));

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.input.keyboard.removeAllListeners();
    });
  }

  onResize() {
    this.build();
  }

  // (Re)draw everything from the live viewport — called on create and every resize.
  build() {
    this._objs.forEach((o) => o.destroy());
    this._objs = [];

    const w = this.scale.width;
    const h = this.scale.height;
    const safe = MobileDetect.isMobile()
      ? MobileDetect.getRawInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };

    // Full-bleed dim backdrop. A tap (pointerdown — the opening tap's release can't
    // reach it because this scene is created a frame later) requests a close.
    const backdrop = this.add
      .rectangle(0, 0, w, h, UI_BACKDROP_COLOR, UI_BACKDROP_ALPHA)
      .setOrigin(0, 0)
      .setDepth(300)
      .setInteractive();
    backdrop.on('pointerdown', () => EventBus.emit('game:mapRequested', {}));
    this._objs.push(backdrop);

    this._objs.push(
      this.add
        .text(w / 2, safe.top + MAP_MARGIN, 'MAP', {
          fontFamily: FONT_FAMILY,
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#EDD49A'
        })
        .setOrigin(0.5, 0)
        .setDepth(302)
    );

    // Square map area centred in the budget between the reserved header/footer + insets.
    const availTop = safe.top + MAP_MARGIN + MAP_TOP_RESERVE;
    const availBottom = h - safe.bottom - MAP_MARGIN - MAP_BOTTOM_RESERVE;
    const availLeft = safe.left + MAP_MARGIN;
    const availRight = w - safe.right - MAP_MARGIN;
    const availW = Math.max(80, availRight - availLeft);
    const availH = Math.max(80, availBottom - availTop);
    const mapSize = Math.min(availW, availH);
    const mapX = (w - mapSize) / 2;
    const mapY = availTop + (availH - mapSize) / 2;
    const scaleX = mapSize / WORLD_WIDTH;
    const scaleY = mapSize / WORLD_HEIGHT;

    this._objs.push(
      this.add.rectangle(mapX, mapY, mapSize, mapSize, 0x000000, 0.6).setOrigin(0, 0).setDepth(301)
    );

    // Sampled zone + river, batched into one Graphics.
    const g = this.add.graphics().setDepth(301);
    for (let mx = 0; mx < mapSize; mx += MAP_SAMPLE) {
      for (let my = 0; my < mapSize; my += MAP_SAMPLE) {
        const wx = mx / scaleX;
        const wy = my / scaleY;
        const color = this.worldZoneSystem.isNearRiver(wx, wy, RIVER_MARGIN)
          ? this.worldZoneSystem.getZoneColor('river')
          : this.worldZoneSystem.getZoneColor(this.worldZoneSystem.getZoneAt(wx, wy));
        g.fillStyle(color, 0.9);
        g.fillRect(mapX + mx, mapY + my, MAP_SAMPLE, MAP_SAMPLE);
      }
    }
    this._objs.push(g);

    this._objs.push(
      this.add
        .rectangle(mapX, mapY, mapSize, mapSize, 0xffffff, 0)
        .setOrigin(0, 0)
        .setStrokeStyle(2, UI_BORDER_COLOR)
        .setDepth(302)
    );

    // HOME marker — yellow flag at the garden centre.
    const homeX = mapX + (GARDEN_X + GARDEN_WIDTH / 2) * scaleX;
    const homeY = mapY + (GARDEN_Y + GARDEN_HEIGHT / 2) * scaleY;
    this._objs.push(this.add.rectangle(homeX, homeY, 12, 9, 0xffd23f).setDepth(303));
    this._objs.push(this.add.triangle(homeX, homeY - 10, 0, -6, -7, 4, 7, 4, 0xff7a1a).setDepth(303));
    this._objs.push(
      this.add
        .text(homeX, homeY + 8, 'HOME', { fontFamily: FONT_FAMILY, fontSize: '11px', color: '#ffd23f' })
        .setOrigin(0.5, 0)
        .setDepth(303)
    );

    // YOU marker — static cyan dot at the player's frozen position.
    const px = mapX + this.playerX * scaleX;
    const py = mapY + this.playerY * scaleY;
    this._objs.push(this.add.circle(px, py, 6, 0x00ffff).setStrokeStyle(2, 0xffffff).setDepth(304));
    this._objs.push(
      this.add
        .text(px, py - 18, 'YOU', {
          fontFamily: FONT_FAMILY,
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#00ffff'
        })
        .setOrigin(0.5, 1)
        .setDepth(304)
    );

    // Close control — kept clear of the bottom safe-area inset / iOS home indicator.
    const closeY = h - safe.bottom - MAP_MARGIN - 16;
    const closeBg = this.add
      .rectangle(w / 2, closeY, 240, 40, COLOR_CLOSE)
      .setStrokeStyle(2, 0x000000)
      .setDepth(303)
      .setInteractive({ useHandCursor: true });
    const closeLabel = this.add
      .text(w / 2, closeY, MobileDetect.isMobile() ? 'Close Map' : 'Close Map   ·   M / Esc', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(304);
    closeBg.on('pointerup', () => EventBus.emit('game:mapRequested', {}));
    this._objs.push(closeBg, closeLabel);
  }
}
