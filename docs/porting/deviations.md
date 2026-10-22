# Deliberate deviations from the original

| Area | Original | Port | Reason |
|---|---|---|---|
| Randomness | `random(n)`, `Math.random()` | Injected `Rng` | Deterministic tests and replays. |
| High scores | Submitted to seantcooper.com (`CHighscore_Submit`) | Removed | The service is gone; see ADR 0003. |
| Analytics | `CTracker` | Removed | See ADR 0003. |
| Init object order | `mInitList` order is the order of AS2 constructors while the room is attached | `rooms/*.json` `initObjects` in pre-order: tag order (which equals depth order in every room), a clip before its nested children | AS2 queues a registered clip's constructor before the constructors of the children its first frame creates. The only nested init objects are collision solids inside pieces, so this order affects no gameplay. |
| XSI master materials | `Register_Materials` per `mItems` entry, iterated with AS2 `for..in` (newest-first) | `characters/xsi.json` `materials` merged from the last item to the first, so the first item wins | Same result as the original. No material differs between sets today. |
| Navigation timing | `getTimer()` session ids, 2000 ms freshness, 3 ms budget per update with a `continue` state | Update counter as session id, freshness `2 * ticksPerSecond` updates, up to 5 whole rings per update | Determinism. The distances and the ring order are the same. Only the part-ring time slicing is gone. |
| Line hit points | `CMap_Cell.LineIntersection*` return the shared statics `xPOI`/`yPOI`, which later cells in the same scan overwrite (a thing test writes `xPOI` before checking the distance) | Each hit has its own point | Bug fix. The original could stop a bullet at a point that belongs to another cell. |
| Player deletion | `DeleteThing_Player` disposes the player at once and again on the next `Process` | `ThingCollection.deleteThing` removes the player from the player list at once and disposes once on the next pass | Same observable result, no double dispose. |
| Weapon unlock calls | `CUpgrades.AddUpgrade` calls `NewWeapon(value)` on every player for every value that is not `true`, including level numbers | Only weapon-unlock entries call `newWeapon` | The other calls were no-ops (unknown weapon names). |
| Upgrade text | "UZI+: Infinate Range" | "UZI+: Infinite Range" | Spelling. The identifiers `InfinateAmmo`/`InfinateRange` are kept. |
| HUD message lifetime | 3000 ms of wall clock | 3 seconds of ticks (`3 * ticksPerSecond`) | Determinism. The fade animation belongs to the renderer. |
| Spawn points outside the map | Stored with an `undefined` cell | Dropped | The original would fail at the first use. No room has one. |
| Zombie/devil spawn point angle | `undefined` | `Angle(0)` | Never read. |
| `ThingFlag.Drawn` | Set by `CMap.Draw` | Not set | Never read. Keeps drawing read-only. |
| `MoveInDirection2` | Direction arithmetic without wrapping | Wraps with `& 7` | The function has no caller. |
| Quit | Only the pause screen button sets `quit` | `TickInput.quitRequested` at any time | The UI decides when the request can be made. |
| Thing ids | Static `CThing.mAllocate_ID`, renewed per world | `ThingIds` per world | Same numbers, no global state. |

## Processing order (AS2 `for..in`)

Not a deviation, but a decision about undefined order. AVM1 enumerates object properties
newest first and takes a snapshot of the keys before the loop. The port does this:

* `ThingCollection.process` processes things in reverse insertion order. Things added
  during the pass wait for the next tick.
* Cell occupants (`MapCell.newestFirst`), players (`ThingCollection.players`) and area
  cell lists (`GameMap.cellsInArea`, reverse scan order) are read newest first.
* `CThing_Creature.ProcessAffects` walks its affect array with `for..in`, which is reverse
  index order. See `affectorsInProcessingOrder`.
* Draw buckets in `CMap.Draw` are arrays iterated with `for..in`, so the last thing pushed
  into a bucket draws first.

## Kept quirks

These look like bugs but are kept because they shape gameplay:

* The flood fill gives the player's cell and its four neighbours distance 0.
* Upgrade tables, the start multiplier timers and the devil minimum spawn rate use 25
  ticks/s at any game speed.
* Fireballs damage players even when the damage option is off.
* Ambience slot 0 is silent and ambience sample 4 never plays.
* No "LEVEL 1" message is shown at the start (the HUD did not exist yet when the first level was set).
* Zombie and devil corpses keep the thing counters up until they fade out, which delays the next level.
