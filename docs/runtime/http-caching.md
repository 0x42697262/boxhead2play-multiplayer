# HTTP caching and compression

Without cache headers every page load downloaded all ~700 asset files again (about 9 MiB).
With 16 players that is about 150 MiB per round of reloads. The production server
(`npm start`, `src/server/node/staticFiles.ts`) now makes repeat visits nearly free and
first visits about 4x smaller.

## How it works

| Piece | Where | What it does |
|---|---|---|
| Versioned asset URLs | `AssetLocator` in `src/adapters/assets/urls.ts` | `manifest.json` already lists the SHA-256 of every asset. The client appends `?v=<first 16 hex digits>` to every asset URL it builds from the manifest. A changed file gets a new URL. |
| Manifest revalidation | `loadCatalogs` | `manifest.json` itself has no version; it is fetched with `cache: 'no-cache'`, so the browser always asks the server whether it changed. |
| Cache policy | `src/server/node/httpCaching.ts` | `Cache-Control: public, max-age=31536000, immutable` when the request's `v` equals the file's content version, or for Vite's hashed bundles (`assets/<name>-<hash>.js`, `.css`, and their `.map`). Everything else, including `index.html`, `manifest.json` and a stale or missing `v`, gets `no-cache`. |
| Validation | `staticFiles.ts` | Every response carries a weak ETag from the file's SHA-256 (`W/"<32 hex>"`). A matching `If-None-Match` gets `304` without a body. Content hashes, not modification times, because the Nix store sets every file's mtime to 1970. Hashes are computed once per file and cached by size and mtime. |
| Precompression | `tools/build/precompress.ts`, run by `npm run build` | Writes `.br` (quality 11) and `.gz` (level 9) next to every `.html`, `.js`, `.css`, `.json`, `.map` and `.svg` file of at least 1 KiB, if it saves at least 10%. The server sends the variant the browser accepts (`br` first, then `gzip`) with `Content-Encoding` and `Vary: accept-encoding`. Nothing is compressed at request time: brotli quality 11 takes about 5.6 s for `characters/xsi.json`, and the game server shares the process. |

A wrong `v` is still served (the current file) but with `no-cache`, so a stale client
never pins the wrong content under an immutable URL.

The Vite dev server (`npm run dev`) ignores the `v` query on public files and keeps its own
caching. This document is about the production server. Behind Caddy, `encode` leaves
responses that already carry `Content-Encoding` alone.

## Measured (2026-10-23, Firefox headless, production build, `npm start`)

| | Before | After |
|---|---|---|
| Build output for the client | 10.40 MiB | 2.23 MiB with brotli |
| First load | about 9 MiB | 2.6 MiB (700 requests) |
| Reload or new visit | about 9 MiB | 2 conditional requests (`/` and `manifest.json`), both `304` without body; 698 resources from the browser cache without a request |

Firefox's Resource Timing reports the cached body size as `transferSize` for a `304`
(about 27 KiB for these two), but a logging proxy confirmed both requests carried
`If-None-Match` and got empty `304` replies.

After a new deploy, only the files whose content changed get new URLs. Unchanged assets
stay cached.
