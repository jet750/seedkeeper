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
const WATER_BONUS = 0.33;

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

    this._pulseTween = null;

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

  water() {
    if (this.state !== STATE.PLANTED && this.state !== STATE.GROWING) return false;
    this.watered = true;
    this.refreshSoil();
    EventBus.emit('bed:watered', { bedIndex: this.bedIndex });
    return true;
  }

  harvest() {
    if (this.state !== STATE.READY) return null;
    const plantType = this.plantType;
    EventBus.emit('plant:harvested', { plantType });
    this.plantType = null;
    this.daysRemaining = 0;
    this.watered = false;
    this.setState(STATE.EMPTY);
    return plantType;
  }

  // --- Growth ---------------------------------------------------------------

  onDayAdvanced() {
    if (this.state === STATE.PLANTED || this.state === STATE.GROWING) {
      const dec = 1 + (this.watered ? WATER_BONUS : 0);
      this.daysRemaining = Math.max(0, this.daysRemaining - dec);
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
      this.setState(STATE.EMPTY);
      return;
    }
    this.plantType = saveState.plantType;
    this.plantColorNum = hexToNumber(this.gameData.plants[saveState.plantType].color);
    this.daysRemaining = saveState.daysRemaining;
    this.watered = !!saveState.watered;
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
  }
}

GardenBed.STATE = STATE;
