# User settings

Source: `CSaveData.as` (SharedObject `BXHD_2PLAY_6`). Port: `src/services/SettingsService.ts`,
storage adapter `src/adapters/storage/KeyValueStore.ts`.

## Storage

One JSON blob in `localStorage` under `boxhead2play.settings`. It is read once at boot,
validated with Zod and written back on every change (`CSaveData` flushed on every setter).
Unreadable storage or a failed write is logged (`save.rejected`, `save.write_failed`) and
the game continues with the values in memory.

## Version 2

| Field | Type | Default | Original |
|---|---|---|---|
| `version` | `2` | | |
| `soundActive` | boolean | true | `mSoundActive` |
| `musicActive` | boolean | true | `mMusicActive` (no music is registered) |
| `detail` | boolean | true | `mDetail` (`_quality` HIGH/LOW) |
| `difficulty` | 0..3 | 0 | `mDifficulty` |
| `gameSpeed` | 0..2 | 1 | `mGameSpeed` |
| `devilsActive`, `collisionsActive`, `damageActive` | boolean | true | `mDevilsActive` etc. (stored as 1/0) |
| `gameAmount` | 0..3 | 1 | `mGameAmount` (5/10/20/50 kills) |
| `levelIndex.single/coop/deathMatch` | integer >= 0 | 8 / 0 / 0 | `mLevelIndex_*` |
| `character` | 0..3 | 3 | `mPlayer1_CharacterIndex` (0 SWAT, 1 Bond, 2 GI Joe, 3 Bambo) |
| `keys` | Flash key codes 0..255 for up, down, left, right, fire, nextWeapon, prevWeapon | arrows, `/`, `.`, `,` | `mPlayer1_Key*` |
| `playerName` | string, at most 16 characters | `''` | none (the online name; the server shows "Player" for an empty one) |
| `playCount` | integer >= 0 | 0 | `mPlayCount` |

`levelIndex.coop` and `levelIndex.deathMatch` are the levels the select-world screen shows
when hosting an online game. The player 2 fields of the original (`mPlayer2_*`,
`mViewSide_DeathMatch`) are not stored: there is no local second player (ADR 0005).

`mUsername` belonged to the removed high score service and is not stored.

## Migration

`readSettings` reads `version` (missing means 0) and applies `MIGRATIONS[v]` until the
current version, then validates.

* Version 0 is an unversioned object with the original SharedObject field names
  (`mSoundActive`, `mDevilsActive: 1`, `mPlayer1_KeyShoot`, ...); present fields are
  copied, missing ones take the defaults. It becomes version 1.
* Version 1 had local two-player fields: `characters` (two entries), `keys.player1` and
  `keys.player2`, `viewSideDeathMatch`. `migrateLocalTwoPlayer` keeps the first
  character and `keys.player1`, drops the rest and adds an empty `playerName`.
 A migrated blob is written
back immediately (`save.migrated`). Invalid JSON, a non-object, an unknown version or a
failed validation falls back to the defaults (`save.rejected`) without overwriting the
stored blob until the next change.

To add version 3: bump `SETTINGS_VERSION`, change the schema, and add `MIGRATIONS[2]`
that turns a version 2 object into a version 3 object.
