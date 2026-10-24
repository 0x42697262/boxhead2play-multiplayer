# Plans

Ideas that are parked on purpose. Each entry says what decides it. Nothing here is
scheduled.

## Waiting for player feedback (online feel)

Decide these after real matches with other players, not before.

### Frame buffer for delay spikes

Observed 2026-10-24 on the Render Singapore service: ping is usually about 55 ms with
occasional spikes to 170-220 ms. The server was not the cause (monitor LOOP delay max
0.7 ms). During a spike `FrameBuffer` (`src/services/online/tuning.ts`, target 1 to 3
frames = 40 to 120 ms) runs empty, so the picture stops; the late frames then arrive
together and the surplus is caught up, so the picture jumps. tanka-maze hides the same
spikes with a fixed 140 ms interpolation delay.

| Option | How | Feel | Effort |
|---|---|---|---|
| A. Spike-aware buffer (recommended) | Size the target from measured arrival jitter, up to about 200 ms; grow at once after a spike, shrink after about 30 s of calm; catch up gradually instead of skipping | Same as now on a calm connection, smooth but later controls after spikes | 1 to 2 h |
| B. Fixed larger buffer | Always 3 to 4 frames (120 to 160 ms) | Always smooth, always later controls | 15 min |
| C. Keep | Current buffer | Fastest controls, stops and jumps on spikes | none |

Decides it: players reporting stops or jumps, or reporting that controls feel late.

### Movement prediction

Input latency is one round trip plus the buffer (ADR 0005, no prediction). If players often
have more than about 120 ms of ping, consider letting the client own its player's position
(the server trusts it; cheating does not matter in this game) rather than prediction with
reconciliation, which snaps back often when zombies block the player and needs rollback
the domain does not have. Effort: about 1 to 2 days.

Decides it: the ping players see in the top-right corner, and complaints about late controls.

### Frames for a stalled connection

The server sends every frame to every socket and never checks how much is queued. A stall
queues frames until the connection recovers or the 20 to 40 s ping check closes it; the
client then drops all but the newest 6. Skipping frames for a socket with a full queue
(before encoding, so the delta baselines stay in step) would save that memory and
bandwidth. Effort: about 30 min.

Decides it: monitor showing memory or upload growth while a player's connection stalls.

## Accepted for now

* Encoder CPU cost after the writer reuse (ADR 0007, "Update: encoder CPU cost"). Revisit if
  the monitor's LOOP row stays high with 4 or more players: fewer temporary objects per frame
  in the encoder, or a paid Render plan with more CPU.
* A host cannot replace its own lobby while the server is at `MAX_LOBBIES`.
