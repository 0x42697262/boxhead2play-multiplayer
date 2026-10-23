import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { SOCKET_PATH } from '../../net/tuning.ts';
import type { Hub } from '../Hub.ts';
import type { Connection } from '../ports.ts';
import { MAX_MESSAGE_BYTES, PING_INTERVAL_MS } from '../tuning.ts';

const REQUEST_BASE = 'http://localhost';
const OPEN = 1;

interface Watched {
  alive: boolean;
}

function socketConnection(socket: WebSocket): Connection {
  return {
    send(text) {
      if (socket.readyState === OPEN) socket.send(text);
    },
    close() {
      socket.close();
    },
  };
}

function text(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString('utf8');
}

export interface SocketGateway {
  close(): void;
}

export function attachSocketGateway(server: Server, hub: Hub): SocketGateway {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: true });
  const watched = new WeakMap<WebSocket, Watched>();
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (new URL(request.url ?? '', REQUEST_BASE).pathname !== SOCKET_PATH) return;
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client, request));
  };
  server.on('upgrade', upgrade);
  sockets.on('connection', (socket: WebSocket) => {
    const state: Watched = { alive: true };
    watched.set(socket, state);
    const link = hub.connect(socketConnection(socket));
    socket.on('pong', () => {
      state.alive = true;
    });
    socket.on('message', (data, binary) => {
      if (!binary) link.receive(text(data));
    });
    socket.on('close', () => link.closed());
    socket.on('error', () => socket.terminate());
  });
  const ping = setInterval(() => {
    for (const socket of sockets.clients) {
      const state = watched.get(socket);
      if (state && !state.alive) {
        socket.terminate();
        continue;
      }
      if (state) state.alive = false;
      socket.ping();
    }
  }, PING_INTERVAL_MS);
  return {
    close() {
      clearInterval(ping);
      server.off('upgrade', upgrade);
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
    },
  };
}
