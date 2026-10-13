import { describe, expect, it } from 'vitest';
import {
  createGameWakeLock,
  type PageVisibility,
  type ScreenWakeLock,
  type ScreenWakeLockSentinel,
} from '../wakeLock.js';

function visibility(initial: DocumentVisibilityState = 'visible') {
  const listeners = new Set<() => void>();
  const page: PageVisibility & {
    set(next: DocumentVisibilityState): void;
  } = {
    visibilityState: initial,
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    set(next) {
      this.visibilityState = next;
      for (const listener of listeners) listener();
    },
  };
  return page;
}

function sentinel(): ScreenWakeLockSentinel {
  const listeners = new Set<() => void>();
  return {
    released: false,
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    async release() {
      if (this.released) return;
      (this as { released: boolean }).released = true;
      for (const listener of listeners) listener();
    },
  };
}

function api(request: ScreenWakeLock['request']): ScreenWakeLock & { calls: number } {
  return {
    calls: 0,
    async request(type) {
      this.calls += 1;
      return request(type);
    },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createGameWakeLock', () => {
  it('asks the browser to keep the screen awake while a game is open', async () => {
    const wakeLock = api(async () => sentinel());
    const lock = createGameWakeLock({ wakeLock, visibility: visibility() });

    lock.start();
    await flush();

    expect(wakeLock.calls).toBe(1);
  });

  it('releases the lock when the game is left', async () => {
    const held = sentinel();
    const lock = createGameWakeLock({
      wakeLock: api(async () => held),
      visibility: visibility(),
    });

    lock.start();
    await flush();
    lock.stop();
    await flush();

    expect(held.released).toBe(true);
  });

  it('does nothing when the browser has no wake lock', () => {
    const lock = createGameWakeLock({ wakeLock: null, visibility: visibility() });

    expect(() => {
      lock.start();
      lock.stop();
    }).not.toThrow();
  });

  it('ignores a refusal from the browser', async () => {
    const wakeLock = api(async () => {
      throw new Error('NotAllowedError');
    });
    const lock = createGameWakeLock({ wakeLock, visibility: visibility() });

    lock.start();
    await flush();

    expect(wakeLock.calls).toBe(1);
  });

  it('waits until the tab is visible, then asks again', async () => {
    const page = visibility('hidden');
    const wakeLock = api(async () => sentinel());
    const lock = createGameWakeLock({ wakeLock, visibility: page });

    lock.start();
    await flush();
    expect(wakeLock.calls).toBe(0);

    page.set('visible');
    await flush();
    expect(wakeLock.calls).toBe(1);
  });

  it('asks again after the browser drops the lock while the tab is hidden', async () => {
    const page = visibility('visible');
    const first = sentinel();
    const wakeLock = api(async () => (wakeLock.calls === 1 ? first : sentinel()));
    const lock = createGameWakeLock({ wakeLock, visibility: page });

    lock.start();
    await flush();

    page.set('hidden');
    await first.release();
    page.set('visible');
    await flush();

    expect(wakeLock.calls).toBe(2);
  });

  it('does not ask again after the game has been left', async () => {
    const page = visibility('hidden');
    const wakeLock = api(async () => sentinel());
    const lock = createGameWakeLock({ wakeLock, visibility: page });

    lock.start();
    lock.stop();
    page.set('visible');
    await flush();

    expect(wakeLock.calls).toBe(0);
  });

  it('drops a lock that arrives after the game was left', async () => {
    let resolveRequest: (value: ScreenWakeLockSentinel) => void = () => {};
    const late = sentinel();
    const wakeLock: ScreenWakeLock = {
      request: () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    };
    const lock = createGameWakeLock({ wakeLock, visibility: visibility() });

    lock.start();
    lock.stop();
    resolveRequest(late);
    await flush();

    expect(late.released).toBe(true);
  });
});
