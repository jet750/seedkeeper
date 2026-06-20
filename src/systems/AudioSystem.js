// AudioSystem.js
//
// Centralised sound-effects layer (Sprint 5). Listens to gameplay EventBus
// events and plays the matching SFX, reading per-save volume settings. Every
// playback is guarded by a cache-existence check, so the system is a no-op until
// real audio files land in /assets/audio (BootScene only loads files that exist
// on disk — see assetManifest.json). Music crossfade stays in GameScene; this
// system owns one-shot SFX plus the looping day-timer urgent pulse.
//
// Global mute is handled by Phaser's SoundManager (scene.sound.mute), toggled in
// GameScene — when muted, every sound including these is silenced automatically.

import EventBus from '../core/EventBus.js';

// One-shot event → SFX-key map. Events the game already emits.
const SFX_MAP = {
  'seed:collected': 'sfx_collect',
  'plant:harvested': 'sfx_harvest',
  'upgrade:purchased': 'sfx_upgrade',
  'player:attacked': 'sfx_swing',
  'enemy:damaged': 'sfx_hit_enemy',
  // 'enemy:died' handled separately so the skeleton can play at a lower pitch.
  'player:died': 'sfx_death_player',
  'player:slept': 'sfx_sleep',
  'bed:watered': 'sfx_water',
  'achievement:unlocked': 'sfx_achievement',
  'bundle:collected': 'sfx_collect'
};

export default class AudioSystem {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings || { masterVolume: 1.0, sfxVolume: 0.8 };
    this.urgentSound = null;
    this._handlers = [];

    this.registerListeners();

    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);
  }

  // Effective one-shot SFX volume = master × sfx.
  get sfxVolume() {
    return (this.settings.masterVolume ?? 1) * (this.settings.sfxVolume ?? 0.8);
  }

  // Play a SFX only if it was actually loaded (file present on disk).
  play(key, config = {}) {
    if (!this.scene.cache.audio.exists(key)) return;
    this.scene.sound.play(key, { volume: this.sfxVolume, ...config });
  }

  on(event, handler) {
    EventBus.on(event, handler);
    this._handlers.push([event, handler]);
  }

  registerListeners() {
    Object.entries(SFX_MAP).forEach(([event, key]) => {
      this.on(event, () => this.play(key));
    });

    // player:damaged fires both as a raw damage *request* (no currentHP) and as
    // an applied-damage *notification* (carries currentHP). Only the latter is a
    // real hit landing on the player.
    this.on('player:damaged', (d) => {
      if (d && d.currentHP !== undefined) this.play('sfx_hit_player');
    });

    // Enemy death: skeletons crumble at a lower pitch so the big enemy reads as
    // distinct from a slime pop (Sprint 13). Same sample, just retuned.
    this.on('enemy:died', (d) => {
      this.play('sfx_death_enemy', { rate: d && d.type === 'skeleton' ? 0.7 : 1 });
    });

    // Zone gate chime — fires on every garden⇄forest crossing.
    this.on('player:zoneChanged', () => this.play('sfx_gate'));

    // Day-timer audio cues.
    this.on('day:timerWarning', () => this.play('sfx_warning_bell'));
    this.on('day:timerUrgent', () => this.startUrgentLoop());
    this.on('day:advanced', () => this.stopUrgentLoop());
    this.on('day:timerExpired', () => this.stopUrgentLoop());
    this.on('player:zoneChanged', (d) => {
      // Leaving the forest also clears any urgent pulse.
      if (d && d.zone === 'garden') this.stopUrgentLoop();
    });
  }

  startUrgentLoop() {
    if (this.urgentSound) return;
    if (!this.scene.cache.audio.exists('sfx_urgent_pulse')) return;
    this.urgentSound = this.scene.sound.add('sfx_urgent_pulse', {
      loop: true,
      volume: this.sfxVolume
    });
    this.urgentSound.play();
  }

  stopUrgentLoop() {
    if (this.urgentSound) {
      this.urgentSound.stop();
      this.urgentSound.destroy();
      this.urgentSound = null;
    }
  }

  cleanup() {
    this._handlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._handlers = [];
    this.stopUrgentLoop();
  }
}
