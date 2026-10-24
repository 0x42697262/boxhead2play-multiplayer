import type { Server } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { LogLevel } from '../../src/config/env.ts';
import type { attachDevGameServer } from '../../src/server/devServer.ts';

const PLUGIN_NAME = 'boxhead-online-server';
const DEV_SERVER_MODULE = '/src/server/devServer.ts';
const DEV_ASSET_DIR = 'public/assets';

interface DevServerModule {
  readonly attachDevGameServer: typeof attachDevGameServer;
}

export function onlineServerPlugin(): Plugin {
  return {
    name: PLUGIN_NAME,
    apply: 'serve',
    async configureServer(server) {
      const http = server.httpServer as Server | null;
      if (!http) return;
      const module = (await server.ssrLoadModule(DEV_SERVER_MODULE)) as DevServerModule;
      const game = await module.attachDevGameServer(http, path.resolve(server.config.root, DEV_ASSET_DIR), LogLevel.Info);
      http.once('close', () => game?.close());
      server.middlewares.use((request, response, next) => {
        if (!game?.monitor.handle(request, response)) next();
      });
    },
  };
}
