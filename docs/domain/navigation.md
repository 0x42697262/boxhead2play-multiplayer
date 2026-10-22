# Navigation flow field

Source: static `Nav_*` functions and `NavReal_*`, `NavDir_*`, `Nav_VD` in
`World/Map/CMap_Cell.as`, plus `Thing/Math/CThing_Navigation.as`. Port:
`src/domain/map/NavigationField.ts`, `src/domain/things/navigation.ts`.

## Flood fill

After all things are processed, `ThingCollection.process()` calls `restart()` and then
`update(cells under every player)`.

* `restart` → `update`: a new session starts. The session id is the update counter
  (originally `getTimer()`). The source cells get distance 0.
* Each update expands up to **5 rings** (`NAV_RINGS_PER_UPDATE`) breadth first in the four
  straight directions. A cell is skipped when it has a `Navigation` flag
  (`Solid | Ledge | Object`) or was already visited this session.
* The distance counter is incremented *after* each ring. So the sources **and their four
  neighbours** both get distance 0. The next ring gets 1, and so on. This is the original
  behavior and the port keeps it.
* If cells remain, the state is `resume` and the next update continues. When the frontier
  is empty the state is `finished`, and the next `restart()` begins a new session.

The original also had a 3 ms wall-clock budget per update (`nTimeOut`), with a `continue`
state that resumed a ring part way. The port processes whole rings deterministically. See
`docs/porting/deviations.md`.

## Choosing a direction (`direction`, original `Nav_Direction`)

Inputs: the creature's cell, its current direction, the direction straight to the target
cell, the blocking mask (`NonMovable`) and `force` (devils `true`, zombies `false`).

1. If the cell was not reached by the fill within the last 2 seconds
   (`NAV_FRESHNESS_SECONDS * ticksPerSecond` updates; the original compared timestamps in
   ms), steer directly (`directDirection`, original `NavReal_Dir`):
   target if clear, else current if clear, else turn the short way (or a random way when
   target = current) by 1 and 3 steps for diagonals, or 2 steps for straight directions.
2. Otherwise take the target direction if that neighbour has a smaller distance and is
   clear (`collideFlagsToward`), else the current direction under the same test.
3. Non-forced callers get at most 5 full scans per update (`nFullScanCount`). After that
   they return `NO_DIRECTION` (-1) and the zombie waits a second.
4. Full scan: compute the valid direction bits (`validDirections`, original `Nav_VD`). A
   blocked straight neighbour also removes both adjacent diagonals. Then take the valid
   neighbour with the smallest distance. Neighbours with no distance sort as farthest. Ties
   keep the order of a stable sort (see open questions in the handoff).

Neighbour distances are not checked against the session id. A cell keeps its last
distance until the fill reaches it again, as in the original.

## MoveInDirection2

`CThing_Navigation.MoveInDirection2` has no caller in the game. It is ported as
`moveInDirection` (try `d ± 1..3`) with direction wrapping added.
