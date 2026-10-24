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

The variant file names (`.br`, `.gz`) come from one place, `PRECOMPRESSED_SUFFIX` in
`httpCaching.ts`, which both the precompress tool and the server import.

`resolveStaticPath` decodes the request path once, refuses malformed `%` escapes and NUL
bytes, and never resolves outside the served directory; encoded dot segments (`%2e%2e`,
`..%2f`, `..%5c`) end up inside it and answer `404`. Both the production handler and the
dev middleware have table tests for these paths.

A read error before the headers are sent answers `500`. A read error after that, or a
client that disconnects mid-download, ends the response and closes the file
(`stream.pipeline`), so aborted downloads do not leak file descriptors.

A wrong `v` is still served (the current file) but with `no-cache`, so a stale client
never pins the wrong content under an immutable URL.

The Vite dev server (`npm run dev`) uses the same rules for versioned asset URLs:
`versionedAssetMiddleware` (`src/server/node/versionedAssets.ts`, installed by
`tools/dev/onlineServerPlugin.ts`) serves every `/assets/...?v=...` request from `publicDir`
through `staticFileHandler`, so a matching version is immutable and a reload takes the
SVGs, MP3s and fonts from the browser cache. Without it Vite answered each of the ~700
files with `no-cache`, and every reload revalidated all of them. Everything else, including
`manifest.json`, Vite's own `/node_modules/.vite/deps/*.js?v=...` and the source modules,
stays with Vite. Since the middleware stats files per request, assets that `npm run extract`
writes while the dev server runs are served too; only the unversioned `manifest.json` still
needs the restart described in `AGENTS.md`.

Checking it in DevTools: keep "Disable cache" off and reload with F5, not Ctrl+Shift+R
(which bypasses the cache). Cached rows still appear in the Network list, with "(disk
cache)" or "(memory cache)" in Chrome's Size column and "cached" in Firefox's Transferred
column. Behind Caddy, `encode` leaves
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
