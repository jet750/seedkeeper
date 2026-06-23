# Seedkeeper — Fix: Planting Picker, Camera Zoom & Settings Menu

**What this fixes:**
1. F key near empty bed broke planting entirely after 10c — reuse existing
   swap picker UI pattern instead of broken new event chain
2. Camera zoom increase — closer view on player
3. Settings menu for music and SFX volume control including footstep volume

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b fix/planting-picker-zoom-settings
```

---

## Fix 1 — Planting Picker Using Existing Swap Picker

The 10c planting picker implementation broke the F-key interaction chain.
The root cause is the new `bed:plantPrompt` event not correctly resuming
the plant action after selection, and the single-seed fallback failing.

**Do not build a new UI component.** Reuse the existing inventory swap picker
that already works. The swap picker already shows filled seed slots with plant
names and number key selection — it just needs a different title and a different
callback action.

### In GardenBed.js

Revert the F-key handler to a simpler pattern:

```javascript
onInteract(player) {
  if (this.state !== 'EMPTY') return; // READY and GROWING handled separately

  const filledSlots = player.seedSlots
    .map((type, i) => ({ type, index: i }))
    .filter(s => s.type !== null);

  if (filledSlots.length === 0) {
    // No seeds — show contextual prompt already handles this
    return;
  }

  if (filledSlots.length === 1) {
    // Only one seed — plant it directly, no picker needed
    this.plant(filledSlots[0].type, filledSlots[0].index, player);
    return;
  }

  // Multiple seeds — show picker
  EventBus.emit('inventory:plantPickerRequested', {
    bedIndex: this.index,
    slots: [...player.seedSlots],
    plantData: this.scene.gameData.plants
  });
}
```

### In UIScene

The existing swap picker listens to `inventory:swapRequested`. Add a parallel
listener for `inventory:plantPickerRequested` that shows the SAME picker panel
with a different title and different callback:

```javascript
EventBus.on('inventory:plantPickerRequested', ({ bedIndex, slots, plantData }) => {
  this.showSeedPicker({
    title: 'Choose a seed to plant',
    slots,
    plantData,
    showGrowDays: true,   // NEW — show grow time under each seed name
    onSelect: (slotIndex) => {
      EventBus.emit('bed:plantConfirmed', { bedIndex, slotIndex });
      this.hideSeedPicker();
    },
    onCancel: () => {
      this.hideSeedPicker();
    }
  });
});
```

### Update showSeedPicker to accept options object

The existing `showSeedPicker` or equivalent swap picker display function needs
to accept an options object instead of hardcoded behavior. Refactor it:

```javascript
showSeedPicker(options) {
  const { title, slots, plantData, showGrowDays, onSelect, onCancel } = options;

  // Same visual layout as existing swap picker
  // Add title text at top: options.title
  // For each filled slot, show:
  //   - Plant color circle
  //   - Plant name
  //   - IF showGrowDays: "[N] days" below name
  //   - Number key label
  // Cancel button at bottom

  // Store callbacks
  this.pickerOnSelect = onSelect;
  this.pickerOnCancel = onCancel;
}
```

### In GameScene

Listen to `bed:plantConfirmed` and execute the plant action:

```javascript
EventBus.on('bed:plantConfirmed', ({ bedIndex, slotIndex }) => {
  const bed = this.gardenBeds[bedIndex];
  const plantType = this.player.seedSlots[slotIndex];
  if (bed && plantType) {
    bed.plant(plantType, slotIndex, this.player);
  }
});
```

**Verify after fix:** F near empty bed with 1 seed — plants directly.
F near empty bed with 2+ seeds — shows picker with grow days. Select with
number key or click — plants correct seed. ESC — closes picker, nothing planted.
F near empty bed with no seeds — shows "Need a seed" contextual prompt only.

---

## Fix 2 — Camera Zoom Increase

Current zoom is 2.0. Increase to 2.5 and verify the world still feels
navigable (player can see enough ahead to react to enemies).

In GameScene, find `this.cameras.main.setZoom()` and change to:
```javascript
this.cameras.main.setZoom(2.5);
```

Also check if the minimap added in 10c needs rescaling at the new zoom.
The minimap uses `setScrollFactor(0)` so it should be zoom-independent,
but verify it still renders at the correct screen position.

If 2.5 feels too close during testing and enemies appear with no warning
time, fall back to 2.25 — add a note in the commit but pick whichever
looks better.

---

## Fix 3 — Settings Menu with Volume Controls

The settings menu was scoped in Sprint 12 but is needed now to control
footstep volume specifically. Build a functional settings overlay accessible
from the pause menu (ESC in-game) and from the main menu.

### New Scene: src/scenes/SettingsScene.js

Launched as overlay over current scene. Works from both MenuScene and
during gameplay via PauseScene.

```javascript
export default class SettingsScene extends Phaser.Scene {
  constructor() { super('SettingsScene'); }

  create({ returnScene }) {
    this.returnScene = returnScene || 'MenuScene';

    // Semi-transparent background
    this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      this.cameras.main.width,
      this.cameras.main.height,
      0x000000, 0.75
    ).setScrollFactor(0);

    // Panel background
    this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      480, 400,
      0x1a2410, 0.95
    ).setScrollFactor(0);

    this.createTitle();
    this.createVolumeSliders();
    this.createCloseButton();
    this.setupKeyboard();
  }

  createVolumeSliders() {
    const settings = this.registry.get('settings') || {
      masterVolume: 1.0,
      musicVolume: 0.5,
      sfxVolume: 0.8,
      footstepVolume: 0.25,
      muted: false
    };

    const sliders = [
      { key: 'masterVolume',   label: 'Master Volume',   y: -80  },
      { key: 'musicVolume',    label: 'Music',           y: -30  },
      { key: 'sfxVolume',      label: 'Sound Effects',   y: 20   },
      { key: 'footstepVolume', label: 'Footsteps',       y: 70   },
    ];

    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;

    sliders.forEach(({ key, label, y }) => {
      // Label
      this.add.text(cx - 180, cy + y, label, {
        fontFamily: '"SproutLands", monospace',
        fontSize: '14px',
        color: '#c8e8a0'
      }).setOrigin(0, 0.5);

      // Slider track
      const track = this.add.rectangle(cx + 20, cy + y, 200, 6, 0x4a6a30)
        .setOrigin(0, 0.5).setInteractive();

      // Slider fill
      const fill = this.add.rectangle(
        cx + 20,
        cy + y,
        200 * settings[key],
        6,
        0x88cc44
      ).setOrigin(0, 0.5);

      // Slider handle
      const handle = this.add.circle(
        cx + 20 + 200 * settings[key],
        cy + y,
        8,
        0xffffff
      ).setInteractive();

      // Value text
      const valueText = this.add.text(
        cx + 230, cy + y,
        `${Math.round(settings[key] * 100)}%`, {
        fontFamily: '"SproutLands", monospace',
        fontSize: '12px',
        color: '#ffffff'
      }).setOrigin(0, 0.5);

      // Drag behavior
      this.input.setDraggable(handle);
      handle.on('drag', (pointer, dragX) => {
        const minX = cx + 20;
        const maxX = cx + 220;
        const clampedX = Phaser.Math.Clamp(dragX, minX, maxX);
        const value = (clampedX - minX) / 200;
        handle.x = clampedX;
        fill.width = clampedX - minX;
        valueText.setText(`${Math.round(value * 100)}%`);
        settings[key] = value;
        this.applySettings(settings);
      });

      // Click on track to jump
      track.on('pointerdown', (pointer) => {
        const value = Phaser.Math.Clamp((pointer.x - (cx + 20)) / 200, 0, 1);
        settings[key] = value;
        handle.x = cx + 20 + 200 * value;
        fill.width = 200 * value;
        valueText.setText(`${Math.round(value * 100)}%`);
        this.applySettings(settings);
      });
    });

    // Mute toggle
    const muteBtn = this.add.text(cx, cy + 130, settings.muted ? '🔇 MUTED' : '🔊 SOUND ON', {
      fontFamily: '"SproutLands", monospace',
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5).setInteractive();

    muteBtn.on('pointerdown', () => {
      settings.muted = !settings.muted;
      muteBtn.setText(settings.muted ? '🔇 MUTED' : '🔊 SOUND ON');
      this.applySettings(settings);
    });

    this.currentSettings = settings;
  }

  applySettings(settings) {
    // Store in registry so all scenes can read
    this.registry.set('settings', settings);
    // Apply to sound manager
    if (this.sound) {
      this.sound.volume = settings.muted ? 0 : settings.masterVolume;
    }
    // Emit for AudioSystem to pick up specific channel volumes
    EventBus.emit('settings:changed', settings);
    // Auto-save
    EventBus.emit('save:requested', {});
  }

  setupKeyboard() {
    this.input.keyboard.on('keydown-ESC', () => this.closeSettings());
  }

  closeSettings() {
    this.scene.stop();
    // Return to whatever scene launched settings
    if (this.returnScene === 'PauseScene') {
      this.scene.resume('PauseScene');
    }
  }
}
```

### Wire footstep volume in Player.js

In the footstep audio code from Sprint 9, read footstep volume from settings:

```javascript
playFootstep() {
  const settings = this.scene.registry.get('settings') || {};
  const vol = settings.muted ? 0 : (settings.footstepVolume ?? 0.25) * (settings.masterVolume ?? 1.0);
  if (vol <= 0) return;
  const key = this.stepCount % 2 === 0 ? 'sfx_step' : 'sfx_step_2';
  if (this.scene.cache.audio.exists(key)) {
    this.scene.sound.play(key, { volume: vol, rate: 0.9 + Math.random() * 0.2 });
  }
}
```

### Wire AudioSystem to settings:changed

In AudioSystem.js, listen to settings changes and update all playing sounds:

```javascript
EventBus.on('settings:changed', (settings) => {
  this.sfxVolume = settings.muted ? 0 : settings.sfxVolume * settings.masterVolume;
  this.musicVolume = settings.muted ? 0 : settings.musicVolume * settings.masterVolume;

  // Update currently playing music
  const gardenMusic = this.scene.sound.get('bgm_garden');
  const forestMusic = this.scene.sound.get('bgm_forest');
  if (gardenMusic) gardenMusic.setVolume(this.musicVolume);
  if (forestMusic) forestMusic.setVolume(this.musicVolume);
});
```

### Register SettingsScene in main.js

Add `SettingsScene` to the scene list in main.js.

### ESC in-game opens pause with settings option

If PauseScene already exists from Sprint 12 scope: add Settings button.
If PauseScene doesn't exist yet: ESC key in GameScene opens SettingsScene
directly with `returnScene: 'GameScene'` and pauses physics while open.

```javascript
// In GameScene
this.input.keyboard.on('keydown-ESC', () => {
  if (this.scene.isActive('UpgradeScene')) return; // let upgrade handle its own ESC
  this.physics.pause();
  this.scene.launch('SettingsScene', { returnScene: 'GameScene' });
  this.scene.pause();
});
```

On SettingsScene close, resume GameScene:
```javascript
// In SettingsScene closeSettings():
if (this.returnScene === 'GameScene') {
  this.scene.resume('GameScene');
  const gameScene = this.scene.get('GameScene');
  if (gameScene) gameScene.physics.resume();
}
```

---

## Deliverables Checklist

```
[ ] F near empty bed with 1 seed — plants directly, no picker
[ ] F near empty bed with 2+ seeds — shows picker with grow days listed
[ ] Number keys select seed to plant
[ ] ESC closes picker without planting
[ ] F near empty bed with no seeds — shows contextual prompt only
[ ] Planting works correctly end to end after picker fix
[ ] Camera zoom at 2.5 (or 2.25 if 2.5 too close)
[ ] Player sprite fills reasonable portion of screen
[ ] Minimap still renders correctly at new zoom
[ ] Settings scene opens from ESC in-game
[ ] Settings has 4 sliders: master, music, SFX, footsteps
[ ] Dragging footstep slider to 0 silences footsteps immediately
[ ] Music volume slider affects currently playing background music
[ ] Mute toggle silences everything
[ ] Settings persist in save data
[ ] All prior systems functional — zero regressions
[ ] npm run dev — zero console errors

git checkout dev
git merge fix/planting-picker-zoom-settings
git push origin dev
```

Commit: `fix: planting picker zoom settings menu with volume controls`
