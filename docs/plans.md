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

## Frame size and server CPU

Measured 2026-10-25 on a busy 4-player Nightmare match after protocol 10 (about 500 B per
frame, ADR 0007): decals about 180 B, sounds about 50 B, other players' HUD positions about
35 B, the rest the packed draw list. Ideas, biggest saving first:

| Idea | Expected effect | Effort | Decides it |
|---|---|---|---|
| 12.5 frames per second with client interpolation (as tanka-maze does at 15) | About half the bytes and encoding CPU; adds about 80 ms of delay | Days | Monitor LOOP row still high with 4+ players |
| Decals and sounds in the fixed layout too | About 100 of 180 decal bytes per frame (estimate) | Half a day | Same |
| Stop listing unchanged entries; the client keeps them and sorts by depth itself | About 50 B per frame (one byte per unchanged thing) | Half a day; client must sort like the server | Same |
| Client runs walk animations; the server sends only animation changes | A few bytes per walking zombie per tick | About a day; visuals may drift from the server's frame count | Owner unsure (2026-10-25) |
| Sounds only for players who can hear them (like screen shake, per camera) | About 50 B per frame, and no gunfire from across the room | About an hour | Owner decision: changes what players hear |

## Bot AI (after the first milestone)

Parked on purpose: none of this starts before the first milestone in
`docs/ai/neuroevolution-guide.md` §13 (a frozen zombie-mode bot that beats the scripted
kiter on validation seeds). Papers for each option are in the guide's §17.20.

### Combining specialist bots

Several frozen bots, each good at something, used together. Discussed 2026-10-25.

| Option | How | Learns during a match? | Effort | Notes |
|---|---|---|---|---|
| A. Pick a style per match (bandit) | A roster of frozen bots with different styles (aggressive, cautious, precise). A multi-armed bandit (UCB or Thompson sampling, with a sliding window) scores the current style against these opponents and switches toward what works | Yes; statistics only, reset per lobby | About 50 lines on top of the roster | Switch on respawn (co-op: at wave start). Reward with the bot's own rates (damage taken per minute, kills per minute), because deaths are rare in co-op and a human teammate must not skew it. Measure later lives against early lives, with and without the bandit |
| B. Pick a skill per situation (manager network; recommended first) | Freeze skill specialists (fight, retreat, loot); evolve only a small manager network that hands control to one of them | No; the manager is trained, then frozen | Small: the manager has a few hundred weights, so evolution is fast | The manager commits to a choice for a minimum number of ticks so the bot does not jitter. Log which skill was chosen and why |
| C. Merge into one network (distillation) | Train one student network to imitate all specialists | No | Medium | One compact model; useful once B or A works |
| D. Average the weights | Add separately evolved weight files together | No | — | Rejected: separately evolved networks use hidden neurons differently, so averaging scrambles them. It only works for models fine-tuned from the same base |
| E. Ensemble (average or vote on actions) | Each specialist proposes an action | No | Small | Not planned: averaging opposite moves gives standing still; voting is mediocre |

Prerequisite for A: a style roster. The cheap way is 3 runs with different fitness weightings
(kills, survival, accuracy); MAP-Elites (guide §5.6) gives more and truly distinct styles.

Decides it: a working frozen bot, then whether playtesters find it predictable (favours A)
or weak in some situations (favours B).

### Networks that adapt within a match

A recurrent network that learns from its own deaths during a match (RL², weights frozen,
memory reset per lobby), or evolved plasticity (weights change during play, reset per
lobby). Deferred by the owner on 2026-10-25: more effort for little visible gain over a few
waves. Papers are kept in the guide's §17.20 ("Deferred").

Decides it: curiosity after B or A works.

## Accepted for now

* Encoder CPU cost after the writer reuse (ADR 0007, "Update: encoder CPU cost"). Revisit if
  the monitor's LOOP row stays high with 4 or more players: fewer temporary objects per frame
  in the encoder, or a paid Render plan with more CPU.
* A host cannot replace its own lobby while the server is at `MAX_LOBBIES`.
