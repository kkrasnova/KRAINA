/**
 * Defer work until after initial interactions/animations (InteractionManager replacement).
 */
export function runAfterInteractions(callback) {
  const run = () => {
    try {
      callback();
    } catch (error) {
      console.warn('[runAfterInteractions]', error);
    }
  };

  if (typeof globalThis.requestIdleCallback === 'function') {
    const idleId = globalThis.requestIdleCallback(run);
    return {
      cancel: () => {
        if (typeof globalThis.cancelIdleCallback === 'function') {
          globalThis.cancelIdleCallback(idleId);
        }
      },
    };
  }

  const timeoutId = setTimeout(run, 1);
  return {
    cancel: () => clearTimeout(timeoutId),
  };
}
