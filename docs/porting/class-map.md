# Class map

| Original (AS2) | Port |
|---|---|
| `Thing.Math.CThing_Position` | `src/domain/math/Position.ts` |
| `Thing.Math.CThing_Angle` | `src/domain/math/Angle.ts`, `src/domain/math/Direction.ts` |
| `scidd.Math.CMath` (used subset) | `src/domain/math/scalar.ts` |
| `scidd.Math.CRandom` | `src/domain/math/Rng.ts` (original table was unused) |
| `World.Init.CWorld_Init*` (init clips in rooms) | Baked by `tools/extract/rooms/composeRoom.ts` into `rooms/*.json` `initObjects` and `pieces` |
| `DefineSprite_755` XSI data (`_global.mXSI_Data`) | Evaluated by `tools/extract/characters/evaluateXsi.ts` into `characters/xsi.json` and `anim-meta.json` |
