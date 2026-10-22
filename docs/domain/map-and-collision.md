# Map, cells and collision

Source: `World/Map/CMap.as`, `CMap_Cell.as`, `CMap_Collide.as`, `CMap_Mapwho.as`,
`CMap_Math.as` (empty). Port: `src/domain/map/`.

## Grid

* A cell is 32 x 32 px (`CELL_SIZE_PX`, `CMap_Cell.mCellSize`). Positions are in cells. A
  thing at `(3.9, 2.1)` is in cell `(3, 2)` (`Math.trunc`, the original `& 0xFFFFFF`).
* Map size is `round(roomWidthPx / 32) x round(roomHeightPx / 32)`. Some rooms have
  fractional pixel sizes (for example 1311.95), which round to whole cells.
* The outer ring of cells is `EdgeOfMap | Solid` (`CollideMask.MapBorder`).
* Every cell links its 8 neighbours in `Direction` order (0 = east, then clockwise in
  screen space: south-east, south, ...). A neighbour outside the map is the shared
  `invalidCell` at (-1, -1), which is `Solid`.

## Collide flags (`CollideFlag`)

| Flag | Value | Set by |
|---|---|---|
| Solid | 1 | Room `CollisionSolid` rectangles, map border |
| Ledge | 2 | Unused by the rooms |
| Creature | 32 | Creatures reserve their current and next cell (`SetCollideDirection`) |
| Player | 64 | Players reserve their cell every tick |
| Object | 128 | Walls (`CThing_Object_Wall`) and other placed objects |
| EdgeOfMap | 256 | Map border |

The masks (`CollideMask`) are copied from the original: `StaticImpassable = Solid | Ledge`,
`NonMovable = static | Creature | Object | Player`, `NoSpawn = Creature | Object`,
`Navigation = static | Object`.

`collideFlagsToward(d)` returns the neighbour's flags. For a diagonal it also ORs in the
two straight neighbours, so creatures never cut corners.

## Room init (`CWorld.InitThings`)

`World` walks `RoomDefinition.initObjects` sorted by `order`, converts px to cells (`/ 32`)
and then:

* `CollisionSolid`: both corners are rounded (`Math.round`) and cells `[x1, x2) x [y1, y2)`
  get `Solid`.
* `Barrel`, `Wall`: `ThingFactory` at the cell centre.
* `Pickup`: `ThingFactory.pickup` with the raw position. The pickup snaps itself to the
  cell centre, as `CThing_Object_Pickup` does.
* `Zombie`, `Devil`, `Player1`, `Player2`: spawn points at the cell centre. Players keep
  their rotation (degrees to radians). `Player1` is the start point.
* `Piece`: visual only (floor and cover art). Ignored by the domain.

## Mapwho

`Mapwho` keeps each thing in the cell list of its truncated position. `moveThing` returns
`true` only when the cell changed. Cell lists keep insertion order and are read newest
first (`newestFirst()`), which is the AS2 `for..in` order over the original
`mObjects[sUniqueID]` objects.

## Area queries

`cellsInArea(rect)` uses `CMap.GetCellBounds`: `round(left) - 1 .. round(right)` (one cell
of slack). With `minArea` it uses `GetCellBounds_Min`: `floor(left) .. floor(right)`.
Both clamp to the map. The list is returned in reverse scan order, because every original
caller walks it with `for..in`.

## Movement collision (`MapCollide`)

* `collideMap(p, d, r)`: if `p + d` overlaps a static cell (min-area query with the radius
  as half size), try `x` only, then `y` only, then stay. It sets `lastCollided`. A body that
  stands in an `EdgeOfMap` cell does not move.
* `collideMapwho(p, r, id)`: push `p` out of every `Collidable` thing in the area except
  `id`, one after the other, by `(r + other.r - dist) / dist` along the separation. A
  distance of exactly 0 gives `NaN`, as in the original. Creatures check `NaN` and die
  (`INVALIDPOSITION`). The original sets `other.mCollidedWithId = other.mID` (its own id),
  and the port keeps that.
* `playerCollide`: up to 3 passes of things push (skipped when the "collisions" option is
  off) plus map collision with radius `0.85 r`. A player inside a static cell does not move.
* `creatureCollide`: 1 pass, full radius, and writes the resolved step back into `delta`.
* `bounceCollide`: things push with height check (`p.z < other.z + other.height`), then the
  map. On collision `delta` is reflected about the normal from the intended to the
  resolved position. Grenades use this.
* `genericCollide`: returns only whether anything was hit.

## Line tests (`collideLine`)

`Collide_Line` walks a square of side `2 r` from `p1` to `p2` in steps of 1 cell, then
tests the end point. Each cell is visited once per call (session id). In each cell:

1. Wall test, only for fully `Solid` cells: intersect the near vertical and horizontal edge
   in the line's direction. If both hit, the nearer one wins.
2. Unless `mapOnly`, things whose `affectFlags` share a bit with the requested flags and
   whose id differs from the owner's, if the squared distance from the infinite line is
   below `radius^2`.

The nearest hit of the first step that hits anything wins. For a thing hit, the point is
pulled back towards `p1` by the thing's radius. Devils use this with
`AffectType.PlayerLineOfSight` to check the line of fire, and bullets use it with
`AffectType.Bullet`.

## Draw order (`GameMap.drawOrder`)

For the camera rectangle widened by half a cell (and one extra row at the bottom), things
are bucketed by `trunc(y * 32)`. Things with `ThingFlag.SortFloor` (corpses) use the top of
their cell instead. Rows are drawn top to bottom. Inside a bucket the original iterates
its array with `for..in`, so the last pushed thing draws first. The port does the same.
