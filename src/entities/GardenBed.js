// GardenBed.js
//
// One plantable bed in the garden zone. Cycles EMPTY → PLANTED → GROWING →
// READY. Growth ticks on the EventBus 'day:advanced' event; watering speeds it
// up and is cleared each new day. Interactions (plant/water/harvest) are routed
// in by GameScene via the F key; the bed emits results over EventBus.

import Phaser from 'phaser';
import EventBus from '../core/EventBus.js';

const STATE = { EMPTY: 'EMPTY', PLANTED: 'PLANTED', GROWING: 'GROWING', READY: 'READY' };
const BED_SIZE = 56;
const SOIL_DRY = 0x5a4632;
const SOIL_WET = 0x3f3022;

// Watering overhaul (Sprint 9): each watering rolls two independent checks whose
// odds scale with the watering-can tier (0 = basic, 1 = copper, 2 = golden).
const ACCELERATE_BASE_CHANCE = 0.4; // +0.10 per can tier → 40 / 50 / 60%
const ACCELERATE_PER_TIER = 0.1;
const DOUBLE_BASE_CHANCE = 0.08; // +0.04 per can tier → 8 / 12 / 16%
const DOUBLE_PER_TIER = 0.04;

// Per-plant growth art (Economy Sprint 6/3d). Each plant now has its OWN
// spritesheet keyed by its plant type (e.g. 'corn', 'carrots') — a clean 7-column
// growth strip: col 0 = just-planted seed, cols 1-4 = sprout → mid growth, col 6 =
// ready to harvest. This replaces the single shared "farming_plants" sheet plus
// the PLANT_ROW_MAP row lookup; the frame is now the growth column alone.
const PLANT_SPRITE_FRAMES = 7; // columns 0..6 within a plant's strip
const PLANT_SPRITE_SCALE = 2.4; // 16px source → ~38px, sits on a 56px bed
const PLANT_SPRITE_ORIGIN_Y = 0.78; // standard crops root near the soil, not centre
const PLANT_SPRITE_ORIGIN_Y_TALL = 0.85; // tall (16x32) crops root lower onto the soil

// Real crop art is recognizable, so it's now the default growth visual. Falls back
// to the colored-dot indicator automatically when the farming sheet is absent (the
// production build may not emit every tileset — see usePlantSprite below).
const PREFER_PLANT_SPRITE = true;

// Colored-dot indicator radii per state (px) — the pre-10b feedback, restored.
const DOT_RADIUS = { PLANTED: 10, GROWING: 16, READY: 22 };

function hexToNumber(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export default class GardenBed {
  constructor(scene, x, y, bedIndex, gameData) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.bedIndex = bedIndex;
    this.gameData = gameData;

    this.state = STATE.EMPTY;
    this.plantType = null;
    this.plantColorNum = 0xffffff;
    this.daysRemaining = 0;
    this.totalGrowthDays = 1; // for the 3-stage growth visual (Sprint 13)
    this.watered = false;
    this.doubleHarvest = false; // set by a lucky watering; doubles the yield once

    // --- Visuals ---
    this.soil = scene.add
      .rectangle(x, y, BED_SIZE, BED_SIZE, SOIL_DRY)
      .setStrokeStyle(2, 0x3a2c1f)
      .setDepth(2);

    // Colored-dot growth indicator (restored). A circle so the plant reads as a
    // sprout/bud rather than a block; radius + fill change per state. Depth sits
    // above the garden ground (0), river (1) and soil (2).
    this.plantShape = scene.add
      .circle(x, y, DOT_RADIUS.PLANTED, 0x6fbf4f)
      .setDepth(6)
      .setVisible(false);

    // Per-plant growth sprites (Sprint 6/3d) are chosen per plant TYPE when it is
    // planted/restored — see configurePlantVisual() — because the texture key now
    // varies by crop. The image is created lazily on first use; until then (and
    // whenever a plant's sheet is absent) the colored dot above stays the growth
    // visual so feedback is never invisible.
    this.plantSprite = null;
    this.usePlantSprite = false;
    // The object the pulse/scale animates — the sprite when in use, else the dot.
    this.growthVisual = this.plantShape;

    this.daysText = scene.add
      .text(x, y - 42, '', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '14px',
        color: '#F5EFE6',
        backgroundColor: 'rgba(20,18,16,0.7)',
        padding: { x: 4, y: 2 }
      })
      .setOrigin(0.5, 1)
      .setDepth(20)
      .setVisible(false);

    // Persistent ×2 badge — visible while doubleHarvest is armed (Sprint 9).
    this.doubleBadge = scene.add
      .text(x + BED_SIZE / 2 - 2, y - BED_SIZE / 2 + 2, '×2', {
        fontFamily: '"SproutLands", "Courier New", monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffaa00',
        backgroundColor: 'rgba(20,18,16,0.75)',
        padding: { x: 3, y: 1 }
      })
      .setOrigin(0.5, 0.5)
      .setDepth(21)
      .setVisible(false);

    this._pulseTween = null;
    this._badgeTween = null;
    this._prePulseTween = null; // Sprint 13 — "almost ready" pulse during growth

    // Grow on day advance (EventBus only).
    this._onDayAdvanced = () => this.onDayAdvanced();
    EventBus.on('day:advanced', this._onDayAdvanced);
    scene.events.once('shutdown', this.cleanup, this);
    scene.events.once('destroy', this.cleanup, this);

    this.setState(STATE.EMPTY);
  }

  // --- State / visuals ------------------------------------------------------

  setState(newState) {
    this.state = newState;
    this.stopPulse();
    this.stopPrePulse();

    // Day counter shows only while the plant is still growing.
    this.daysText.setVisible(newState === STATE.PLANTED || newState === STATE.GROWING);

    if (this.usePlantSprite) this.applyPlantSprite(newState);
    else this.applyPlantShape(newState);

    if (newState === STATE.READY) this.startPulse();
    this.refreshSoil();
  }

  // Decide + configure the growth visual for the current plant TYPE (Sprint 6/3d).
  // Per-plant spritesheets are preferred when the plant's texture loaded; else the
  // colored dot is used so feedback is never invisible. Called from plant()/restore()
  // BEFORE setState so applyPlantSprite always has a sprite ready.
  configurePlantVisual(plantType) {
    const hasSprite =
      PREFER_PLANT_SPRITE && plantType && this.scene.textures.exists(plantType);
    this.usePlantSprite = hasSprite;
    if (hasSprite) {
      const def = this.gameData.plants[plantType];
      const originY = def && def.isTall ? PLANT_SPRITE_ORIGIN_Y_TALL : PLANT_SPRITE_ORIGIN_Y;
      if (!this.plantSprite) {
        this.plantSprite = this.scene.add
          .image(this.x, this.y, plantType, 0)
          .setDepth(6)
          .setVisible(false);
      }
      this.plantSprite.setTexture(plantType, 0);
      this.plantSprite.setOrigin(0.5, originY);
      this.growthVisual = this.plantSprite;
      this.plantShape.setVisible(false);
    } else {
      this.growthVisual = this.plantShape;
      if (this.plantSprite) this.plantSprite.setVisible(false);
    }
  }

  // Sprite growth visual (per-plant art): set this plant's texture + the growth
  // column for the current state. No tint — the crop art carries its own colour,
  // and tinting a coloured crop would muddy it.
  applyPlantSprite(newState) {
    const s = this.plantSprite;
    if (newState === STATE.EMPTY) {
      s.setVisible(false);
      return;
    }
    s.clearTint();
    s.setTexture(this.plantType, this.plantSpriteFrame(newState));
    s.setScale(PLANT_SPRITE_SCALE);
    s.setVisible(true);
  }

  // Growth column (0..6) within this plant's 7-frame strip: col 0 just-planted,
  // cols 1-4 interpolated by growth progress, col 6 ready to harvest (Sprint 6/3d).
  plantSpriteFrame(state) {
    if (state === STATE.PLANTED) return 0;
    if (state === STATE.READY) return PLANT_SPRITE_FRAMES - 1; // col 6
    const total = this.totalGrowthDays || 1;
    const progress = Phaser.Math.Clamp(1 - this.daysRemaining / total, 0, 1);
    return Phaser.Math.Clamp(Math.floor(progress * 4) + 1, 1, 4);
  }

  // Colored-dot growth visual (default; used unless the sprite path is opted in).
  // The dot grows by state and is tinted the plant's own colour so each bed's
  // crop is identifiable at a glance: small sprout → medium → large ready bud.
  applyPlantShape(newState) {
    const dot = this.plantShape;
    if (newState === STATE.EMPTY) {
      dot.setVisible(false);
      return;
    }
    const radius =
      newState === STATE.READY ? DOT_RADIUS.READY
      : newState === STATE.GROWING ? DOT_RADIUS.GROWING
      : DOT_RADIUS.PLANTED;
    dot.setRadius(radius);
    dot.setFillStyle(this.plantColorNum);
    dot.setScale(1); // reset any pulse scaling from a previous state
    dot.setVisible(true);
  }

  refreshSoil() {
    const wet = this.watered && this.state !== STATE.EMPTY;
    this.soil.setFillStyle(wet ? SOIL_WET : SOIL_DRY);
  }

  refreshDaysText() {
    const days = Math.ceil(this.daysRemaining);
    this.daysText.setText(`${days} ${days === 1 ? 'day' : 'days'}`);
  }

  startPulse() {
    if (this._pulseTween) return;
    const t = this.growthVisual;
    this._pulseTween = this.scene.tweens.add({
      targets: t,
      scaleX: { from: t.scaleX, to: t.scaleX * 1.05 },
      scaleY: { from: t.scaleY, to: t.scaleY * 1.05 },
      duration: 500,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });
  }

  stopPulse() {
    if (this._pulseTween) {
      this._pulseTween.remove();
      this._pulseTween = null;
    }
  }

  // Three-stage growth feel (Sprint 13). Progress = how far through the grow the
  // bed is. The plant scales up sprout→growing across the first two thirds, then
  // a gentle "almost ready" pulse begins for the final stage before READY.
  // Called on plant, day advance, and water — never per frame.
  updateGrowthVisual() {
    if (this.state !== STATE.PLANTED && this.state !== STATE.GROWING) return;
    // Real crop art advances by growth column (set here so day-advance and
    // watering visibly bump the crop); the colored-dot fallback keeps the
    // discrete sizes from applyPlantShape.
    if (this.usePlantSprite) {
      this.plantSprite.setFrame(this.plantSpriteFrame(this.state));
    }
    const total = this.totalGrowthDays || 1;
    const progress = Phaser.Math.Clamp(1 - this.daysRemaining / total, 0, 1);
    const t = this.growthVisual;
    const base = this.usePlantSprite ? PLANT_SPRITE_SCALE : 1;
    if (progress >= 0.66) {
      if (!this._prePulseTween) {
        t.setScale(base);
        this._prePulseTween = this.scene.tweens.add({
          targets: t,
          scaleX: { from: base, to: base * 1.1 },
          scaleY: { from: base, to: base * 1.1 },
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    } else {
      this.stopPrePulse();
      if (this.usePlantSprite) t.setScale(base);
    }
  }

  stopPrePulse() {
    if (this._prePulseTween) {
      this._prePulseTween.remove();
      this._prePulseTween = null;
    }
  }

  // --- Interactions ---------------------------------------------------------

  plant(plantType) {
    this.plantType = plantType;
    this.plantColorNum = hexToNumber(this.gameData.plants[plantType].color);
    this.daysRemaining = this.gameData.plants[plantType].growthDays;
    this.totalGrowthDays = this.daysRemaining;
    this.watered = false;
    this.configurePlantVisual(plantType);
    this.setState(STATE.PLANTED);
    this.refreshDaysText();
    this.updateGrowthVisual();
    EventBus.emit('bed:planted', { plantType, bedIndex: this.bedIndex });
  }

  // Watering overhaul (Sprint 9): marking the bed wet still gates the once-a-day
  // rule, but watering now fires two probabilistic checks immediately rather
  // than a silent 33% growth bonus on the next day.
  water(canTier = 0, accelBonus = 0) {
    if (this.state !== STATE.PLANTED && this.state !== STATE.GROWING) return false;
    this.watered = true;
    this.refreshSoil();
    // Physical watering feedback — expanding blue ripple (Sprint 13).
    if (this.scene.particleSystem) {
      this.scene.particleSystem.waterRipple({ x: this.x, y: this.y });
    }
    EventBus.emit('bed:watered', { bedIndex: this.bedIndex });
    this.applyWateringEffects(canTier, accelBonus);
    this.updateGrowthVisual();
    return true;
  }

  // accelBonus is an extra flat chance from weather (Sprint 11 Bright Sun).
  applyWateringEffects(canTier, accelBonus = 0) {
    if (this.daysRemaining <= 0) return; // already ready — nothing to roll

    // Check 1 — accelerated growth: chance to shave a full day off.
    const accelerateChance = ACCELERATE_BASE_CHANCE + canTier * ACCELERATE_PER_TIER + accelBonus;
    if (Math.random() < accelerateChance) {
      this.daysRemaining = Math.max(0, this.daysRemaining - 1);
      EventBus.emit('ui:floatText', {
        x: this.x,
        y: this.y - 20,
        text: '⚡ Grew faster!',
        color: '#88ff88'
      });
      if (this.daysRemaining <= 0) {
        this.setState(STATE.READY);
        EventBus.emit('ui:floatText', {
          x: this.x,
          y: this.y - 44,
          text: '✓ Ready!',
          color: '#ffff44'
        });
      } else {
        this.refreshDaysText();
      }
    }

    // Check 2 — double harvest: rare bonus, arms a persistent ×2 on the bed.
    const doubleChance = DOUBLE_BASE_CHANCE + canTier * DOUBLE_PER_TIER;
    if (!this.doubleHarvest && Math.random() < doubleChance) {
      this.doubleHarvest = true;
      this.setDoubleBadge(true);
      EventBus.emit('ui:floatText', {
        x: this.x,
        y: this.y - 32,
        text: '✨ Double harvest!',
        color: '#ffaa00'
      });
    }
  }

  setDoubleBadge(on) {
    this.doubleBadge.setVisible(on);
    if (on) {
      if (!this._badgeTween) {
        this._badgeTween = this.scene.tweens.add({
          targets: this.doubleBadge,
          scale: { from: 1, to: 1.18 },
          duration: 600,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1
        });
      }
    } else if (this._badgeTween) {
      this._badgeTween.remove();
      this._badgeTween = null;
      this.doubleBadge.setScale(1);
    }
  }

  harvest() {
    if (this.state !== STATE.READY) return null;
    const plantType = this.plantType;
    const yieldAmount = this.doubleHarvest ? 2 : 1;
    EventBus.emit('plant:harvested', {
      plantType,
      yield: yieldAmount,
      position: { x: this.x, y: this.y }
    });
    // Harvest flourish (Sprint 13): a white soil flash + a confetti burst so the
    // payoff feels rewarding rather than transactional. The bed clears at once so
    // it can't be double-harvested mid-flourish.
    if (this.scene.particleSystem) {
      this.scene.particleSystem.harvestConfetti({ x: this.x, y: this.y }, this.plantColorNum);
    }
    const flash = this.scene.add
      .rectangle(this.x, this.y, BED_SIZE, BED_SIZE, 0xffffff, 0.85)
      .setDepth(4);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });

    this.plantType = null;
    this.daysRemaining = 0;
    this.watered = false;
    this.doubleHarvest = false;
    this.setDoubleBadge(false);
    this.setState(STATE.EMPTY);
    return plantType;
  }

  // --- Growth ---------------------------------------------------------------

  onDayAdvanced() {
    if (this.state === STATE.PLANTED || this.state === STATE.GROWING) {
      // Growth is now a flat one day per night; watering's payoff is the
      // same-day acceleration/double rolls, not a hidden day-advance bonus.
      this.daysRemaining = Math.max(0, this.daysRemaining - 1);
      this.watered = false; // resets at start of each new day
      if (this.daysRemaining <= 0) {
        this.setState(STATE.READY);
      } else {
        this.setState(STATE.GROWING);
        this.refreshDaysText();
        this.updateGrowthVisual();
      }
    } else {
      this.watered = false;
      this.refreshSoil();
    }
  }

  // --- Save / restore (Sprint 4) --------------------------------------------

  serialize() {
    return {
      plantType: this.plantType,
      daysRemaining: this.daysRemaining,
      watered: this.watered,
      doubleHarvest: this.doubleHarvest,
      ready: this.state === STATE.READY
    };
  }

  // Reapply a saved bed state without emitting gameplay events (it is a load,
  // not a player action).
  restore(saveState) {
    if (!saveState || !saveState.plantType) {
      this.plantType = null;
      this.daysRemaining = 0;
      this.watered = false;
      this.doubleHarvest = false;
      this.setDoubleBadge(false);
      this.setState(STATE.EMPTY);
      return;
    }
    this.plantType = saveState.plantType;
    this.plantColorNum = hexToNumber(this.gameData.plants[saveState.plantType].color);
    this.daysRemaining = saveState.daysRemaining;
    this.totalGrowthDays = this.gameData.plants[saveState.plantType].growthDays;
    this.watered = !!saveState.watered;
    this.doubleHarvest = !!saveState.doubleHarvest;
    this.setDoubleBadge(this.doubleHarvest);
    this.configurePlantVisual(saveState.plantType);
    if (saveState.ready) {
      this.setState(STATE.READY);
    } else {
      this.setState(this.daysRemaining >= this.totalGrowthDays ? STATE.PLANTED : STATE.GROWING);
      this.refreshDaysText();
      this.updateGrowthVisual();
    }
  }

  // --- Helpers --------------------------------------------------------------

  isEmpty() {
    return this.state === STATE.EMPTY;
  }
  isReady() {
    return this.state === STATE.READY;
  }
  isGrowing() {
    return this.state === STATE.PLANTED || this.state === STATE.GROWING;
  }

  cleanup() {
    EventBus.off('day:advanced', this._onDayAdvanced);
    this.stopPulse();
    this.stopPrePulse();
    if (this._badgeTween) {
      this._badgeTween.remove();
      this._badgeTween = null;
    }
  }
}

GardenBed.STATE = STATE;
