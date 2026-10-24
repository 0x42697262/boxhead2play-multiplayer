import { describe, expect, it } from 'vitest';
import type { LobbyDto } from '../../../src/net/protocol.ts';
import { LobbyInvite, type LobbyLink } from '../../../src/services/online/LobbyInvite.ts';
import { lobby } from './support.ts';

class FakeClient {
  lobby: LobbyDto | undefined = undefined;
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(next: LobbyDto | undefined): void {
    this.lobby = next;
    for (const listener of this.listeners) listener();
  }
}

class FakeLink implements LobbyLink {
  readonly initialCode = undefined;
  readonly shown: (string | undefined)[] = [];
  readonly copies: string[] = [];
  allowCopy = true;

  show(code: string | undefined): void {
    this.shown.push(code);
  }

  copy(code: string): Promise<boolean> {
    this.copies.push(code);
    return Promise.resolve(this.allowCopy);
  }
}

describe('LobbyInvite', () => {
  it('puts the lobby code in the address while in a lobby and removes it after leaving', () => {
    const client = new FakeClient();
    const link = new FakeLink();
    new LobbyInvite(client, link).syncAddress();
    client.set(lobby({ code: 'Y5Q3U' }));
    client.set(lobby({ code: 'Y5Q3U', roomId: 'ROOM_Single_0002' }));
    client.set(undefined);
    expect(link.shown).toEqual(['Y5Q3U', undefined]);
  });

  it('reports a copied link only after the clipboard accepted it, until forgotten', async () => {
    const client = new FakeClient();
    const link = new FakeLink();
    const invite = new LobbyInvite(client, link);
    invite.copy();
    expect(link.copies).toEqual([]);
    client.set(lobby({ code: 'Y5Q3U' }));
    link.allowCopy = false;
    invite.copy();
    await Promise.resolve();
    expect(invite.copied).toBe(false);
    link.allowCopy = true;
    invite.copy();
    await Promise.resolve();
    expect(invite.copied).toBe(true);
    invite.forget();
    expect(invite.copied).toBe(false);
  });
});
