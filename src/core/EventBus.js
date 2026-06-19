// EventBus.js — Singleton Pub/Sub
//
// Modules NEVER import each other directly.
// ALL cross-system communication goes through EventBus only.
//
// Usage:
//   import EventBus from '../core/EventBus.js';
//   EventBus.on('player:damaged', (data) => { ... });
//   EventBus.emit('player:damaged', { amount: 8 });
//   EventBus.off('player:damaged', handlerRef);

const EventBus = {
  listeners: {},

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return callback;
  },

  off(event, callback) {
    const bucket = this.listeners[event];
    if (!bucket) return;
    const idx = bucket.indexOf(callback);
    if (idx !== -1) {
      bucket.splice(idx, 1);
    }
    if (bucket.length === 0) {
      delete this.listeners[event];
    }
  },

  emit(event, data = {}) {
    const bucket = this.listeners[event];
    if (!bucket) return;
    // Iterate over a copy so handlers that unsubscribe mid-dispatch don't
    // mutate the array we're walking.
    bucket.slice().forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error(`EventBus handler error for "${event}":`, err);
      }
    });
  }
};

export default EventBus;
