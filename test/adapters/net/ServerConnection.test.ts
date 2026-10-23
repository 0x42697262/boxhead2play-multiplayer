import { describe, expect, it } from 'vitest';
import { defaultServerUrl, RECONNECT_DELAY_MS, ServerConnection, type SocketLike } from '../../../src/adapters/net/ServerConnection.ts';
import type { ServerMessage } from '../../../src/net/protocol.ts';

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly sent: string[] = [];

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

  deliver(data: string): void {
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

  it('decodes messages, reports undecodable ones and sends only while open', () => {
    const { connection, sockets, events, messages } = setup();
    connection.connect();
    expect(connection.send({ type: 'leaveLobby' })).toBe(false);
    sockets[0]?.open();
    expect(connection.send({ type: 'leaveLobby' })).toBe(true);
    sockets[0]?.deliver('{"type":"error","reason":"lobbyFull"}');
    sockets[0]?.deliver('{"type":"bogus"}');
    expect(messages).toEqual([{ type: 'error', reason: 'lobbyFull' }]);
    expect(events).toEqual(['open', 'rejected']);
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
