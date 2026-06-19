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
    this.watered = false;
    this.doubleHarvest = false; // set by a lucky watering; doubles the yield once

    // --- Visuals ---
    this.soil = scene.add
      .rectangle(x, y, BED_SIZE, BED_SIZE, SOIL_DRY)
      .setStrokeStyle(2, 0x3a2c1f)
      .setDepth(2);

    this.plantShape = scene.add
      .rectangle(x, y, BED_SIZE - 12, BED_SIZE - 12, 0x6fbf4f)
      .setDepth(3)
      .setVisible(false);

    this.daysText = scene.add
      .text(x, y - 42, '', {
        fontFamily: '"Courier New", monospace',
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
        fontFamily: '"Courier New", monospace',
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

    switch (newState) {
      case STATE.EMPTY:
        this.plantShape.setVisible(false);
        this.daysText.setVisible(false);
        break;
      case STATE.PLANTED:
        this.plantShape.setVisible(true).setFillStyle(0x6fbf4f).setDisplaySize(12, 12);
        this.daysText.setVisible(true);
        break;
      case STATE.GROWING:
        this.plantShape.setVisible(true).setFillStyle(0x5fae3f).setDisplaySize(18, 30);
        this.daysText.setVisible(true);
        break;
      case STATE.READY:
        this.plantShape
          .setVisible(true)
          .setFillStyle(this.plantColorNum)
          .setDisplaySize(BED_SIZE - 12, BED_SIZE - 12);
        this.daysText.setVisible(false);
        this.startPulse();
        break;
      default:
        break;
    }
    this.refreshSoil();
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
    this._pulseTween = this.scene.tweens.add({
      targets: this.plantShape,
      scaleX: { from: this.plantShape.scaleX, to: this.plantShape.scaleX * 1.05 },
      scaleY: { from: this.plantShape.scaleY, to: this.plantShape.scaleY * 1.05 },
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

  // --- Interactions ---------------------------------------------------------

  plant(plantType) {
    this.plantType = plantType;
    this.plantColorNum = hexToNumber(this.gameData.plants[plantType].color);
    this.daysRemaining = this.gameData.plants[plantType].growthDays;
    this.watered = false;
    this.setState(STATE.PLANTED);
    this.refreshDaysText();
    EventBus.emit('bed:planted', { plantType, bedIndex: this.bedIndex });
  }

  // Watering overhaul (Sprint 9): marking the bed wet still gates the once-a-day
  // rule, but watering now fires two probabilistic checks immediately rather
  // than a silent 33% growth bonus on the next day.
  water(canTier = 0) {
    if (this.state !== STATE.PLANTED && this.state !== STATE.GROWING) return false;
    this.watered = true;
    this.refreshSoil();
    EventBus.emit('bed:watered', { bedIndex: this.bedIndex });
    this.applyWateringEffects(canTier);
    return true;
  }

  applyWateringEffects(canTier) {
    if (this.daysRemaining <= 0) return; // already ready — nothing to roll

    // Check 1 — accelerated growth: chance to shave a full day off.
    const accelerateChance = ACCELERATE_BASE_CHANCE + canTier * ACCELERATE_PER_TIER;
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
    this.watered = !!saveState.watered;
    this.doubleHarvest = !!saveState.doubleHarvest;
    this.setDoubleBadge(this.doubleHarvest);
    if (saveState.ready) {
      this.setState(STATE.READY);
    } else {
      const full = this.gameData.plants[saveState.plantType].growthDays;
      this.setState(this.daysRemaining >= full ? STATE.PLANTED : STATE.GROWING);
      this.refreshDaysText();
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
    if (this._badgeTween) {
      this._badgeTween.remove();
      this._badgeTween = null;
    }
  }
}

GardenBed.STATE = STATE;
