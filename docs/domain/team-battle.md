# Team Battle

Team Battle is a separate online mode. Single play, cooperative progression and individual
deathmatch keep their existing rules. This is a new mode, not an emulation of an AS2 mode.

## Teams and membership

The server lobby assigns each new member to the smaller of Team A and Team B, choosing A
on a tie. Each team holds eight players and the existing total limit remains sixteen.
Members can choose an uneven arrangement before their first entry into the match. Both
teams need a connected player to start. Existing players never move automatically.

The lobby remembers the team of each session that entered the current match. Quitting the
match, leaving and rejoining the lobby, reconnecting, changing characters or changing the
host cannot change that assignment. A new late joiner can choose before entering; joining
a running Team Battle lobby does not automatically enter the match. Locks clear after the
match, not when a member leaves. Session identity still follows the existing reconnect
grace; this adds no account identity.

Disconnected players retain their seats during reconnect grace. If either team has no
players remaining in the match after a leave or expiry, the server ends without a winner.

## Damage and ownership

A Team Battle player receives an immutable attack source containing session identity,
team and the current player index. Every weapon-created thing captures its parent's
source. Allies neither accept affects nor appear as projectile line intersections, so
bullets, piercing shots and rockets pass through teammates. Allied mines ignore allied
occupants. Self-triggering and self-inflicted explosion damage retain deathmatch rules.

Barrels in this mode use the triggering affect's source for their explosion, including
chains and fragments. Mines and charge packs keep their planter's source. Delayed attacks
retain their original source after departures. A team point uses that source's team;
individual credit resolves the original session among current players, never an old slot
number that a replacement player now occupies. Other modes keep their existing ownership.

The world records each player's death once until respawn. Dedicated team totals increase
only for opposing-player kills and do not depend on who remains connected. Self, creature
and unowned deaths award no team points. Creature kills do not contribute either.

## Real-time regulation

The lobby passes its injected clock reading to match creation and each match step. The
match deadline is five real minutes later, independent of simulation speed and player life.
At or after the deadline the match finishes before processing another simulation tick:
a queued attack on that boundary cannot change the result. Higher team kills win; equal
scores draw. There is no overtime, kill target or all-players-dead completion in this mode.
The frozen result contains both final totals and is common to the clients.

## Creatures, equipment and respawns

Every new Team Battle lobby starts with Zombies and Devils independently off. Only the
host can change them before starting. Either, neither or both can be enabled. Difficulty
selects the existing creature waves; disabled species have no remaining quotas, so a wave
cannot wait forever for a disabled species. Creatures threaten both teams. Creature kills
advance enabled waves without changing the deathmatch equipment progression.

Weapon upgrades, inventory resets, pickups, self damage and camera recovery use existing
deathmatch behavior. The existing author-provided random spawn search and respawn state
machine are reused. Team Battle uses the existing deathmatch respawn duration, without a
second timer, a new timing setting, spawn bases or team-side restrictions. Enabled
creatures use the existing shared safe-floor search rather than a separate team search.

## Presentation and persistence

The main menu has a separate Team Battle entry. Its online lobby list, invite routing,
grouped roster and pre-entry team choice use the same online flow as other modes. The
options window labels the independent creature switches and has no friendly-fire override.
Characters and the held player list identify teams; the top-center display shows both
team totals and the remaining time. The scoreboard groups individual kills and deaths by
team. The returned lobby shows the authoritative winner, draw or abandonment and totals.

Settings version 12 adds the Team Battle level selection and independent creature-option
fields. Older saved choices in other modes remain intact. New Team Battle lobbies still
reset both enemy switches off, irrespective of saved option fields. The new mode, team
messages, HUD data and result are protocol version 13.
