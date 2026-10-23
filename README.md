# Boxhead: 2Play Rooms in the browser

A TypeScript port of the 2007 Flash game *Boxhead: 2Play Rooms* by Sean Cooper. The
simulation follows the original ActionScript; the art, rooms, characters, sounds and fonts
are extracted from the original SWF and rendered with canvas.

## Quick start

Requirements: [Node.js](https://nodejs.org) 24 or newer and a Java runtime 8 or newer
(only used once, to extract the game assets).

```sh
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

The first `npm run dev` extracts the game assets from `boxhead2play.swf` into
`public/assets/`. It downloads the pinned JPEXS FFDec 26.4.0 decompiler into `.cache/`
(about 22 MB, SHA-256 checked) and takes about 20 seconds. Later runs check a stamp and
skip extraction unless the SWF, the extractor code or the FFDec version changed. To use an
FFDec you already have, set `FFDEC_JAR=/path/to/ffdec.jar`.

## Controls

| | Player 1 | Player 2 (death match) |
|---|---|---|
| Move | Arrow keys | W A S D |
| Fire | `/` | Space |
| Next / previous weapon | `.` / `,` | E / Q |
| Select weapon | 0 – 9 | |
| Pause | P | P |

Keys can be rebound in CONTROLS on the level select screen.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Extract assets if needed, then start the dev server |
| `npm run build` | Extract assets if needed, typecheck and build into `dist/` |
| `npm run preview` | Serve the `dist/` build |
| `npm run ci` | Lint, typecheck and test (zero warnings) |
| `npm run extract` | Force a fresh asset extraction |
| `npm run setup:assets` | Extract only if the assets are missing or out of date |

If you re-extract while `npm run dev` is running, restart the dev server: Vite does not
serve files added to `public/` after it started.

## Documentation

Start with `docs/architecture.md` and `AGENTS.md` (working rules, confirmed facts and the
verification checklist). The asset pipeline is described in `docs/assets/pipeline.md`.
