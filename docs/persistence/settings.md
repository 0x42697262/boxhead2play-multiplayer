# User settings

Source: `CSaveData.as` (SharedObject `BXHD_2PLAY_6`). Port: `src/services/SettingsService.ts`,
storage adapter `src/adapters/storage/KeyValueStore.ts`.

## Storage

One JSON blob in `localStorage` under `boxhead2play.settings`. It is read once at boot,
validated with Zod and written back on every change (`CSaveData` flushed on every setter).
Unreadable storage or a failed write is logged (`save.rejected`, `save.write_failed`) and
the game continues with the values in memory.

## Version 1

| Field | Type | Default | Original |
|---|---|---|---|
| `version` | `1` | | |
| `soundActive` | boolean | true | `mSoundActive` |
| `musicActive` | boolean | true | `mMusicActive` (no music is registered) |
| `detail` | boolean | true | `mDetail` (`_quality` HIGH/LOW) |
| `difficulty` | 0..3 | 0 | `mDifficulty` |
| `gameSpeed` | 0..2 | 1 | `mGameSpeed` |
| `devilsActive`, `collisionsActive`, `damageActive` | boolean | true | `mDevilsActive` etc. (stored as 1/0) |
| `gameAmount` | 0..3 | 1 | `mGameAmount` (5/10/20/50 kills) |
| `levelIndex.single/coop/deathMatch` | integer >= 0 | 8 / 0 / 0 | `mLevelIndex_*` |
| `characters` | [0..3, 0..3] | [3, 0] | `mPlayer1/2_CharacterIndex` (0 SWAT, 1 Bond, 2 GI Joe, 3 Bambo) |
| `keys.player1/player2` | Flash key codes 0..255 for up, down, left, right, fire, nextWeapon, prevWeapon | arrows, `/`, `.`, `,` / W, S, A, D, Space, E, Q | `mPlayer1_Key*`, `mPlayer2_Key*` |
| `viewSideDeathMatch` | 0..1 | 1 | `mViewSide_DeathMatch` |
| `playCount` | integer >= 0 | 0 | `mPlayCount` |

`mUsername` belonged to the removed high score service and is not stored.

## Migration

`readSettings` reads `version` (missing means 0) and applies `MIGRATIONS[v]` until the
current version, then validates. Version 0 is an unversioned object with the original
SharedObject field names (`mSoundActive`, `mDevilsActive: 1`, `mPlayer1_KeyShoot`, ...);
present fields are copied, missing ones take the defaults. A migrated blob is written
back immediately (`save.migrated`). Invalid JSON, a non-object, an unknown version or a
failed validation falls back to the defaults (`save.rejected`) without overwriting the
stored blob until the next change.

To add version 2: bump `SETTINGS_VERSION`, change the schema, and add `MIGRATIONS[1]`
that turns a version 1 object into a version 2 object.
