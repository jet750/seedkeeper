// BootScene.js
//
// Loads every asset listed in assetManifest.json, shows a progress bar, then
// transitions to the menu. Assets are discovered with Vite's import.meta.glob
// so we only ever queue files that actually exist on disk — missing art is
// replaced with generated placeholder textures and the console stays free of
// 404s until real assets land in /assets. Flip nothing to swap art in: drop a
// file matching the manifest filename into /assets and it loads automatically.

import Phaser from 'phaser';
import { fitCameraToVirtual } from '../core/ViewportFit.js';
import GameState from '../core/GameState.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, USE_TILED_WORLD, TILED_WORLD_KEY } from '../core/Constants.js';
import manifest from '../data/assetManifest.json';
// Explicit (glob-proof) `?url` map of every manifest image (Sprint 10). The eager
// import.meta.glob below drops most of /assets/images in the production build, so
// images + spritesheets resolve through this generated map instead; audio still
// uses the glob (it emits fine). See src/data/imageImports.js.
import IMAGE_URLS from '../data/imageImports.js';
// The baked, Phaser-ready Tiled world (Sprint 9): embedded tilesets, the heavy
// nature_dynamic layer stripped. Built by scripts/bake_world.cjs. Imported as a URL
// so Vite emits it as a static asset; its tileset images load via the manifest
// (ts_* keys) and GameScene assembles the layers.
import worldMapUrl from '../../assets/tilemaps/world_v1.json?url';
// Explicit (glob-proof) tileset image URLs for the Tiled world.
import TILESET_IMAGES, { tilesetKey } from '../world/tilesetImages.js';

// Eager URL map of audio that currently exists on disk. Empty object when the
// folder is empty (Sprint 1 state) — no network requests are made for it. Images
// no longer use a glob: they resolve through IMAGE_URLS (the glob silently drops a
// subset in the prod build — see MEMORY: vite-glob-asset-emission).
const audioFiles = import.meta.glob('/assets/audio/*.{mp3,wav,ogg}', {
  eager: true,
  query: '?url',
  import: 'default'
});

function basename(path) {
  return path.split('/').pop();
}

function urlFor(map, filename) {
  const key = Object.keys(map).find((p) => basename(p) === filename);
  return key ? map[key] : null;
}

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    fitCameraToVirtual(this);
    this.drawLoadingUI();

    let queued = 0;

    // Sprite sheets — URLs come from the explicit ?url map so every sheet emits in
    // the prod build (the glob dropped most plant sprites; see imageImports.js).
    manifest.spritesheets.forEach((entry) => {
      const url = IMAGE_URLS[entry.key];
      if (url) {
        this.load.spritesheet(entry.key, url, {
          frameWidth: entry.frameWidth,
          frameHeight: entry.frameHeight
        });
        queued++;
      } else {
        // TODO(asset): add ${entry.path} to assetManifest.json + re-run
        // scripts/gen_image_imports.cjs to wire "${entry.key}".
      }
    });

    // Static images (tilesets) — same explicit ?url map.
    manifest.images.forEach((entry) => {
      const url = IMAGE_URLS[entry.key];
      if (url) {
        this.load.image(entry.key, url);
        queued++;
      } else {
        // TODO(asset): add ${entry.path} to assetManifest.json + re-run
        // scripts/gen_image_imports.cjs.
      }
    });

    // Audio
    manifest.audio.forEach((entry) => {
      const url = urlFor(audioFiles, basename(entry.path));
      if (url) {
        this.load.audio(entry.key, url);
        queued++;
      } else {
        // TODO(asset): drop ${entry.path} into /assets/audio.
      }
    });

    // Hand-built Tiled world (Sprint 9) as TILED_JSON, plus its 17 tileset images
    // via explicit ?url imports (the glob pipeline above drops some in prod — see
    // tilesetImages.js). GameScene builds the layers and falls back to the
    // procedural world if the map is absent.
    if (USE_TILED_WORLD) {
      this.load.tilemapTiledJSON(TILED_WORLD_KEY, worldMapUrl);
      queued++;
      for (const [name, url] of Object.entries(TILESET_IMAGES)) {
        if (url) {
          this.load.image(tilesetKey(name), url);
          queued++;
        }
      }
    }

    this.load.on('progress', (value) => this.updateProgress(value));
    this.load.on('loaderror', (file) => {
      // Should not happen — we only queue files that exist — but stay graceful.
      console.info(`[boot] asset failed to load, using placeholder: ${file.key}`);
    });

    this._queuedCount = queued;
  }

  create() {
    this.generatePlaceholderTextures();

    // Show the loading screen briefly even when there is nothing to load so the
    // transition does not flash by.
    this.updateProgress(1);
    this.time.delayedCall(this._queuedCount > 0 ? 250 : 500, () => {
      GameState.transition('MENU');
      this.scene.start('MenuScene');
    });
  }

  // --- Loading UI -----------------------------------------------------------

  drawLoadingUI() {
    const cx = VIRTUAL_WIDTH / 2;
    const cy = VIRTUAL_HEIGHT / 2;

    this.add
      .text(cx, cy - 80, 'SEEDKEEPER', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#8AB87E'
      })
      .setOrigin(0.5);

    const barWidth = 480;
    const barHeight = 28;
    this._barX = cx - barWidth / 2;
    this._barY = cy + 10;
    this._barWidth = barWidth;
    this._barHeight = barHeight;

    // Border / track
    this.add
      .rectangle(cx, cy + 10 + barHeight / 2, barWidth, barHeight)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(2, 0xf5efe6)
      .setFillStyle(0x221e1b);

    // Fill (anchored left)
    this._barFill = this.add
      .rectangle(this._barX + 2, this._barY + barHeight / 2, 0, barHeight - 6, 0xf5efe6)
      .setOrigin(0, 0.5);

    this._progressText = this.add
      .text(cx, cy + 64, 'Loading… 0%', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '20px',
        color: '#9B9389'
      })
      .setOrigin(0.5);
  }

  updateProgress(value) {
    if (!this._barFill) return;
    const pct = Math.round(value * 100);
    this._barFill.width = (this._barWidth - 4) * value;
    this._progressText.setText(`Loading… ${pct}%`);
  }

  // --- Placeholder textures -------------------------------------------------

  generatePlaceholderTextures() {
    // Player placeholder — 48x48 rounded square (cerulean) with light border.
    if (!this.textures.exists('px_player')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x6b92bc, 1);
      g.fillRoundedRect(0, 0, 48, 48, 10);
      g.lineStyle(3, 0xf5efe6, 1);
      g.strokeRoundedRect(2, 2, 44, 44, 9);
      // small marker so facing/movement is readable while debugging
      g.fillStyle(0xf5efe6, 1);
      g.fillCircle(24, 16, 4);
      g.generateTexture('px_player', 48, 48);
      g.destroy();
    }

    // Green slime placeholder — 16x16 circle.
    if (!this.textures.exists('px_green_slime')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x8ab87e, 1);
      g.fillCircle(8, 9, 7);
      g.lineStyle(1, 0x3a5a34, 1);
      g.strokeCircle(8, 9, 7);
      g.generateTexture('px_green_slime', 16, 16);
      g.destroy();
    }

    // Dark slime placeholder — 16x16 purple circle (used from Sprint 3+).
    if (!this.textures.exists('px_dark_slime')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x8e6bbc, 1);
      g.fillCircle(8, 9, 7);
      g.lineStyle(1, 0x3a2a55, 1);
      g.strokeCircle(8, 9, 7);
      g.generateTexture('px_dark_slime', 16, 16);
      g.destroy();
    }
  }
}
