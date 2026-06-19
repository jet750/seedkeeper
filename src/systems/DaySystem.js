// DaySystem.js
//
// The day/night timer, extracted from GameScene in Sprint 2. Counts down only
// while active (set by GameScene when the player is in the forest). Advancing a
// day refills the timer and broadcasts 'day:advanced' so garden beds tick their
// growth. All communication is via EventBus.

import EventBus from '../core/EventBus.js';

export default class DaySystem {
  constructor(scene, gameData) {
    this.scene = scene;
    this.gameData = gameData;
    this.dayNumber = 1;
    this.timerBonus = 0; // extra ms from the Day Timer upgrade (Sprint 4)
    this.timerRemaining = this.maxTimer();
    this.timerActive = false;
    this.warningEmitted = false;
    this.urgentEmitted = false;
  }

  maxTimer() {
    return this.gameData.daySystem.timerDuration + this.timerBonus;
  }

  setTimerActive(active) {
    this.timerActive = active;
  }

  // Day Timer upgrade: extends the per-day countdown. Applies to future days and
  // immediately tops up the current day's remaining time by the delta.
  setTimerBonus(ms) {
    const delta = ms - this.timerBonus;
    this.timerBonus = ms;
    if (delta > 0 && this.timerRemaining > 0) {
      this.timerRemaining = Math.min(this.timerRemaining + delta, this.maxTimer());
    }
  }

  update(delta) {
    if (!this.timerActive) return;

    this.timerRemaining -= delta;
    EventBus.emit('day:timerTick', { remaining: Math.max(0, this.timerRemaining) });

    if (!this.warningEmitted && this.timerRemaining <= this.gameData.daySystem.warningTime) {
      this.warningEmitted = true;
      EventBus.emit('day:timerWarning', {});
    }
    if (!this.urgentEmitted && this.timerRemaining <= this.gameData.daySystem.urgentTime) {
      this.urgentEmitted = true;
      EventBus.emit('day:timerUrgent', {});
    }
    if (this.timerRemaining <= 0) {
      this.timerRemaining = 0;
      EventBus.emit('day:timerExpired', {});
      this.setTimerActive(false);
    }
  }

  advanceDay() {
    this.dayNumber++;
    this.timerRemaining = this.maxTimer();
    this.warningEmitted = false;
    this.urgentEmitted = false;
    // Notify garden beds to tick growth (and clear watered flags).
    EventBus.emit('day:advanced', { dayNumber: this.dayNumber });
  }

  resetTimer() {
    this.timerRemaining = this.maxTimer();
    this.warningEmitted = false;
    this.urgentEmitted = false;
  }
}
