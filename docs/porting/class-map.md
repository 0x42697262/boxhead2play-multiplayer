# Class map

| Original (AS2) | Port |
|---|---|
| `Thing.Math.CThing_Position` | `src/domain/math/Position.ts` |
| `Thing.Math.CThing_Angle` | `src/domain/math/Angle.ts`, `src/domain/math/Direction.ts` |
| `scidd.Math.CMath` (used subset) | `src/domain/math/scalar.ts` |
| `scidd.Math.CRandom` | `src/domain/math/Rng.ts` (original table was unused) |
| `World.Init.CWorld_Init*` (init clips in rooms) | Baked by `tools/extract/rooms/composeRoom.ts` into `rooms/*.json` `initObjects` and `pieces` |
| `DefineSprite_755` XSI data (`_global.mXSI_Data`) | Evaluated by `tools/extract/characters/evaluateXsi.ts` into `characters/xsi.json` and `anim-meta.json` |
| `World.Map.CMap` | `src/domain/map/GameMap.ts` |
| `World.Map.CMap_Cell` (cell, flags, adjacency, line tests) | `src/domain/map/MapCell.ts`, `src/domain/map/CollideFlag.ts`, `src/domain/map/LineProbe.ts` |
| `World.Map.CMap_Cell` statics `Nav_*`, `NavReal_*`, `NavDir_*`, `Nav_VD`, `NF_4` | `src/domain/map/NavigationField.ts` |
| `World.Map.CMap_Collide` | `src/domain/map/MapCollide.ts` |
| `World.Map.CMap_Mapwho` | `src/domain/map/Mapwho.ts` |
| `World.Map.CMap_Affect` | `src/domain/map/MapAffect.ts` |
| `World.Map.CMap_Decal` | `src/domain/map/MapDecals.ts` (emits `decalRequested`) |
| `World.Map.CMap_Math`, `World.Map.CMap_Navigation` | Empty in the original, not ported |
| `Thing.Math.CThing_Navigation` | `src/domain/things/navigation.ts` (`moveInDirection`) |
| `Thing.CThing` | `src/domain/things/Thing.ts`, `ThingFlag.ts`, `ThingClass.ts`, `ThingIds.ts` |
| `Thing.CThing_Collection` | `src/domain/things/ThingCollection.ts` |
| `Thing.Affect.CThing_Affect` | `src/domain/things/affects/Affect.ts`, `AffectType.ts` |
| `Thing.Affect.CThing_Affect_Bullet` | `src/domain/things/affects/BulletAffect.ts` |
| `Thing.Affect.CThing_Affect_Explosion` | `src/domain/things/affects/ExplosionAffect.ts` |
| `Thing.Affect.CThing_Affect_FireBall` | `src/domain/things/affects/FireBallAffect.ts` |
| `Thing.Affect.CThing_Affect_DevilAttack` | `src/domain/things/affects/DevilAttackAffect.ts` |
| `Thing.Affect.CThing_Affect_ZombieAttack` | `src/domain/things/affects/ZombieAttackAffect.ts` |
| `CThing_Creature.ProcessAffects` (switch only) | `src/domain/things/affects/hitReaction.ts` |
| `World.CWorld` (simulation) | `src/domain/world/World.ts`, `spawning.ts`, `camera.ts`, `ambience.ts`, `ScreenEffects.ts` |
| `World.CWorld.mGameMode` | `src/domain/world/GameMode.ts` |
| `CWorld_Init_*` kinds | `src/domain/world/RoomDefinition.ts` (`InitKind`) |
| `World.CUpgrades` | `src/domain/upgrades/Upgrades.ts`, `tables.ts`, `UpgradeProp.ts`, `contracts.ts` |
| `World.CHud` (game state only) | `src/domain/hud/HudState.ts` |
| `CMain.mFPS`, `CSaveData` gameplay options | `src/domain/world/SimulationSettings.ts` |
| `CInput` key edges as seen by the game | `src/domain/world/input.ts` (`TickInput`, `PlayerInput`) |
| `CSound.mSamples`, `CSound.mAmbience` keys | `src/domain/sounds.ts` (`SoundId`, `SOUND_SAMPLES`) |
| `CDrawPrimitive_XSI_Animation` (frame logic, XSI info) | `src/domain/animation/CharacterAnimator.ts`, `AnimationCatalog.ts` |
| `CDrawPrimitive_MovieClip_*` (frame logic) | `src/domain/animation/ClipAnimator.ts` |
| `CDrawPrimitive_*` render calls | `src/domain/visuals.ts` descriptors (rendering is an adapter) |
