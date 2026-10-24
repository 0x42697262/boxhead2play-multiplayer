import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const PLUGIN_NAME = 'boxhead-web-manifest';
const MANIFEST_FILE = 'manifest.webmanifest';
const MANIFEST_PATH = `/${MANIFEST_FILE}`;
const MANIFEST_TYPE = 'application/manifest+json';
const LOCALE_FILE = new URL('../../src/text/locales/en.json', import.meta.url);
const BLACK = '#000000';
const START_URL = './';

export interface WebManifest {
  readonly name: string;
  readonly short_name: string;
  readonly display: 'fullscreen';
  readonly orientation: 'landscape';
  readonly background_color: string;
  readonly theme_color: string;
  readonly start_url: string;
  readonly scope: string;
}

export function webManifest(texts: Readonly<Record<string, string>>): WebManifest {
  return {
    name: texts['app.title'] ?? '',
    short_name: texts['app.shortTitle'] ?? '',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: BLACK,
    theme_color: BLACK,
    start_url: START_URL,
    scope: START_URL,
  };
}

function manifestJson(): string {
  return JSON.stringify(webManifest(JSON.parse(readFileSync(LOCALE_FILE, 'utf8')) as Record<string, string>));
}

export function webManifestPlugin(): Plugin {
  let ssr = false;
  return {
    name: PLUGIN_NAME,
    configResolved(config) {
      ssr = Boolean(config.build.ssr);
    },
    configureServer(server) {
      server.middlewares.use(MANIFEST_PATH, (_request, response) => {
        response.setHeader('content-type', MANIFEST_TYPE);
        response.end(manifestJson());
      });
    },
    generateBundle() {
      if (!ssr) this.emitFile({ type: 'asset', fileName: MANIFEST_FILE, source: manifestJson() });
    },
  };
}
