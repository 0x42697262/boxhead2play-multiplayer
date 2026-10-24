import { describe, expect, it } from 'vitest';
import { defaultServerUrl, reconnectDelayMs, ServerConnection, type SocketLike } from '../../../src/adapters/net/ServerConnection.ts';
import { RECONNECT_BASE_DELAY_MS, RECONNECT_MAX_DELAY_MS } from '../../../src/adapters/net/tuning.ts';
import type { ServerMessage } from '../../../src/net/protocol.ts';
import { WireEncoder } from '../../../src/net/wire.ts';
import { SequenceRng } from '../../../src/domain/math/Rng.ts';

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

function setup(jitter = 0) {
  const sockets: FakeSocket[] = [];
  const timers: { delay: number; run: () => void }[] = [];
  const events: string[] = [];
  const messages: ServerMessage[] = [];
  const connection = new ServerConnection(
    'ws://host/ws',
    { opened: () => events.push('open'), closed: () => events.push('close'), message: (message) => messages.push(message), rejected: () => events.push('rejected') },
    new SequenceRng([jitter]),
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

  it('decodes binary messages as deltas, rejects invalid ones and sends only while open', () => {
    const { connection, sockets, events, messages } = setup();
    connection.connect();
    expect(sockets[0]?.binaryType).toBe('arraybuffer');
    expect(connection.send({ type: 'leaveLobby' })).toBe(false);
    sockets[0]?.open();
    expect(connection.send({ type: 'leaveLobby' })).toBe(true);
    sockets[0]?.deliver({ type: 'error', reason: 'lobbyFull' });
    sockets[0]?.deliver({ type: 'bogus' });
    sockets[0]?.deliver({ type: 'error', reason: 'notHost' });
    expect(messages).toEqual([
      { type: 'error', reason: 'lobbyFull' },
      { type: 'error', reason: 'notHost' },
    ]);
    expect(events).toEqual(['open', 'rejected']);
  });

  it('closes the socket when the wire cannot be decoded and starts over with a fresh decoder', () => {
    const { connection, sockets, timers, events, messages } = setup();
    connection.connect();
    sockets[0]?.open();
    sockets[0]?.deliver({ type: 'error', reason: 'lobbyFull' });
    sockets[0]?.deliverBytes(new Uint8Array([200, 1]));
    sockets[0]?.deliver({ type: 'error', reason: 'notHost' });
    expect(events).toEqual(['open', 'rejected', 'close']);
    expect(sockets[0]?.readyState).toBe(3);
    timers[0]?.run();
    sockets[1]?.open();
    sockets[1]?.deliver({ type: 'error', reason: 'notHost' });
    expect(messages).toEqual([
      { type: 'error', reason: 'lobbyFull' },
      { type: 'error', reason: 'notHost' },
    ]);
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
    expect(timers[0]?.delay).toBe(RECONNECT_BASE_DELAY_MS);
    timers[0]?.run();
    expect(sockets).toHaveLength(2);
    connection.disconnect();
    expect(timers).toHaveLength(1);
  });

  it('backs off exponentially up to the cap and starts over after a welcome', () => {
    const { connection, sockets, timers } = setup();
    connection.connect();
    for (let attempt = 0; attempt < 8; attempt++) {
      sockets.at(-1)?.close();
      timers.at(-1)?.run();
    }
    expect(timers.map((timer) => timer.delay)).toEqual([1500, 3000, 6000, 12000, 24000, RECONNECT_MAX_DELAY_MS, RECONNECT_MAX_DELAY_MS, RECONNECT_MAX_DELAY_MS]);
    sockets.at(-1)?.open();
    sockets.at(-1)?.deliver({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: true });
    sockets.at(-1)?.close();
    expect(timers.at(-1)?.delay).toBe(RECONNECT_BASE_DELAY_MS);
  });

  it('shortens each delay by up to half with the jitter source', () => {
    expect(reconnectDelayMs(0, 0)).toBe(RECONNECT_BASE_DELAY_MS);
    expect(reconnectDelayMs(0, 1)).toBe(RECONNECT_BASE_DELAY_MS / 2);
    expect(reconnectDelayMs(1, 0.5)).toBe(RECONNECT_BASE_DELAY_MS * 2 * 0.75);
    const { connection, sockets, timers } = setup(1);
    connection.connect();
    sockets[0]?.close();
    expect(timers[0]?.delay).toBe(RECONNECT_BASE_DELAY_MS / 2);
  });
});
