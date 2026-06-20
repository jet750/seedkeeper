// TutorialSystem.js
//
// First-run teaching layer (Sprint 12). Philosophy: never pause the game, never
// show a wall of text. Each hint is a small pill that fades in exactly when its
// trigger fires, shows once per save slot, then is gone forever. The system only
// decides *which* hint to show and when — UIScene owns the pill rendering and
// queueing. Communication is EventBus-only; it never imports GameScene.
//
// "Seen" state lives in the save slot's `tutorialsSeen` array (passed in by
// reference from GameScene); marking a hint seen mutates that array and requests
// an auto-save so a known player never sees the hint again, even after reload.

import EventBus from '../core/EventBus.js';

// Each hint maps a concrete EventBus event to a pill. `day` is an optional gate
// against the current day number. Order here is also the natural teaching order.
const HINTS = [
  { id: 'movement',    event: 'game:started',            text: 'WASD to move',                                  position: 'center',        duration: 3000, day: (d) => d === 1 },
  { id: 'forest_gate', event: 'tutorial:nearGate',       text: 'Walk through the gate to enter the forest',     position: 'bottom_center', duration: 4000, day: (d) => d === 1 },
  { id: 'first_seed',  event: 'tutorial:enteredForest',  text: 'Walk into glowing seeds to collect them',       position: 'top_center',    duration: 4000 },
  { id: 'slots_full',  event: 'inventory:swapRequested', text: 'Slots full — press F near a seed to swap',      position: 'bottom_center', duration: 4000 },
  { id: 'return_home', event: 'tutorial:inventoryFull',  text: 'Head back through the gate to plant your seeds', position: 'top_center',    duration: 5000, day: (d) => d === 1 },
  { id: 'plant_bed',   event: 'tutorial:enteredGarden',  text: 'Press F near a garden bed to plant',            position: 'top_center',    duration: 4000 },
  { id: 'sleep',       event: 'bed:planted',             text: 'Sleep to advance the day and grow your plants', position: 'top_center',    duration: 5000, day: (d) => d === 1 },
  { id: 'chest',       event: 'plant:harvested',         text: 'Spend harvested plants at the workshop chest',  position: 'top_center',    duration: 5000 },
  { id: 'attack',      event: 'tutorial:enemyContact',   text: 'SPACE to attack',                               position: 'bottom_center', duration: 3000 },
  { id: 'timer',       event: 'day:timerWarning',        text: 'Timer running low — head back to the garden',   position: 'top_center',    duration: 4000, day: (d) => d <= 2 }
];

export default class TutorialSystem {
  // getDay returns the live day number; tutorialsSeen is the save array (mutated).
  constructor(getDay, tutorialsSeen) {
    this.getDay = getDay;
    this.seen = tutorialsSeen || [];
    this._handlers = [];

    // Wire one EventBus handler per distinct trigger event.
    const events = [...new Set(HINTS.map((h) => h.event))];
    events.forEach((event) => {
      const handler = () => this.onTrigger(event);
      EventBus.on(event, handler);
      this._handlers.push([event, handler]);
    });
  }

  onTrigger(event) {
    const day = this.getDay();
    HINTS.filter((h) => h.event === event).forEach((h) => {
      if (this.seen.includes(h.id)) return;
      if (h.day && !h.day(day)) return;
      // Mark seen immediately so a repeating trigger can't re-enqueue it, then
      // ask UIScene to show the pill and request a save so it persists.
      this.seen.push(h.id);
      EventBus.emit('tutorial:hint', {
        id: h.id,
        text: h.text,
        position: h.position,
        duration: h.duration
      });
      EventBus.emit('save:requested', {});
    });
  }

  cleanup() {
    this._handlers.forEach(([event, handler]) => EventBus.off(event, handler));
    this._handlers = [];
  }
}
