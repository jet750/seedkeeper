// GameState.js — State Machine
//
// Single source of truth for the high-level game state. Transitions are
// validated; an invalid transition is a no-op that returns false. Every
// successful transition emits 'game:stateChanged' via EventBus.

import EventBus from './EventBus.js';

const STATES = {
  LOADING: 'LOADING',
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
  WIN: 'WIN'
};

// Valid transition table — keyed by current state, value is the set of
// states it is allowed to move to.
const VALID_TRANSITIONS = {
  LOADING: ['MENU'],
  MENU: ['PLAYING'],
  PLAYING: ['PAUSED', 'GAME_OVER', 'WIN'],
  PAUSED: ['PLAYING', 'MENU'],
  GAME_OVER: ['MENU'],
  WIN: ['MENU']
};

const GameState = {
  STATES,

  current: STATES.LOADING,

  transition(newState) {
    const allowed = VALID_TRANSITIONS[this.current] || [];
    if (!allowed.includes(newState)) {
      console.warn(
        `GameState: invalid transition ${this.current} → ${newState} (ignored)`
      );
      return false;
    }
    const previous = this.current;
    this.current = newState;
    EventBus.emit('game:stateChanged', { from: previous, to: newState });
    return true;
  },

  is(state) {
    return this.current === state;
  }
};

export default GameState;
