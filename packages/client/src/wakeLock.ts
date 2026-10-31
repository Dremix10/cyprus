import { useEffect } from 'react';

/** The piece of the Screen Wake Lock API this game needs. */
export type ScreenWakeLockSentinel = {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
};

export type ScreenWakeLock = {
  request(type: 'screen'): Promise<ScreenWakeLockSentinel>;
};

export type PageVisibility = {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
};

export type GameWakeLock = {
  /** Hold the screen awake. Safe to call again. */
  start(): void;
  /** Let the screen sleep again. */
  stop(): void;
};

/**
 * Holds a screen wake lock while a game is open.
 * Browsers drop the lock when the tab is hidden, so it is requested again
 * the next time the tab is visible. Missing support and refusals are ignored.
 */
export function createGameWakeLock(deps: {
  wakeLock: ScreenWakeLock | null;
  visibility: PageVisibility;
}): GameWakeLock {
  let holding = false;
  let pending = false;
  let generation = 0;
  let sentinel: ScreenWakeLockSentinel | null = null;

  async function acquire(): Promise<void> {
    if (!holding || pending) return;
    if (!deps.wakeLock) return;
    if (deps.visibility.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;

    const requestId = ++generation;
    pending = true;
    try {
      const next = await deps.wakeLock.request('screen');
      if (!holding || requestId !== generation || deps.visibility.visibilityState !== 'visible') {
        await next.release().catch(() => {});
        return;
      }
      sentinel = next;
      next.addEventListener('release', () => {
        if (sentinel === next) sentinel = null;
      });
    } catch {
      // The browser refused, or this browser has no wake lock.
    } finally {
      pending = false;
    }
  }

  function onVisibility(): void {
    if (deps.visibility.visibilityState === 'visible') {
      void acquire();
    }
  }

  return {
    start() {
      if (holding) return;
      holding = true;
      deps.visibility.addEventListener('visibilitychange', onVisibility);
      void acquire();
    },
    stop() {
      if (!holding) return;
      holding = false;
      generation += 1;
      deps.visibility.removeEventListener('visibilitychange', onVisibility);
      const current = sentinel;
      sentinel = null;
      if (current && !current.released) {
        void current.release().catch(() => {});
      }
    },
  };
}

/** Keep the screen awake while `enabled` is true (a game is on screen). */
export function useGameWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const wakeLock =
      typeof navigator !== 'undefined' && navigator.wakeLock ? navigator.wakeLock : null;
    const lock = createGameWakeLock({ wakeLock, visibility: document });
    lock.start();
    return () => lock.stop();
  }, [enabled]);
}
