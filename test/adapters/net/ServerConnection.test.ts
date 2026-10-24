import { describe, expect, it } from 'vitest';
import { defaultServerUrl, RECONNECT_DELAY_MS, ServerConnection, type SocketLike } from '../../../src/adapters/net/ServerConnection.ts';
import type { ServerMessage } from '../../../src/net/protocol.ts';
import { WireEncoder } from '../../../src/net/wire.ts';

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  binaryType: BinaryType = 'blob';
  readonly sent: string[] = [];
  private readonly encoder = new WireEncoder();

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  deliver(message: { readonly type: string; readonly [key: string]: unknown }): void {
    this.deliverBytes(this.encoder.encode(message));
  }

  deliverBytes(bytes: Uint8Array): void {
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    this.onmessage?.({ data } as MessageEvent);
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const timers: { delay: number; run: () => void }[] = [];
  const events: string[] = [];
  const messages: ServerMessage[] = [];
  const connection = new ServerConnection(
    'ws://host/ws',
    { opened: () => events.push('open'), closed: () => events.push('close'), message: (message) => messages.push(message), rejected: () => events.push('rejected') },
    () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    {
      after: (delay, run) => {
        timers.push({ delay, run });
        return () => undefined;
      },
    },
  );
  return { connection, sockets, timers, events, messages };
}

describe('ServerConnection', () => {
  it('derives ws or wss from the page', () => {
    expect(defaultServerUrl({ protocol: 'https:', host: 'game.example:8443' })).toBe('wss://game.example:8443/ws');
    expect(defaultServerUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws');
  });

  it('decodes binary messages as deltas, reports undecodable ones and sends only while open', () => {
    const { connection, sockets, events, messages } = setup();
    connection.connect();
    expect(sockets[0]?.binaryType).toBe('arraybuffer');
    expect(connection.send({ type: 'leaveLobby' })).toBe(false);
    sockets[0]?.open();
    expect(connection.send({ type: 'leaveLobby' })).toBe(true);
    sockets[0]?.deliver({ type: 'error', reason: 'lobbyFull' });
    sockets[0]?.deliver({ type: 'error', reason: 'notHost' });
    sockets[0]?.deliver({ type: 'bogus' });
    sockets[0]?.deliverBytes(new Uint8Array([200, 1]));
    expect(messages).toEqual([
      { type: 'error', reason: 'lobbyFull' },
      { type: 'error', reason: 'notHost' },
    ]);
    expect(events).toEqual(['open', 'rejected', 'rejected']);
  });

  it('starts every new socket with a fresh decoder', () => {
    const { connection, sockets, timers, messages } = setup();
    connection.connect();
    sockets[0]?.open();
    sockets[0]?.deliver({ type: 'lobbyLeft', reason: 'left' });
    sockets[0]?.close();
    timers[0]?.run();
    sockets[1]?.open();
    sockets[1]?.deliver({ type: 'error', reason: 'lobbyFull' });
    sockets[1]?.deliver({ type: 'error', reason: 'notHost' });
    expect(messages).toEqual([
      { type: 'lobbyLeft', reason: 'left' },
      { type: 'error', reason: 'lobbyFull' },
      { type: 'error', reason: 'notHost' },
    ]);
  });

  it('reconnects after a drop until disconnected on purpose', () => {
    const { connection, sockets, timers, events } = setup();
    connection.connect();
    sockets[0]?.open();
    sockets[0]?.close();
    expect(events).toEqual(['open', 'close']);
    expect(timers[0]?.delay).toBe(RECONNECT_DELAY_MS);
    timers[0]?.run();
    expect(sockets).toHaveLength(2);
    connection.disconnect();
    expect(timers).toHaveLength(1);
  });
});
