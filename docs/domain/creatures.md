# Creatures

Source: `Thing/Creature/CThing_Creature*.as`, the XSI collections in their `GetCollection`
functions and `DrawPrimitive/XSI/CDrawPrimitive_XSI_StyleSheet.as`. Port:
`src/domain/things/creatures/`.

## Shared state machine (`Creature.ts`)

`CThing_Creature.SetState("State_X")` becomes `StateMachine<CreatureState>`. `set()` keeps
the original semantics: the previous state becomes the return state (`mReturnStateID`), the
counter (`mStateCount`) restarts at 0 and the state's `enter` runs at once. Subclasses add
their states through `ownStates()`. The first `process()` runs `processInit()` (radius 0.45,
height 1.5, snap to the cell centre, life 100), which already calls `processNormal()` once
with no state set, exactly like `Process_Init` calling `this.Process()`. Subclasses then
finish their own init.

`processNormal()` consumes the affect queue (`resolveHit` for each affect in
`affectorsInProcessingOrder`, skipped while `invincible` is non-zero) and then ticks the
current state.

| State | Enter | Tick |
|---|---|---|
| `enterMap` | reserve the cell (`Creature` flag), not collidable, face the first straight direction whose cell is not static | if that cell holds a creature: `wait`; else affects on, collidable, base state `gotoPlayer`, then `cellToCell` (devil: `removeObject`) |
| `cellToCell` | reserve the next cell, count = `1/speed` (straight) or `sqrt(2)/speed` (diagonal), walk animation at 0.34 | step `delta`; at the end snap to the cell centre and return to the base state |
| `turn` / `turnAndMove` | turn speed `speed * 10` radians per tick the short way, `stand` frame 0 | rotate; at the end snap to the target angle (`turnAndMove` walks on if the cell ahead is free) |
| `sleep` | `stand` | count down, then the return state |
| `wait` / `waitToMove` | 1 second | back to the base state (`waitToMove` also when the target cell frees up) |
| `bulletHit`, `explosionHit`, `zombieHit` | count = number of `x 0.65` steps until the knockback is below 0.01, blood splat, release the reservation, random `shothit_1/2`, damage sound, no knockback inside a static cell | `creatureCollide` the knockback (a `NaN` result kills: `invalidPositions++`), blood splat except for explosions, mark dead at life 0; at the end check death or restore the angle and `sleep` 3 ticks |
| `dying` | death sound, release the reservation, not collidable, affects off, `dying` animation, `World.logKill` | blood splat every tick, animate at 0.34, at the end the floor thud and `dead` |
| `dead` | 2 s (players 4 s), `SortFloor`, `dead` animation, blood splat | fade during the last second at high detail, then delete |

`setStateWithDirection` turns first when the wanted direction differs from the facing.
`setStateWithDirectionWait` sleeps a third of a second instead when the previous state was
already a turn (this breaks turn loops).

## Zombie

Speed 0.02 (times the level speed-up applied once at spawn by `Upgrades.registerCreature`),
score 100, damage 50, two random hit sounds out of four. `gotoPlayer` aims at the centre of
the closest player's cell. If the cell in that direction holds a player it attacks,
otherwise it asks `NavigationField.direction` (not forced) and walks or waits a second
when the field gives up. `attack` plays the attack animation at
`min(0.3 * speed * 25 * 1.5, 1)` and at its end hits every accepting thing in the cell in
front with a `ZombieAttackAffect`, then sleeps 10 ticks.

## Devil

Speed 0.04, radius 0.42, life 1000, mass 5, height 1.8, score 1000. It also accepts
`PlayerLineOfSight`. Every `gotoPlayer` tick it first decides whether to attack: it must
have been through one tick of `gotoPlayer`, its fire counter must be spent (starts at 5,
fire rate 0), the target must be alive, faced (same 8-way direction), within 5 cells
(3D distance) and the first thing on the line with radius 0.1 must be of the target's class.
Otherwise it attacks an object in its way with a radius 1 fireball that does 10000
`DevilAttack` damage. On frame 3 of the attack animation it throws a `FireBall` from the
midpoint of the hands (the XSI anchors), or 1.5 radii ahead at height 0.84 when the set has
no hand anchors (true for every devil set in the extracted data). Navigation is forced.
Right after entering the map it hits the object in front with 100000 damage until it is
gone (`removeObject`).

## Player

* Life 200, speed 0.16, mass 2, 200 ticks of invincibility at the start (it blinks: hidden
  on odd counts). Regenerates `200 / (30 s)` per tick while alive and hurt.
* Every tick it sets `CollideFlag.Player` on its cell (even while dead) and, unless dead,
  asks the world camera to track it.
* `playerControl`: arrows give `delta` (left wins over right, up over down), the facing
  follows a non-zero `delta`, `playerCollide` resolves the move. The original coop leash
  (no more than 19 x 13 cells from a live partner, so both fit one shared screen) is
  removed: every player has their own camera. Number keys (key `(index + 1) % 10`, in
  every mode), next and previous are read on release. A selection renews the fire
  key. The current weapon's `update(fire)` runs before the animation update, so the gun
  position comes from the previous frame.
* Animation ids are `<weapon>walk` / `<weapon>stand` (`WEAPON_ANIMATIONS`): walk when the
  position changed, stand otherwise, animated at `speed * 2`.
* `Creature.lastAttackerIndex` records the player index of the owner of the last affect
  that hit (undefined for zombies, devils and barrels without an owner). Respawn clears
  it. Deathmatch frags use it.
* Players spawned after the start (`World.joinPlayer`) get the weapons the world unlocked
  so far (`Upgrades.unlockedWeapons`); in deathmatch the inventory is reset as on respawn.
* Death: the shared `dying`, then 4 s `dead`. In the last second it calls
  `World.playerDead()` every tick (which ends single and coop games when nobody is left).
  Then `respawn` waits 25 ticks and retries every tick until `World.playerRespawnPoint`
  finds a point: full life, collidable, 125 ticks of invincibility (25 in deathmatch), fire
  key renewed, weapons emptied except the pistol, `Upgrades.playerRespawned()`.

### Input latching (`PlayerControls.ts`)

The original key objects latched edges from keyboard events: `IsPressed` and `IsReleased`
consume the edge, `Renew` clears it. `LatchedControl.sync(state, tick)` rebuilds that from
the per-tick `ControlState`. A press that happens while the weapon is cooling down is kept
until it is read. The press tick is kept for the grenade's hold time.

## Characters (`characterCollections.ts`)

Each creature owns a `CharacterAnimator` over a collection that maps animation ids to XSI
set ids, copied from `GetCollection`:

| Id | Player (`SS_SWAT/BOND/GIJOE/BAMBO`) | Zombie (`SS_ZOMBIE`) | Devil (`SS_DEVIL`, scale 0.42) |
|---|---|---|---|
| `stand` / `walk` | `Player_Stand` / `Player_Walk` | `Zombie_Zombie_Stand` / `Zombie_Zombie_Walk` | `Player_Stand` / `Player_Walk` |
| `attack` | | `Zombie_Zombie_Attack` | `Devil_Devil_Attack` |
| `shothit_1` / `shothit_2` | `Player_HitRear` / `Player_HitFront` | same | same |
| `dying` / `dead` | `Player_Dying` / `Player_Dead` | same | same |
| `pistolwalk`/`stand` | `Player_Handgun_Walk` / `_Stand` | | |
| `uzi..`, `shotgun..`, `rocket..`, `railgun..` | `Player_UZI_*`, `Player_Shotgun_*`, `Player_Rocket_*`, `Player_Railgun_*` | | |
| `grenade..`, `barrel..`, `mine..`, `claymore..`, `chargepack..`, `fakewall..` | mimic `Player_Walk` / `Player_Stand` | | |

The style sheet decides how the shared `Player_*` sets look (group remaps, materials,
scale). The renderer applies it from `CharacterVisual.style` and `styleScale`. The player's
style comes from `SimulationSettings.playerCharacters[playerIndex]` (0 SWAT, 1 Bond,
2 GI Joe, 3 Bambo).
