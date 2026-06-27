// SettingsScene.js
//
// Options overlay (Sprint 12). Launched over the MenuScene (gear icon) or over
// the PauseScene (in-game). Click-and-drag volume sliders, a Mute All toggle,
// and a controls reference. Volumes persist globally (SaveSystem.saveSettings)
// and, when a run is live, are mirrored into GameScene's per-slot settings and
// applied immediately. ESC or [Close] dismisses and emits 'settings:closed'.

import Phaser from 'phaser';
import { fitCameraToVirtual } from '../core/ViewportFit.js';
import EventBus from '../core/EventBus.js';
import SaveSystem from '../core/SaveSystem.js';
import {
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  FONT_FAMILY,
  UI_PANEL_COLOR,
  UI_PANEL_ALPHA,
  UI_BORDER_COLOR,
  UI_BACKDROP_COLOR,
  UI_BACKDROP_ALPHA,
  UI_ACCENT_GOLD
} from '../core/Constants.js';

const PANEL_W = 720;
const PANEL_H = 700; // taller to fit the Footsteps slider (Sprint 10c fix)
const TRACK_W = 320;
const TRACK_H = 10;

const CONTROLS = [
  ['WASD / Arrows', 'Move'],
  ['SPACE', 'Attack'],
  ['F', 'Interact'],
  ['R', 'Ranged (once unlocked)'],
  ['SHIFT', 'Dash (once unlocked)'],
  ['~', 'Dev Menu (dev builds only)'],
  ['ESC', 'Pause / Close'],
  ['M', 'Open map (pauses)']
];

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  init(data) {
    this.fromScene = (data && data.from) || 'menu';
    // Prefer the live run's settings object so in-game changes are felt at once;
    // otherwise edit the global settings the title screen persists.
    const gs = this.scene.get('GameScene');
    this.gameScene = gs && gs.scene.isActive() ? gs : null;
    const base = this.gameScene ? this.gameScene.audioSettings : SaveSystem.loadSettings();
    this.settings = { ...SaveSystem.defaultSettings(), ...base };
  }

  create() {
    fitCameraToVirtual(this);
    const cx = VIRTUAL_WIDTH / 2;
    const top = (VIRTUAL_HEIGHT - PANEL_H) / 2;

    this.add
      .rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, UI_BACKDROP_COLOR, UI_BACKDROP_ALPHA)
      .setOrigin(0, 0)
      .setDepth(400)
      .setInteractive();

    this.add
      .rectangle(cx, VIRTUAL_HEIGHT / 2, PANEL_W, PANEL_H, UI_PANEL_COLOR, UI_PANEL_ALPHA)
      .setStrokeStyle(2, UI_BORDER_COLOR)
      .setDepth(401);

    this.add
      .text(cx, top + 34, 'SETTINGS', {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#EDD49A'
      })
      .setOrigin(0.5)
      .setDepth(402);

    this.add
      .rectangle(cx, top + 70, PANEL_W - 80, 2, UI_BORDER_COLOR)
      .setDepth(402);

    // --- Volume sliders ---
    let y = top + 120;
    this.makeSlider(cx, y, 'Music Volume', 'musicVolume');
    y += 60;
    this.makeSlider(cx, y, 'SFX Volume', 'sfxVolume');
    y += 60;
    // Footsteps are their own channel so the constant walk tap can be lowered
    // independently of combat/UI SFX (Sprint 10c fix).
    this.makeSlider(cx, y, 'Footstep Volume', 'footstepVolume');
    y += 60;
    this.makeSlider(cx, y, 'Master Volume', 'masterVolume');
    y += 66;

    // --- Mute toggle ---
    this.makeMuteToggle(cx, y);
    y += 60;

    // --- Controls reference ---
    this.add
      .rectangle(cx, y + 4, PANEL_W - 80, 2, UI_BORDER_COLOR)
      .setDepth(402);
    this.add
      .text(cx - (PANEL_W - 100) / 2, y + 24, 'CONTROLS', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#D4A83F'
      })
      .setOrigin(0, 0)
      .setDepth(402);
    const controlLines = CONTROLS.map(([k, v]) => `${k.padEnd(16, ' ')}— ${v}`).join('\n');
    this.add
      .text(cx - (PANEL_W - 100) / 2, y + 50, controlLines, {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: '#D1CCC6',
        lineSpacing: 5
      })
      .setOrigin(0, 0)
      .setDepth(402);

    // --- Close ---
    this.makeButton(cx, top + PANEL_H - 36, 220, 44, '[ Close ]   Esc', () => this.close());

    this.input.keyboard.on('keydown-ESC', () => this.close());
    this.events.once('shutdown', () => this.input.keyboard.removeAllListeners());
  }

  // --- Slider (click + drag) ------------------------------------------------

  makeSlider(cx, y, label, key) {
    const labelX = cx - PANEL_W / 2 + 60;
    const trackX = cx - 40;

    this.add
      .text(labelX, y, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#F5EFE6'
      })
      .setOrigin(0, 0.5)
      .setDepth(402);

    this.add
      .rectangle(trackX, y, TRACK_W, TRACK_H, 0x141210)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, UI_BORDER_COLOR)
      .setDepth(402);

    const fill = this.add
      .rectangle(trackX, y, TRACK_W * this.settings[key], TRACK_H, 0x8ab87e)
      .setOrigin(0, 0.5)
      .setDepth(403);

    const handle = this.add
      .rectangle(trackX + TRACK_W * this.settings[key], y, 18, 26, 0xedd49a)
      .setStrokeStyle(2, 0x141210)
      .setDepth(404)
      .setInteractive({ useHandCursor: true, draggable: true });

    const pct = this.add
      .text(trackX + TRACK_W + 24, y, `${Math.round(this.settings[key] * 100)}%`, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#9B9389'
      })
      .setOrigin(0, 0.5)
      .setDepth(402);

    const setValueFromX = (px) => {
      const v = Phaser.Math.Clamp((px - trackX) / TRACK_W, 0, 1);
      this.settings[key] = v;
      fill.width = TRACK_W * v;
      handle.x = trackX + TRACK_W * v;
      pct.setText(`${Math.round(v * 100)}%`);
      this.applySettings();
    };

    handle.on('drag', (pointer, dragX) => setValueFromX(dragX));

    // Click anywhere on the track to jump the handle there.
    const hit = this.add
      .rectangle(trackX, y, TRACK_W, 28, 0xffffff, 0.001)
      .setOrigin(0, 0.5)
      .setDepth(402)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (pointer) => setValueFromX(pointer.x));
  }

  makeMuteToggle(cx, y) {
    const labelX = cx - PANEL_W / 2 + 60;
    this.add
      .text(labelX, y, 'Mute All', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#F5EFE6'
      })
      .setOrigin(0, 0.5)
      .setDepth(402);

    const btn = this.add
      .rectangle(cx + 120, y, 130, 38, this.settings.muted ? 0x8a3a3a : 0x3a7d44)
      .setStrokeStyle(2, 0x141210)
      .setDepth(402)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(cx + 120, y, this.settings.muted ? 'ON' : 'OFF', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(403);

    btn.on('pointerup', () => {
      this.settings.muted = !this.settings.muted;
      btn.setFillStyle(this.settings.muted ? 0x8a3a3a : 0x3a7d44);
      txt.setText(this.settings.muted ? 'ON' : 'OFF');
      this.applySettings();
    });
  }

  makeButton(cx, cy, w, h, label, onClick) {
    const rect = this.add
      .rectangle(cx, cy, w, h, 0x36322e)
      .setStrokeStyle(2, 0x000000)
      .setDepth(402)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#F5EFE6'
      })
      .setOrigin(0.5)
      .setDepth(403);
    rect.on('pointerover', () => rect.setStrokeStyle(2, UI_ACCENT_GOLD));
    rect.on('pointerout', () => rect.setStrokeStyle(2, 0x000000));
    rect.on('pointerup', onClick);
    return rect;
  }

  // Persist globally and, when a run is live, mirror into the slot + apply live.
  applySettings() {
    SaveSystem.saveSettings(this.settings);
    // Mute affects the global sound manager regardless of where we were opened.
    this.sound.mute = !!this.settings.muted;
    if (this.gameScene && typeof this.gameScene.applyAudioSettings === 'function') {
      this.gameScene.applyAudioSettings(this.settings);
    }
  }

  close() {
    EventBus.emit('settings:closed', { from: this.fromScene });
    this.scene.stop();
  }
}
