# ADR 0007: Binary delta frames on the socket

Status: accepted

## Context

The server sends every player a frame 25 times per second: camera, every draw entry in view
(with symbol, animation and style names), the HUD and the tick's events. As JSON a frame is
4 to 12 KB, so a player received 150 to 300 KiB/s before compression. The owner saw about
5 MiB in 30 s in the browser and asked for smaller network messages, because the server
has a bandwidth cap.

Common techniques for game snapshots: binary encoding, strings sent once and referenced by
index, quantized numbers, leaving out fields that did not change, skipping identical
snapshots, and lowering the snapshot rate with client interpolation.

Our frames are generic trees (`DrawEntry`, `Visual`, `NetHud`) shared with the local
renderer, so a hand-written per-field codec would duplicate every visual type.

## Decision

All server -> client messages use `src/net/wire.ts`, a generic binary delta codec:

1. **One encoder and decoder per socket.** `socketGateway` gives each socket a
   `WireEncoder`; `ServerConnection` creates a `WireDecoder` for each new socket. WebSocket
   delivers in order and without loss, so no acks are needed.
2. **Header.** Each message starts with its `type` as a string slot. The previous message of
   the same type is the baseline.
3. **Values are tagged.** `Same` (1 byte: equal to the baseline), null/false/true, integers
   and 3-digit fixed-point numbers as zigzag varints, written as a difference to the
   baseline number when that is shorter, float64 for unsafe numbers, strings, arrays,
   objects and keyed arrays.
4. **Strings are interned.** The first use sends the UTF-8 bytes and assigns the next id;
   later uses send the id (1 to 2 bytes). Keys and values share the table. Strings longer
   than `WIRE_MAX_INTERNED_LENGTH` (64) and strings past `WIRE_STRING_TABLE_LIMIT` (4096)
   are sent raw.
5. **Objects send changed keys only**, plus the keys that were removed.
6. **Arrays of objects with a `thingKey`** (draw entries) are matched by key, so an entry
   that did not change costs its key id and one byte, even if the order changed.
7. **Fractions keep three digits**, as the JSON `roundFraction` did. The decoded tree is the
   same as `JSON.parse` of the old JSON (checked frame by frame in `npm run bandwidth`).

Client -> server messages stay JSON text: they are small and input is already sent only on
change. permessage-deflate stays on: it shrinks the binary frames another 4 to 6 times for
little CPU, and the bandwidth cap matters more than the CPU here.

The 25 Hz frame rate is unchanged. Sending fewer frames would need client interpolation,
which adds latency.

## Results (`npm run bandwidth`, ROOM_Single_0001, 30 s, everyone moving and firing)

| Match | JSON | JSON + deflate | wire | wire + deflate |
|---|---|---|---|---|
| Coop, 1 player | 155 KiB/s | 4.2 KiB/s | 6.5 KiB/s | 0.9 KiB/s |
| Coop, 16 players | 302 KiB/s | 10.5 KiB/s | 22.9 KiB/s | 3.9 KiB/s |
| Deathmatch, 16 players | 258 KiB/s | 9.2 KiB/s | 23.2 KiB/s | 4.5 KiB/s |

Per player, server upload. The browser's network panel shows uncompressed sizes, so it
showed the JSON column.

## Consequences

* The protocol version is 3. Older tabs cannot read binary frames and must reload.
* A decoder that misses a message cannot recover; that cannot happen on one socket, and a
  new socket starts with a new encoder and decoder.
* Consumers must not mutate decoded trees: unchanged parts are shared with the decoder's
  baseline. The client hands Zod's copies to the game.
