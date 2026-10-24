import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { SOCKET_PATH } from '../../net/tuning.ts';
import { WireEncoder } from '../../net/wire.ts';
import type { Hub } from '../Hub.ts';
import type { Traffic } from '../monitorProtocol.ts';
import type { Connection } from '../ports.ts';
import { clientAddress } from './clientAddress.ts';
import { requestPathname } from './requestPath.ts';
import { MAX_MESSAGE_BYTES, PING_INTERVAL_MS } from '../tuning.ts';

const OPEN = 1;

interface Watched {
  alive: boolean;
}

function socketTraffic(transport: Socket): Traffic {
  return { bytesSent: transport.bytesWritten, bytesReceived: transport.bytesRead };
}

function socketConnection(socket: WebSocket, transport: Socket): Connection {
  const encoder = new WireEncoder();
  return {
    send(message) {
      if (socket.readyState === OPEN) socket.send(encoder.encode(message));
    },
    traffic() {
      return socketTraffic(transport);
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

export interface SocketGatewayOptions {
  readonly rejectForeignUpgrades: boolean;
  readonly trustProxy: boolean;
}

export interface SocketGateway {
  traffic(): Traffic;
  close(): void;
}

export function attachSocketGateway(server: Server, hub: Hub, options: SocketGatewayOptions): SocketGateway {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: true });
  const watched = new WeakMap<WebSocket, Watched>();
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (requestPathname(request.url) !== SOCKET_PATH) {
      if (options.rejectForeignUpgrades) socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client, request));
  };
  server.on('upgrade', upgrade);
  const transports = new Set<Socket>();
  let closedSent = 0;
  let closedReceived = 0;
  sockets.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const state: Watched = { alive: true };
    const transport = request.socket;
    watched.set(socket, state);
    transports.add(transport);
    const link = hub.connect(socketConnection(socket, transport), clientAddress(request, options.trustProxy));
    socket.on('pong', () => {
      state.alive = true;
    });
    socket.on('message', (data, binary) => {
      if (!binary) link.receive(text(data));
    });
    socket.on('close', () => {
      if (transports.delete(transport)) {
        closedSent += transport.bytesWritten;
        closedReceived += transport.bytesRead;
      }
      link.closed();
    });
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
    traffic() {
      let bytesSent = closedSent;
      let bytesReceived = closedReceived;
      for (const transport of transports) {
        bytesSent += transport.bytesWritten;
        bytesReceived += transport.bytesRead;
      }
      return { bytesSent, bytesReceived };
    },
    close() {
      clearInterval(ping);
      server.off('upgrade', upgrade);
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
    },
  };
}
