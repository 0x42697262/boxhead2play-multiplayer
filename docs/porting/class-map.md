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
| `Thing.Creature.CThing_Creature` | `src/domain/things/creatures/Creature.ts`, `CreatureState.ts` |
| `Thing.Creature.CThing_Creature_Zombie` | `src/domain/things/creatures/Zombie.ts` |
| `Thing.Creature.CThing_Creature_Devil` | `src/domain/things/creatures/Devil.ts` |
| `Thing.Creature.CThing_Creature_Player` | `src/domain/things/creatures/Player.ts`, `WeaponInventory.ts` (weapon list, `RandomPickup`) |
| `GetCollection` of the creatures (XSI collections) | `src/domain/things/creatures/characterCollections.ts` |
| `CInput` key objects as read by the player | `src/domain/things/creatures/PlayerControls.ts` (`LatchedControl`) |
| `Thing.Weapon.CThing_Weapon` (+ `byCLASSID`) | `src/domain/things/weapons/Weapon.ts`, `createWeapon.ts`, `tuning.ts`, `weaponText.ts`, `WeaponId.ts` |
| `CThing_Weapon_Pistol`, `_UZI`, `_Shotgun`, `_Railgun`, `_Devastator` | `src/domain/things/weapons/firearms.ts` (`PistolWeapon`, `UziWeapon`, `ShotgunWeapon`, `RailgunWeapon`, `DevastatorWeapon`) |
| `CThing_Weapon_Rocket`, `_Grenade`, `_Mine`, `_Barrel`, `_FakeWall`, `_ChargePack`, `_SmartBomb` | `src/domain/things/weapons/explosives.ts` (`RocketWeapon`, `GrenadeWeapon`, `MineWeapon`, `BarrelWeapon`, `FakeWallWeapon`, `ChargePackWeapon`, `SmartBombWeapon`) |
| `Thing.Shot.CThing_Shot` | `src/domain/things/shots/Shot.ts` |
| `CThing_Shot_Bullet` | `src/domain/things/shots/Bullet.ts` (shared line logic in `LineShot.ts`) |
| `CThing_Shot_Railgun`, `CThing_Shot_DLaser` | `src/domain/things/shots/PiercingShot.ts` (`RailgunShot`, `DLaser`) |
| `CThing_Shot_Laser` | `src/domain/things/shots/Laser.ts` |
| `CThing_Shot_Rocket`, `CThing_Shot_HomingMissile` | `src/domain/things/shots/Missile.ts` (`RocketShot`, `HomingMissile`) |
| `CThing_Shot_Grenade`, `CThing_Shot_ClusterShell` | `src/domain/things/shots/GrenadeShot.ts`, `ClusterShell.ts`, bounce in `bounce.ts` |
| `CThing_Shot_Devastator` | `src/domain/things/shots/DevastatorShot.ts` |
| `CThing_Shot_FireBall` | `src/domain/things/shots/FireBall.ts` |
| `Thing.Object.CThing_Object_Barrel` | `src/domain/things/objects/Barrel.ts` |
| `Thing.Object.CThing_Object_Wall` | `src/domain/things/objects/Wall.ts` |
| `Thing.Object.CThing_Object_Mine`, `_ChargePack` | `src/domain/things/objects/Mine.ts` (`PlacedExplosive`, `Mine`), `ChargePack.ts` |
| `Thing.Object.CThing_Object_Pickup` | `src/domain/things/objects/Pickup.ts` |
| `Thing.Object.CThing_Object_WallMovable`, `_LaserNode` | `src/domain/things/objects/Inert.ts` |
| `Thing.Effect.CThing_Effect` | `src/domain/things/effects/Effect.ts`, one-shot clips in `AnimatedEffect.ts` |
| `CThing_Effect_Explosion` | `src/domain/things/effects/Explosion.ts` |
| `CThing_Effect_BulletHit`, `_SmokeCloud`, `_RocketSmoke`, `_MuzzleFlash`, `_SmartBomb`, `_FireBall_Held`, `_BloodPool`, `_BloodSplat` | `src/domain/things/effects/BulletHit.ts`, `SmokeCloud.ts`, `RocketSmoke.ts`, `MuzzleFlash.ts`, `SmartBombEffect.ts`, `FireBallHeld.ts`, `BloodPool.ts`, `BloodSplat.ts` |
| `CDrawPrimitive_MovieClip_*` caches held by things | `src/domain/things/clipVisual.ts` (`ClipSymbol`, `clipAnimator`, visual helpers) |
| `new CThing_*` calls in `CWorld` | `src/domain/things/factory.ts` (`createThingFactory`) |
| `CThing_Creature.State_GotoPosition`, `State_Wander`, devil `State_TrackTarget`, zombie `mBrain_Count` | Not ported: no caller and no effect |
