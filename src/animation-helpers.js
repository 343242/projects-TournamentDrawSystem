// Shared animation state helpers for order-page and draw-page

export function createAnimationState(extra = {}) {
  return {
    isPaused: false,
    isComplete: false,
    pendingPause: false,
    phase: 'idle',
    flashControl: null,
    flyControl: null,
    nextTimer: null,
    ...extra,
  };
}

export function cancelActiveAnimations(state) {
  if (!state) return;
  if (state.flashControl) state.flashControl.cancel();
  if (state.flyControl) state.flyControl.cancel();
  clearTimeout(state.nextTimer);
  state.flashControl = null;
  state.flyControl = null;
  state.nextTimer = null;
}

export function pauseAnimState(state) {
  if (!state || state.isPaused || state.isComplete) return false;

  cancelActiveAnimations(state);

  if (state.phase === 'selected') {
    state.pendingPause = true;
    state.phase = 'idle';
    return false; // deferred — caller handles UI after fly lands
  }

  state.isPaused = true;
  state.phase = 'idle';
  return true; // caller should update UI
}

export function stopAnimState(state) {
  if (!state) return;
  cancelActiveAnimations(state);
  state.isPaused = true;
  state.isComplete = true;
  state.phase = 'idle';
}
