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
    this.expiredEmitted = false; // Sprint 12 — fire day:timerExpired once, then run overtime
    this.todayWeather = null; // Sprint 11 — set by selectWeather()/restoreWeather()
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

    // Overtime (Sprint 12): the day no longer freezes at 0:00 — it runs into
    // negative as a "get home before you pass out" window, clamped at a fixed floor
    // (passOutFloorMs below zero) so the HUD can count down the time left. The
    // pass-out/KO consequence at the floor is the sortie sprint's job; here the
    // timer just stops falling once it bottoms out.
    const floor = -(this.gameData.daySystem.passOutFloorMs || 0);
    if (this.timerRemaining < floor) this.timerRemaining = floor;

    // raw carries the (possibly negative) overtime value for the HUD countdown;
    // remaining stays clamped ≥ 0 so the existing positive-timer readout is unchanged.
    EventBus.emit('day:timerTick', {
      remaining: Math.max(0, this.timerRemaining),
      raw: this.timerRemaining
    });

    if (!this.warningEmitted && this.timerRemaining <= this.gameData.daySystem.warningTime) {
      this.warningEmitted = true;
      EventBus.emit('day:timerWarning', {});
    }
    if (!this.urgentEmitted && this.timerRemaining <= this.gameData.daySystem.urgentTime) {
      this.urgentEmitted = true;
      EventBus.emit('day:timerUrgent', {});
    }
    // Fire the day-expiry buff exactly once at 0:00, then keep ticking into overtime
    // (no longer deactivates the timer — the player must walk home to stop the bleed).
    if (!this.expiredEmitted && this.timerRemaining <= 0) {
      this.expiredEmitted = true;
      EventBus.emit('day:timerExpired', {});
    }
  }

  advanceDay() {
    this.dayNumber++;
    this.timerRemaining = this.maxTimer();
    this.warningEmitted = false;
    this.urgentEmitted = false;
    this.expiredEmitted = false;
    // Notify garden beds to tick growth (and clear watered flags).
    EventBus.emit('day:advanced', { dayNumber: this.dayNumber });
    // Roll the day's weather after growth has ticked (Sprint 11).
    this.selectWeather();
  }

  // Pick one weather event for the new day. "Clear" is weighted ~3x so the
  // special weather keeps feeling meaningful. Emits weather:changed for the HUD.
  selectWeather() {
    const pool = this.gameData.weather;
    if (!pool || !pool.length) return;
    const clear = pool.find((w) => w.id === 'clear');
    const weighted = clear ? [...pool, clear, clear] : [...pool];
    this.todayWeather = weighted[Math.floor(Math.random() * weighted.length)];
    EventBus.emit('weather:changed', { weather: this.todayWeather, isNewDay: true });
  }

  // Restore a saved weather id without announcing it as a new day (used on load).
  restoreWeather(id) {
    const pool = this.gameData.weather;
    if (!pool || !pool.length) return;
    this.todayWeather = pool.find((w) => w.id === id) || pool.find((w) => w.id === 'clear') || pool[0];
  }

  resetTimer() {
    this.timerRemaining = this.maxTimer();
    this.warningEmitted = false;
    this.urgentEmitted = false;
    this.expiredEmitted = false;
  }
}
