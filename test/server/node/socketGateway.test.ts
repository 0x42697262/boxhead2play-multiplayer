import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { SOCKET_PATH } from '../../../src/net/tuning.ts';
import { attachSocketGateway, type SocketGateway, type SocketGatewayOptions } from '../../../src/server/node/socketGateway.ts';
import { testHub } from '../support.ts';

const SWITCHING_PROTOCOLS = 'HTTP/1.1 101';
const OTHER_PATH = '/other';
const OTHER_REPLY = 'HTTP/1.1 418 Teapot\r\n\r\n';

interface Running {
  readonly server: Server;
  readonly gateway: SocketGateway;
  readonly port: number;
}

let running: Running | undefined;

async function start(options: SocketGatewayOptions, other?: (path: string | undefined, reply: (text: string) => void) => void): Promise<Running> {
  const server = createServer();
  const gateway = attachSocketGateway(server, testHub().hub, options);
  if (other) server.on('upgrade', (request, socket) => other(request.url, (text) => socket.end(text)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  running = { server, gateway, port: (server.address() as AddressInfo).port };
  return running;
}

function upgrade(port: number, path: string): Promise<{ readonly reply: string; readonly closed: boolean }> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    let reply = '';
    socket.on('connect', () =>
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
      ),
    );
    socket.on('data', (chunk: Buffer) => {
      reply += chunk.toString();
      if (reply.startsWith(SWITCHING_PROTOCOLS)) {
        socket.destroy();
        resolve({ reply, closed: false });
      }
    });
    socket.on('close', () => resolve({ reply, closed: true }));
    socket.on('error', () => undefined);
  });
}

afterEach(async () => {
  if (!running) return;
  const { server, gateway } = running;
  running = undefined;
  gateway.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('socket gateway', () => {
  it('accepts a WebSocket upgrade on the socket path', async () => {
    const { port } = await start({ rejectForeignUpgrades: true });
    expect((await upgrade(port, SOCKET_PATH)).reply.startsWith(SWITCHING_PROTOCOLS)).toBe(true);
  });

  it('closes upgrades for other paths and unparsable URLs when it owns the server', async () => {
    const { port } = await start({ rejectForeignUpgrades: true });
    expect(await upgrade(port, OTHER_PATH)).toEqual({ reply: '', closed: true });
    expect(await upgrade(port, '//[')).toEqual({ reply: '', closed: true });
  });

  it('leaves other upgrades to another listener when it shares the server', async () => {
    const { port } = await start({ rejectForeignUpgrades: false }, (path, reply) => {
      if (path !== SOCKET_PATH) reply(OTHER_REPLY);
    });
    expect((await upgrade(port, OTHER_PATH)).reply).toBe(OTHER_REPLY);
  });
});
