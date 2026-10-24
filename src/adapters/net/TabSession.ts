import type { KeyValueStore } from '../storage/KeyValueStore.ts';
import { SESSION_LOCK_PREFIX, SESSION_STORAGE_KEY } from './tuning.ts';

export interface SessionToken {
  read(): string | undefined;
  write(sessionId: string): void;
}

export interface SessionLocks {
  request(name: string, options: { signal: AbortSignal }, callback: () => Promise<void>): Promise<unknown>;
}

export type ClaimDeadline = () => AbortSignal;

interface HeldLock {
  readonly sessionId: string;
  readonly release: () => void;
}

export function browserSessionLocks(navigator: Navigator): SessionLocks | undefined {
  return 'locks' in navigator ? navigator.locks : undefined;
}

export class TabSession implements SessionToken {
  private current: string | undefined = undefined;
  private wanted: string | undefined = undefined;
  private held: HeldLock | undefined = undefined;

  private constructor(
    private readonly store: KeyValueStore,
    private readonly locks: SessionLocks | undefined,
    private readonly deadline: ClaimDeadline,
  ) {}

  static async restore(store: KeyValueStore, locks: SessionLocks | undefined, deadline: ClaimDeadline): Promise<TabSession> {
    const session = new TabSession(store, locks, deadline);
    const stored = store.read(SESSION_STORAGE_KEY);
    if (stored === undefined) return session;
    if (await session.claim(stored)) session.current = stored;
    else store.remove(SESSION_STORAGE_KEY);
    return session;
  }

  read(): string | undefined {
    return this.current;
  }

  write(sessionId: string): void {
    this.current = sessionId;
    this.store.write(SESSION_STORAGE_KEY, sessionId);
    void this.claim(sessionId);
  }

  private claim(sessionId: string): Promise<boolean> {
    const locks = this.locks;
    if (!locks || this.held?.sessionId === sessionId) return Promise.resolve(true);
    this.wanted = sessionId;
    const signal = this.deadline();
    return new Promise<boolean>((resolve) => {
      try {
        locks.request(SESSION_LOCK_PREFIX + sessionId, { signal }, () => this.hold(sessionId, resolve)).catch(() => resolve(!signal.aborted));
      } catch {
        resolve(true);
      }
    });
  }

  private hold(sessionId: string, granted: (claimed: boolean) => void): Promise<void> {
    granted(true);
    if (this.wanted !== sessionId) return Promise.resolve();
    return new Promise<void>((release) => {
      this.held?.release();
      this.held = { sessionId, release };
    });
  }
}

export class MemorySessionToken implements SessionToken {
  constructor(private value: string | undefined = undefined) {}

  read(): string | undefined {
    return this.value;
  }

  write(sessionId: string): void {
    this.value = sessionId;
  }
}
