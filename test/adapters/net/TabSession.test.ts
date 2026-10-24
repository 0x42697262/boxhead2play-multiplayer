import { describe, expect, it } from 'vitest';
import { TabSession, type SessionLocks } from '../../../src/adapters/net/TabSession.ts';
import { SESSION_LOCK_PREFIX, SESSION_STORAGE_KEY } from '../../../src/adapters/net/tuning.ts';
import { MemoryStore } from '../../../src/adapters/storage/KeyValueStore.ts';

interface Waiter {
  readonly grant: () => void;
}

class FakeLocks implements SessionLocks {
  readonly held = new Set<string>();
  private readonly waiting = new Map<string, Waiter[]>();

  request(name: string, options: { signal: AbortSignal }, callback: () => Promise<void>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const grant = (): void => {
        this.held.add(name);
        void callback().then(() => {
          this.release(name);
          resolve(undefined);
        });
      };
      if (!this.held.has(name)) {
        grant();
        return;
      }
      const waiter = { grant };
      this.waiting.set(name, [...(this.waiting.get(name) ?? []), waiter]);
      options.signal.addEventListener('abort', () => {
        this.waiting.set(name, (this.waiting.get(name) ?? []).filter((entry) => entry !== waiter));
        reject(options.signal.reason);
      });
    });
  }

  release(name: string): void {
    this.held.delete(name);
    const [next, ...rest] = this.waiting.get(name) ?? [];
    this.waiting.set(name, rest);
    next?.grant();
  }
}

class Deadline {
  private readonly controllers: AbortController[] = [];

  readonly signal = (): AbortSignal => {
    const controller = new AbortController();
    this.controllers.push(controller);
    return controller.signal;
  };

  expire(): void {
    for (const controller of this.controllers) controller.abort();
  }
}

const lockName = (sessionId: string): string => SESSION_LOCK_PREFIX + sessionId;

function storeWith(sessionId: string): MemoryStore {
  const store = new MemoryStore();
  store.write(SESSION_STORAGE_KEY, sessionId);
  return store;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

describe('TabSession', () => {
  it('keeps the stored session id when its lock is free and holds the lock', async () => {
    const locks = new FakeLocks();
    const session = await TabSession.restore(storeWith('s1'), locks, new Deadline().signal);
    expect(session.read()).toBe('s1');
    expect(locks.held).toEqual(new Set([lockName('s1')]));
  });

  it('starts a fresh session when another tab holds the lock of the stored id', async () => {
    const locks = new FakeLocks();
    locks.held.add(lockName('s1'));
    const store = storeWith('s1');
    const deadline = new Deadline();
    const restoring = TabSession.restore(store, locks, deadline.signal);
    deadline.expire();
    const session = await restoring;
    expect(session.read()).toBeUndefined();
    expect(store.read(SESSION_STORAGE_KEY)).toBeUndefined();
  });

  it('gets the stored id when the reloaded document releases its lock within the wait', async () => {
    const locks = new FakeLocks();
    locks.held.add(lockName('s1'));
    const restoring = TabSession.restore(storeWith('s1'), locks, new Deadline().signal);
    locks.release(lockName('s1'));
    expect((await restoring).read()).toBe('s1');
    expect(locks.held).toEqual(new Set([lockName('s1')]));
  });

  it('holds the lock of a new id from welcome and releases the previous one', async () => {
    const locks = new FakeLocks();
    const store = storeWith('s1');
    const session = await TabSession.restore(store, locks, new Deadline().signal);
    session.write('s2');
    await settle();
    expect(session.read()).toBe('s2');
    expect(store.read(SESSION_STORAGE_KEY)).toBe('s2');
    expect(locks.held).toEqual(new Set([lockName('s2')]));
  });

  it('holds the lock of the first id a fresh tab gets', async () => {
    const locks = new FakeLocks();
    const session = await TabSession.restore(new MemoryStore(), locks, new Deadline().signal);
    expect(session.read()).toBeUndefined();
    session.write('s1');
    await settle();
    expect(locks.held).toEqual(new Set([lockName('s1')]));
  });

  it('keeps the stored id and stores new ones without the Web Locks API', async () => {
    const store = storeWith('s1');
    const session = await TabSession.restore(store, undefined, new Deadline().signal);
    expect(session.read()).toBe('s1');
    session.write('s2');
    expect(store.read(SESSION_STORAGE_KEY)).toBe('s2');
  });

  it('keeps the stored id when the lock request fails for another reason than the wait', async () => {
    const failing: SessionLocks = { request: () => Promise.reject(new Error('SecurityError')) };
    const session = await TabSession.restore(storeWith('s1'), failing, new Deadline().signal);
    expect(session.read()).toBe('s1');
  });
});
