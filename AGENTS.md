# Working agreement

Read `docs/architecture.md` first. The guidelines below are the project-specific
application of the team architecture rules.

## Hard rules

1. **No explanatory comments in code.** Use names, small functions and small types. Put the
   *why* in `docs/` (one file per topic) or an ADR in `docs/adr/`. Allowed: tool directives
   whose reason is documented in `docs/`, and JSDoc types where TypeScript cannot express
   them.
2. **No magic values.** Numbers, durations, limits, flags, asset ids, sound ids and strings live
   in one named place: `tuning.ts` per domain area for fixed game numbers, `as const` objects
   with derived union types for enums, `src/text/locales/en.json` for user-facing text,
   `src/text/logEvents.ts` for log event names, `src/text/errors.ts` for error codes. `0`, `1`,
   `true`, `null` and `''` are fine where obvious.
3. **Config is validated at boot.** Only `src/config/env.ts` reads `import.meta.env`. Everything
   else receives the frozen `Settings` object.
4. **Everything that persists is versioned.** Saved settings carry `version`. Generated asset
   catalogs carry `formatVersion`. Readers accept or migrate old versions.
5. **The domain is pure.** `src/domain/**` must not import adapters/services/ui/entry, touch DOM
   globals, read the clock or call `Math.random`. ESLint enforces this.

## Porting rules

* The decompiled ActionScript in `re/scripts/__Packages/` is the specification. Keep the
  original numbers and algorithms. When you change behavior deliberately (bug fix, removed
  feature), record it in `docs/porting/deviations.md`.
* Map each original class to one TypeScript module with an idiomatic name. Record the
  mapping in `docs/porting/class-map.md` (for example `CThing_Creature_Zombie` ->
  `src/domain/things/creatures/Zombie.ts`).
* Replace `random(n)` with `rng.int(n)` and `Math.random()` with `rng.next()`.
* Replace dynamic `SetState("State_X")` string dispatch with a typed state union and a
  handler map. Do not use `this[name]()`.
* AS2 `for..in` iterates newest-first. Where processing order matters for gameplay, document
  the order you chose in `docs/porting/deviations.md`.
* `x & 0xFFFFFF` on a position means "truncate to cell index". Use `Math.trunc` (or
  `Position.cellX` / `cellY`).

## Tooling

* `npm run ci` (lint, typecheck, test) must pass with zero warnings.
* TypeScript strict mode, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
* Tests: `test/` mirrors `src/`. Domain rules get fast unit tests without mocks. Services
  get tests with in-memory fakes. Use `SequenceRng` or `SeededRng` for deterministic tests.
* Relative imports include the `.ts` extension.
* Use American English everywhere.

## Confirmed facts

* JPEXS FFDec 26.4.0 deobfuscates this SWF's AS2 with
  `-config autoDeobfuscate=1,as12DeobfuscatorExecutionLimit=1000000 -export script`. Without
  it, the code is control-flow flattened and uses unresolved `§§constant(n)` pool references.
  Verified 2026-10-22.
* FFDec needs `-Djava.awt.headless=true` for sprite/frame export on a machine without X.
* The SWF is Flash 8, 640x480 stage. Logic runs at 25 ticks/s (`CMain.mFPS`).
* Character art is not bitmap data. It is pre-projected vector polygons per rotation and
  frame (`DefineSprite_755` DoAction, `mItems`), rasterized at runtime with materials from
  style sheets (`CDrawPrimitive_XSI_StyleSheet`).

## Verification checklist

Add one line per behavior change: what to do, and the result you expect.

* `npm run extract` -> `public/assets/manifest.json` exists and lists 18 rooms.
* `npm run dev`, choose a room, press arrows -> player 1 walks. `/` fires the pistol.
