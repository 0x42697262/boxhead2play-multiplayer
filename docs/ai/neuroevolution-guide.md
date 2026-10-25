# Neuroevolution for Boxhead bots: a working guide

A course-style guide for building bots that learn to play this game with genetic
algorithms and related methods. It assumes you know what weights and training are and
have done some survival analysis. It does not assume prior work on games, reinforcement
learning (RL) or evolutionary computation.

Each part says what to read, what to build, and what to watch out for. The facts about
this codebase are current as of 2026-10-23.

**Contents**

1. [The big picture](#1-the-big-picture)
2. [Facts about this game that matter for AI](#2-facts-about-this-game-that-matter-for-ai)
3. [The foundation to build first](#3-the-foundation-to-build-first)
4. [The bot's brain: observations, network, actions](#4-the-bots-brain-observations-network-actions)
5. [Algorithms, from simplest to advanced](#5-algorithms-from-simplest-to-advanced)
6. [Fitness design](#6-fitness-design)
7. [Pathologies: stalling, peace, forgetting and the rest](#7-pathologies-stalling-peace-forgetting-and-the-rest)
8. [Running generations](#8-running-generations)
9. [Tuning](#9-tuning)
10. [Data: what to log, and how to analyze it](#10-data-what-to-log-and-how-to-analyze-it)
11. [Replays and visuals](#11-replays-and-visuals)
12. [Evaluation and skill levels](#12-evaluation-and-skill-levels)
13. [The training curriculum for this project](#13-the-training-curriculum-for-this-project)
14. [What to expect later](#14-what-to-expect-later)
15. [Reading list](#15-reading-list)
16. [Glossary](#16-glossary)

---

## 1. The big picture

### The loop

Neuroevolution means evolving the **weights** of a neural network instead of training them
with gradient descent. One generation looks like this:

```
population of N genomes (each genome = one weight vector = one bot brain)
        │
        ▼
evaluate: each bot plays a few episodes (games) in the headless simulation
        │  → metrics per episode (survival, kills, accuracy, …)
        ▼
fitness: turn the metrics into one number (or a ranking)
        │
        ▼
selection: keep the better genomes
        │
        ▼
variation: create children by mutating (and sometimes crossing) the survivors
        │
        └──► next generation
```

That's all of it. Everything else in this guide is about doing each box *well* and
noticing when something has gone wrong.

### Why this suits this project

* **No gradients needed.** Fitness can be anything you can compute from a match: survival
  time, kills per minute, accuracy, a product of them. It doesn't have to be
  differentiable.
* **Deterministic simulator.** Same seed plus same inputs gives the same game. Every
  evaluation is reproducible, and bots can be compared fairly on identical seeds.
* **Fast simulator.** Measured: about **31,700 ticks/s on one core** (room 1, single player,
  no rendering), about 1,270× real time. That's roughly 40 five-minute games per second on
  10 cores.
* **Embarrassingly parallel.** Every evaluation is independent, so it scales with CPU
  cores.

### What it is *not* good at (so you're not surprised)

* **Big networks.** Evolution struggles above roughly 100k weights; gradient-based RL
  handles millions. Keep the bot's brain small (thousands to tens of thousands of weights).
* **Sample efficiency.** Evolution needs *many* episodes. That's fine here, since the
  simulator is fast.
* **Your GPU.** For small networks the CPU (simulation) is the bottleneck. The GPU starts
  to matter only if you move to deep RL with image-like inputs (see §14).

### How this relates to what you know

| You know | Here |
|---|---|
| Model weights | Genome. The weight vector *is* the individual. |
| Training loop / epochs | Generations |
| Loss function | Fitness, with the sign flipped (higher is better) |
| Overfitting to training data | Overfitting to **training seeds** (§7.2) |
| Validation set | A fixed set of **validation seeds** and rooms the bots never train on |
| Survival analysis | Bot lifetimes **are** survival data, right-censored at the episode cap (§10.4) |

---

## 2. Facts about this game that matter for AI

All of these come from the code (`src/domain/`).

| Fact | Value | Why it matters |
|---|---|---|
| Tick rate | 25 ticks/s (40 ms) | Unit of time for everything; the bot decides every *k* ticks |
| Map unit | Cell = 32 px | Positions are in cells (floats) |
| Camera | 640×480 px = 20×15 cells | What a human sees; a fair bot shouldn't see more (§4.1) |
| Player speed | 0.16 cells/tick, free movement in 8 directions | Fast, continuous movement |
| Zombie speed | 0.02 cells/tick base (8× slower), cell-to-cell | Easy to outrun; dangerous in crowds |
| Devil speed | 0.04 cells/tick, 1,000 life, fireballs | Ranged threat |
| Player life | 200, regenerates over 30 s | Damage isn't permanent; hit-and-retreat works |
| Weapons | 10: pistol (infinite ammo), uzi, shotgun, barrel, grenade, fake wall, mine, rocket, charge pack, railgun | 4 are *placed objects*, not shots (barrel, fake wall, mine, charge pack) |
| Friendly fire / self-damage | Bullets and explosions hurt players when Damage is on (default in single/co-op; always in deathmatch) | Rocket suicide and teamkills are real |
| Waves | The next wave starts only when every enemy of the current wave is dead | Not killing means staying on wave 1 forever (the stalling exploit) |
| Co-op death | Respawn after about 10 s with full life, 5 s invincibility, **weapons reset to pistol** | Sacrificing a teammate is a real trade-off |
| Co-op game over | Only when all players are dead at the same time | Survival is a team property |
| Deathmatch | No zombies or waves; kill limit; random respawns; a death with no killer gives nobody a frag | Self-play setting |
| Score | Enemy points × multiplier; the multiplier rises per kill and decays on a timer; Nightmare starts at ×48 | Rewards kill *speed*; ignores accuracy; not comparable across difficulties |
| Determinism | Seeded RNG, no clock, ordered iteration, fixed step | Reproducible episodes |

Entry points you'll use: `World.create(room, settings, { rng, factory, animations })`,
`world.update(tickInput)`, `world.completion`, `world.things`, `world.hud`,
`world.upgrades`, `world.events.drain()`. The test helpers in
`test/domain/support/` (`assetRoom`, `assetAnimationCatalog`, `settingsWith`,
`tickInput`, `held`) show how to build a real world headless.

---

## 3. The foundation to build first

Build these in order. Each one is useful alone, and each later piece depends on the earlier
ones.

| # | Piece | What "done" looks like |
|---|---|---|
| F1 | **Headless environment** (`reset(config)` → observation; `step(action)` → observation, done, metrics) wrapping `World` | A random bot plays 1,000 episodes; ticks/s is logged; no NaN |
| F2 | **Metric hooks** in the domain: ammo used, ammo that damaged an enemy, damage dealt and taken, kills by weapon, friendly fire, self-kills, survival ticks | Unit tests with hand-made scenarios ("one rocket kills 3 zombies" → 1 ammo, 1 hit, 3 kills) |
| F3 | **Observation encoder** and **action decoder**, versioned (`observationSpecVersion`, `actionSpecVersion`) | Unit tests: a zombie 3 cells east appears in the expected input slot |
| F4 | **Policy network**: a plain TS MLP with a flat `Float32Array` of weights | Forward pass test; 1M forward passes timed |
| F5 | **Baseline bots**: random, "stand and shoot nearest", "kite and shoot" (scripted) | Their metrics give you the floor and the target to beat |
| F6 | **Fitness function**, pure and unit-tested on the baseline bots and on exploit bots ("hider", "rocket spammer", "pistol sprayer") | The exploit bots score low; the scripted kiter scores high |
| F7 | **GA runner**: seeded, `worker_threads` pool, checkpoints, resume | Two runs with the same master seed produce identical logs |
| F8 | **Logging**: per-generation and per-episode rows, champions saved | You can plot a learning curve from the files |
| F9 | **Replay**: re-run any (genome, seed, config) and watch it in the browser | The browser shows exactly what the logs said happened |
| F10 | **Evaluation harness**: validation seeds, baselines, ratings | One command prints a report card for a genome |

**Build F5 and F6 before F7.** If the fitness rewards exploit bots, no algorithm can save
the run, and you'll waste nights of compute finding that out.

### Rules worth keeping (they match the project's existing rules)

* **Everything persisted is versioned:** genomes, logs, replays. Store `formatVersion`,
  the git commit, `observationSpecVersion` and `actionSpecVersion`. Refuse to load a
  genome whose specs don't match.
* **The environment stays deterministic:** no `Math.random`, no clock. The GA's own
  randomness (mutation) comes from a seeded RNG too, so whole runs are reproducible.
* **Config in one place:** every experiment is one config file (population, sigma, seeds,
  room, difficulty, fitness weights) saved next to its results.

---

## 4. The bot's brain: observations, network, actions

### 4.1 Observations (inputs)

Three rules:

1. **Small and fixed-size.** Evolution scales badly with input size, because every input
   adds a row of weights.
2. **Relative to the bot** ("egocentric"): "zombie 3 cells ahead-left", not "zombie at
   x=14, y=9". The same skill then works anywhere on any map.
3. **Fair:** only what a human could know. Limit vision to about the camera area
   (20×15 cells), and don't see through walls unless you decide humans effectively do (they
   see the whole screen, walls included). Write the decision down.

A good starting design (about 60–80 numbers):

| Group | Inputs | Notes |
|---|---|---|
| **Rays** | 16 directions; per ray the distance to the first wall, normalized to 0..1 by view range | Lets the bot "feel" walls and corridors |
| **Nearest K entities** (K = 4–6) | Per entity: dx, dy (relative, divided by view range), distance, **type one-hot** (zombie, devil, teammate, opponent), relative velocity if cheap | The type flag is what makes transfer between modes possible |
| **Projectiles** (optional) | Nearest 2 incoming fireballs or rockets: dx, dy, velocity | Needed for dodging; add when bots die to fireballs |
| **Self** | Life (0..1), current weapon one-hot (10), ammo of current weapon (normalized), invincible flag, facing (sin, cos) | |
| **Pickups** | Nearest pickup: dx, dy, distance | Weapon access |
| **Memory** (optional) | The previous action, one-hot | Cheap substitute for a recurrent network |

**Normalize everything** to about −1..1. Unnormalized inputs (a distance of 12.7 next to a
flag of 1) make mutation steps hit some inputs far harder than others.

Order the K nearest entities by distance and pad missing ones with zeros plus a
"present = 0" flag.

### 4.2 Network

Start with a **multilayer perceptron (MLP)**:

```
inputs (≈70) → hidden 32 (tanh) → hidden 32 (tanh) → outputs (≈20)
weights ≈ 70·32 + 32 + 32·32 + 32 + 32·20 + 20 ≈ 3,970
```

* **Activation:** `tanh` is the classic neuroevolution choice (bounded, symmetric). ReLU
  works too.
* **Initialization:** small random weights (Xavier: normal with std = 1/√fan_in). Sloppy
  initialization makes generation 0 all-saturated: every bot does the same thing.
* **Size guide:** 2–10k weights is comfortable for a simple GA or evolution strategies;
  CMA-ES up to about 5–10k; above 50k, expect slow progress.
* **Storage:** one flat `Float32Array`. Mutation is then "add noise to the array", and
  saving is "write the array".
* **Memory:** if bots keep forgetting enemies that leave view, either add the previous
  action and a "last seen" input, or use a small recurrent layer (an Elman layer or a
  tiny GRU). Start without it.

Write the forward pass yourself in TS. About 30 lines, very educational, and faster than
any library for this size. 4k weights ≈ 4k multiply-adds per decision.

### 4.3 Actions (outputs)

Split the outputs into heads and take the **argmax** of each (a deterministic policy):

| Head | Size | Meaning |
|---|---|---|
| Move | 9 | 8 directions + stand |
| Fire | 2 | Hold fire / don't |
| Weapon | 10 (or 3: next / prev / keep) | Pick a weapon; start scripted ("best available") and learn later |

* **Deterministic vs stochastic:** with argmax, the same genome on the same seed plays the
  same game, which makes evaluation cleaner. Sampling from a softmax adds noise and makes
  fitness noisier. Use argmax for training; sampling is a *difficulty knob* later (§12.3).
* **Decision rate (action repeat):** decide every k = 2–3 ticks (80–120 ms) and hold the
  action in between. That's faster (fewer forward passes), closer to human reaction times,
  and easier to learn (fewer decisions to get right).
* **Map actions to `PlayerInput`** exactly the way keys are: down/pressed/released edges,
  the same `PlayerControls` path as humans. The bot then plays under human rules, which
  guarantees fairness and lets the same bot play online later.

---

## 5. Algorithms, from simplest to advanced

Learn them in this order; each builds on the previous one.

### 5.1 Simple genetic algorithm (start here)

```
for each generation:
    evaluate all N genomes on the same S seeds
    sort by fitness
    elites  = top E genomes (copied unchanged)
    parents = top T% genomes (truncation selection)
    children = for N − E slots: pick a random parent, child = parent + σ · N(0, I)
    population = elites + children
```

* **Mutation (σ):** Gaussian noise added to every weight. σ is the most important knob
  (§9).
* **Crossover:** mixing two parents' weights often **hurts** fixed-topology networks:
  hidden neurons in two parents play different roles, so averaging them breaks both (the
  "permutation" or "competing conventions" problem). Use **mutation only** first. That's what
  Uber AI's "Deep Neuroevolution" paper did, and it worked on Atari.
* **Tournament selection** is an alternative to truncation: pick 3–5 at random and the best
  of them becomes a parent. It's gentler and keeps more diversity.
* **Re-evaluate elites** every generation on the new seeds (§7.6).

### 5.2 Evolution strategies (OpenAI-ES): usually faster

Instead of a population of separate bots, keep **one** weight vector θ and estimate which
direction improves it:

```
for each generation:
    sample n noise vectors ε_i ~ N(0, I) (antithetic: also use −ε_i)
    evaluate F_i = fitness(θ + σ ε_i)
    F̂_i = centered ranks of F_i  (robust to outliers)
    θ ← θ + α / (n σ) · Σ F̂_i ε_i      (or feed this gradient estimate to Adam)
```

* It's a *gradient estimate* built from random tries: very parallel and robust to noise.
* Read: Salimans et al. 2017, plus David Ha's and Lilian Weng's blog posts (§15).
* Use it after the simple GA works; it typically learns faster on 1–10k weights.

### 5.3 CMA-ES

An evolution strategy that also learns the **shape** of the search distribution (a
covariance matrix). It's very strong for up to about 5–10k parameters, but its cost grows
with parameters² (use "sep-CMA-ES" beyond that). Read Hansen's tutorial (§15). Great for
small networks and for tuning a scripted bot's handful of parameters.

### 5.4 NEAT (evolving the network's shape too)

Starts from tiny networks and adds neurons and connections over generations, with
**speciation** that protects new structures. It's the classic game-AI neuroevolution
method, and interesting to learn, but slower per evaluation and more complex. Try it as a
side experiment, not the main pipeline.

### 5.5 Multi-objective: NSGA-II

Keep survival, kills/min and accuracy as **separate** objectives. Selection keeps the
**Pareto front**: bots that no other bot beats on all objectives at once. You get a range
of trade-offs (careful survivors, aggressive killers, precise snipers) without choosing
weights. Read Deb et al. 2002.

### 5.6 Quality-diversity: MAP-Elites

This is the method for **"varying skill sets and styles"**. Define 2 behavior descriptors,
for example *average distance kept from enemies* × *share of kills by explosives*. Grid
them into, say, 10×10 cells, and keep the **best bot in each cell**. Result: an archive of
100 bots, each the best of its style. Read Mouret & Clune 2015. It's excellent for building
a roster of distinct bots.

### 5.7 Novelty search

Reward *being different* instead of being good. It escapes deceptive fitness landscapes
where every obvious route leads to a dead end. Used alone it's odd; mixed with fitness, or
as part of MAP-Elites, it's very useful against stagnation. Read Lehman & Stanley 2011.

### Which to use when

| Situation | Use |
|---|---|
| Learning the ropes, first working bot | Simple GA (mutation only, elitism) |
| GA works but learns slowly | OpenAI-ES or CMA-ES |
| You want several styles or skill levels | NSGA-II, then MAP-Elites |
| Stuck on a plateau, bots all do the same thing | Novelty bonus, MAP-Elites |
| Curious about evolving architecture | NEAT (side project) |

---

## 6. Fitness design

### 6.1 Your three metrics, made precise

| Metric | Definition | Range after normalization |
|---|---|---|
| Survival (single/co-op) | `min(survivalTicks / capTicks, 1)` | 0..1 |
| Survival (deathmatch) | `1 − min(deathsPerMinute / referenceDeathsPerMinute, 1)`, or mean life length | 0..1 |
| Kill rate | `min(killsPerMinute / referenceKillsPerMinute, 1)`; the reference is e.g. your scripted kiter's rate × 2 | 0..1 |
| Accuracy | `ammoThatDamagedAnEnemy / ammoUsed` (an "ammo unit" is a bullet, shell, rocket, grenade, mine or barrel; a hit is damaging ≥ 1 *enemy*; teammates count as misses) | 0..1 |

Accuracy defined per *ammo unit* treats every weapon fairly: one rocket that hits 10
zombies is 1 hit, a shotgun shell is 1 hit if any pellet connects, and a mine is 1 hit if
its explosion damages an enemy.

### 6.2 Combining them

**Product with floors** (recommended start):

```
F = Π_i ( ε + (1 − ε) · m_i )        with ε ≈ 0.05–0.1
```

* Any metric near 0 crushes F, so hiding (kills = 0), spraying (accuracy ≈ 0) and suicide
  (survival ≈ 0) are all punished.
* The floor ε keeps early, weak bots distinguishable, so generation 0 still has a signal.

**Weighted sum** is simpler but leaks exploits. **Pareto / NSGA-II** avoids choosing at all
(§5.5).

### 6.3 Per-episode vs per-genome

Fitness of a genome = **mean (or median) over S seeds** of the per-episode fitness. The
median is robust to one lucky game; the mean is smoother. Use the mean of 5–10 seeds, and
watch the standard deviation too.

### 6.4 Shaping (partial credit) vs sparse rewards

* **Sparse:** only kills and deaths count. Early bots get almost nothing, so learning is
  slow.
* **Shaped:** add small terms such as damage dealt, facing toward enemies when firing, and
  distance kept from crowds. Faster early learning, **but each shaping term is a new
  exploit opportunity** (bots learn to "face enemies" without shooting well).
* Rule: shape early, then **anneal** the shaping weights to 0 so the final fitness is only
  what you actually want.

### 6.5 Episode length

Cap episodes (e.g. 5 minutes of game time on Beginner). Without a cap, a good bot's
episodes become very long and the generation time explodes. The cap makes survival
*censored* (§10.4). Raise the cap or the difficulty as bots get better (a curriculum,
§13).

### 6.6 Team and competitive fitness

* **Co-op, clone teams:** one genome controls every teammate, and fitness = team metrics.
  No credit-assignment problem.
* **Co-op, mixed teams:** fitness needs individual credit (own kills, own accuracy) plus a
  team term (team survival), otherwise free-riders thrive.
* **Deathmatch:** fitness must be **relative**: frag difference, damage dealt minus taken,
  rating changes. Absolute survival encourages the peace trap (§7.4).

---

## 7. Pathologies: stalling, peace, forgetting and the rest

The most important section. Evolution optimizes **exactly** what you measure, including
the bugs. The literature calls this *specification gaming* or *reward hacking* (read
Krakovna's list and "The Surprising Creativity of Digital Evolution", §15).

### 7.1 Specification gaming (exploits)

| Exploit | How you'll notice | Fix |
|---|---|---|
| **Stalling / hiding**: never kill, stay on wave 1 | Survival ≈ cap, kills ≈ 0 | Product fitness; kill-rate term; cap the time spent on one wave |
| **Rocket suicide farming** (kill 5, die, repeat in co-op) | High kill rate, many self-kills | Survival term; count self-kills; the co-op respawn rules already cost weapons |
| **Pistol spray** (infinite ammo, fire constantly) | Accuracy ≈ 0.05 | Accuracy term |
| **Corner camping** behind a choke point | Heatmap: all time in one spot; fails on other rooms | Train on several rooms; validation rooms |
| **Spinning / jittering** that confuses zombie pathfinding | Replays look absurd; huge action-change rate | Accept it if it's legal and fair; otherwise penalize action changes (rarely needed) |
| **Simulation bugs** (wall clipping, a spawn exploit) | Impossible positions or scores | Fix the bug in the game, not in the fitness |
| **Shaping-term gaming** | Shaped score rises, true metrics don't | Anneal shaping; always log the true metrics separately |

**Defense in depth:** (1) exploit bots in the unit tests (F6), (2) **always watch replays of
the champions** (§11), (3) log the raw metrics, not just fitness.

### 7.2 Overfitting to seeds and rooms

The simulator is deterministic, so a genome evaluated on one seed can learn a fixed move
sequence that works for *that* game only ("open-loop" memorization). Symptoms: training
fitness high, validation fitness low.

* Use **S = 5–10 seeds** per evaluation, and **change seeds every generation**.
* Within one generation, give **every genome the same seeds** ("common random numbers"),
  so differences come from the genomes, not from luck.
* Keep a **fixed validation set** (e.g. 50 seeds, plus rooms never trained on), and
  evaluate the champion on it every 10 generations.
* Read the "overfitting in RL" and Procgen papers (§15). Same problem, same fixes.

### 7.3 Premature convergence (diversity collapse)

The population becomes copies of one decent genome, and progress stops. Symptoms: fitness
std → 0, mean pairwise weight distance → 0, all replays look the same.

* Increase σ, use tournament selection (gentler), add a novelty bonus, use several
  sub-populations ("islands") with occasional migration, or use MAP-Elites.
* Track a **diversity metric** every generation (§10.2).

### 7.4 Coevolution pathologies (deathmatch and self-play)

When opponents evolve too, fitness is **relative** and non-stationary. Read Watson &
Pollack 2001, plus Rosin & Belew 1997 for the classic fixes.

| Pathology | What happens | Fix |
|---|---|---|
| **Peace / collusion** | Everyone stops shooting; everyone "survives"; fitness looks fine | Relative fitness (frag difference); evaluate against a scripted aggressive bot too |
| **Cycling** (intransitivity) | Strategy A beats B, B beats C, C beats A; the population goes in circles | Hall of fame; evaluate against a *mix* of past opponents |
| **Forgetting** | New champions lose to old tricks the population no longer meets | Hall of fame; every N generations play the whole hall of fame |
| **Disengagement** | One side gets far stronger; every game is a blowout; no signal | Match opponents by rating; handicaps; keep weaker opponents in the pool |
| **Red Queen illusion** | Fitness stays flat while bots actually improve (opponents improved too) | Measure against **fixed** references (scripted bots, frozen champions) and ratings |
| **Overspecialization** | Bots beat each other but lose to humans or scripted bots | Diverse opponent pool, including scripted bots |

**Hall of fame:** every G generations, freeze the champion and add it to the pool. Each
genome is evaluated against a mix: about 50% current population, 30% hall of fame and 20%
scripted bots. That mix is the core of league training (AlphaStar used a large version).

### 7.5 Catastrophic forgetting during transfer

When you move from zombies to co-op to deathmatch (§13), the new fitness can erase old
skills. Fix: make the fitness **multi-task** for a while (e.g. 70% new mode, 30% old mode
episodes), or keep checking the old-mode metrics and stop if they collapse.

### 7.6 Noisy fitness and the "lucky elite"

An elite that got a lucky score is copied forever if you don't re-test it. **Re-evaluate
elites on the new seeds every generation.** For the final pick, compare candidates on many
seeds (100+), not on their training scores.

### 7.7 Determinism leaks

If two runs of the same genome on the same seed differ, something leaked:
- `Math.random` or `Date` crept in
- iteration order depends on something unordered
- worker threads share mutable state
- the bot's own policy uses unseeded randomness

The simulation integration test already checks the domain. Add the same check for the
environment wrapper and the bot (F1 and F7 "done" criteria).

### 7.8 Unfair bots (sim-to-human gap)

A bot with x-ray vision, zero reaction time and 25 decisions per second feels like a cheat
to humans, even when it's "good". Decide the fairness rules early (vision range, decision
rate, reaction delay) and bake them into the environment, not into each bot.

---

## 8. Running generations

### 8.1 Parallelism

* One **worker per core**, minus 1–2 for the main process and your desktop (on a 12-thread
  Ryzen 5 5600H, use about 10 workers).
* Each worker builds its own world factory and animation catalog **once**, then runs
  episodes on demand: `(genomeId, weights, seed, config) → metrics`.
* Send weights as `Float32Array` (transferable or shared memory); send back only the
  metrics.
* Batch the jobs: hand each worker a list of (genome, seed) pairs.

### 8.2 Budget math (measure, then plan)

```
episode_ticks  ≈ average episode length (capped)
gen_ticks      = population × seeds × episode_ticks
gen_seconds    ≈ gen_ticks / (ticks_per_second_per_core × workers)
```

Example: 200 genomes × 5 seeds × 7,500 ticks = 7.5M ticks. At 31.7k ticks/s × 10 workers
that's about 24 s, plus network forward passes and later-wave slowdown, so plan for 30–60 s.
1,000 generations then takes 8–16 hours.

### 8.3 Checkpoints and resume

Every N generations, save the full population, the GA's RNG state, the generation number,
the hall of fame, the config and the git commit. A crash or reboot then costs minutes, not
the night. Test resume early: kill a run and resume it, and the logs should continue
identically.

A neat trick from Uber AI's "Deep Neuroevolution": with mutation-only GAs, a genome can be
stored as **its initial seed plus the list of mutation seeds**, which is a few bytes instead
of 4k floats. It's optional, but elegant.

### 8.4 Experiment hygiene

* One folder per run: `runs/<date>-<name>/config.json`, `generations.jsonl`,
  `episodes.parquet`, `champions/`, `checkpoints/`.
* Never change code in the middle of a run. If the game logic changes, old genomes may
  play differently (determinism is per commit).
* Run **each config with ≥ 3 master seeds**. Neuroevolution results vary a lot between
  runs; one run proves nothing. Compare medians.

---

## 9. Tuning

### 9.1 Starting values

| Knob | Start with | Notes |
|---|---|---|
| Population N | 128–256 | Bigger = more exploration, slower generations |
| Elites E | 2–5 | Re-evaluated each generation |
| Parents | Top 10–20% (truncation) or tournament of 3–5 | |
| Mutation σ | 0.02–0.1 (with Xavier-initialized weights) | The most important knob; try 0.01, 0.03, 0.1 |
| Seeds per evaluation S | 5 (training) | 10 when fitness is noisy |
| Validation | 50 fixed seeds, every 10 generations | Plus at least 1 unseen room later |
| Episode cap | 3–5 min game time | Raise as bots improve |
| Decision interval k | 3 ticks | 2 for faster reactions |
| Generations | 300–2,000 | Stop when validation flattens |
| ES specifics | n = 100–200 pairs (antithetic), σ = 0.02–0.05, Adam learning rate 0.01 | |

### 9.2 Symptoms → what to change

| Symptom | Likely cause | Try |
|---|---|---|
| Best fitness flat from generation 1 | No signal (cold start), or broken observations | Shaping, check inputs on hand-made scenes, larger σ |
| Rises then plateaus early, low diversity | Premature convergence | Larger σ, tournament selection, novelty, islands |
| Best fitness jumps up and down | Noisy fitness | More seeds per evaluation, re-evaluate elites |
| Training ↑, validation flat or ↓ | Seed or room overfitting | More or rotating seeds, more rooms |
| Fitness ↑ but replays look silly | Specification gaming | Fix the fitness; add exploit tests |
| Slow generations | Long episodes, big network, too few workers | Episode cap, smaller network, decision interval k = 3, profile |
| Deathmatch fitness flat but bots look better | Red Queen illusion | Ratings against fixed references |

### 9.3 How to tune without fooling yourself

* Change **one knob at a time**; compare the **medians of ≥ 3 runs**.
* Tune on short runs (100 generations) first; good early learning usually predicts good
  final learning, but not always.
* Keep a simple results table (config hash → final validation fitness ± spread).

---

## 10. Data: what to log, and how to analyze it

### 10.1 Files

| File | One row per | Columns (examples) |
|---|---|---|
| `generations.jsonl` | Generation | gen, wall time, fitness min/median/mean/max/std, each raw metric's median, diversity, validation fitness (when run), champion id, σ |
| `episodes.parquet` | Episode | gen, genomeId, parentId, seed, room, difficulty, mode, survivalTicks, **censored** (hit the cap?), kills, killsByWeapon, ammoUsed, ammoHit, damageDealt/taken, friendly-fire hits, teamkills, self-kills, wave reached, fitness |
| `events.parquet` (sampled) | Event | gen, genomeId, seed, tick, type (kill, death, pickup, weapon switch, teamkill), x, y, weapon |
| `champions/<gen>.json` | Champion | formatVersion, spec versions, commit, weights (or seed list), training config, validation metrics |

Use **Parquet** for the big tables (pandas and DuckDB read it fast). Don't log every
episode's events for every genome; sample the champions plus a few random genomes per
generation.

### 10.2 Diversity metrics

* **Genotypic:** mean pairwise L2 distance between weight vectors (sample 50 pairs).
* **Behavioral:** variance of behavior descriptors across the population (average enemy
  distance, weapon mix, movement share). This tells you more than weights do.

### 10.3 Plots to make from day one

1. Learning curves: fitness min/median/max per generation, with validation fitness overlaid.
2. Each raw metric's median per generation (survival, kill rate, accuracy). This catches
   specification gaming early.
3. Weapon usage share per generation (stacked area).
4. Death-location heatmap per room (from events).
5. Diversity per generation.

### 10.4 Survival analysis (your existing skill applies directly)

Bot lifetimes are textbook survival data:
* An episode that hits the cap is **right-censored**: the bot was still alive.
* **Kaplan–Meier curves** of lifetime per generation (or per champion) show progress far
  better than a mean that's capped at the limit.
* The **log-rank test** compares two champions or two configs properly.
* A **Cox model** with covariates (difficulty, room, weapon mix, wave) shows *what* kills
  bots, i.e. hazard ratios for devils, crowds or self-damage.
* **Hazard by wave:** where the difficulty curve bites.

Plain averages of capped survival time are biased (they treat "still alive at 5:00" as
"died at 5:00"); survival methods handle censoring correctly.

---

## 11. Replays and visuals

Determinism makes replays nearly free. A replay is:

```
{ formatVersion, commit, observationSpecVersion, actionSpecVersion,
  config: { mode, room, difficulty, settings, decisionInterval },
  seed,
  genomes: [ champion file references, one per player slot ] }
```

Re-running that config gives the exact same game. No movement data needs to be stored.

What to build:

1. **Watch in the browser:** a `BotController` that feeds the network's actions into the
   normal player input of the browser game (single player first). Load champion + seed,
   then watch it play at normal speed, or 2× and 4×.
2. **Debug overlay:** draw the bot's rays, the K nearest entities it "sees", and its chosen
   action with the network output values. It's the fastest way to understand *why* a bot
   does something.
3. **Highlight reels:** for every champion, store the seeds of its best and worst
   validation episodes. Watch the worst ones first; that's where the bugs and exploits are.
4. **Headless video or heatmaps** (optional): trails and death heatmaps drawn straight from
   the event tables, without the game renderer.
5. **Side-by-side:** the same seed, two champions (generation 100 vs 800) in two panels.
   That's where progress becomes visible.

---

## 12. Evaluation and skill levels

### 12.1 Report card for a genome

Run it on the validation set (≥ 50 seeds, fixed rooms and difficulties) and report:
- median and IQR (spread) of each metric
- a Kaplan–Meier curve
- weapon mix
- results against the baselines: random, scripted, previous champion

Always compare with **baselines**. "Fitness 0.42" means nothing on its own; "beats the
scripted kiter by 30% survival" does.

### 12.2 Ratings (deathmatch and comparing bots)

**Elo:** expected score `E_A = 1 / (1 + 10^((R_B − R_A) / 400))`; after a match
`R_A ← R_A + K·(S_A − E_A)` (S = 1 win, 0.5 draw, 0 loss; K ≈ 16–32).
* Anchor the scale with the scripted bot fixed at e.g. 1000.
* For free-for-all with more than 2 players, use **TrueSkill** or treat each pair in the
  final standings as a win or loss.
* Your own matches against champions can feed the same ratings, which puts *you* on the
  scale.

### 12.3 Making bots of varying skill

| Method | How | Notes |
|---|---|---|
| **Checkpoint ladder** | Champions from different generations, picked to be about 150–200 Elo apart | Natural skill steps; the most "authentic" weakness |
| **Style roster** | MAP-Elites archive or NSGA-II Pareto front | Different *personalities* at similar skill |
| **Handicaps on one strong bot** | Reaction delay (act on observations from 200–400 ms ago), aim noise (rotate the fire direction by a random angle), lower decision rate, sampling actions with temperature | Smooth difficulty dial; can feel artificial if overdone |
| **Combine** | A ladder for rough skill, handicaps for fine-tuning | Recommended |

---

## 13. The training curriculum for this project

Same inputs and outputs in every stage (§4), so genomes carry over. Only the fitness and
the setup change.

| Stage | Setup | Fitness | Move on when |
|---|---|---|---|
| 0 | Baselines and exploit bots | — (they test the fitness) | Exploit bots score low |
| 1 | Zombies, single player, BOXY, Beginner, 3–5 min cap | Survival × kill rate × accuracy (product with floors), shaping early | Champion beats the scripted kiter on validation seeds |
| 2 | More rooms, Intermediate and Expert, longer cap | Same | Validation on unseen rooms holds up |
| 3 | Co-op, 2 clone bots, friendly fire **on** | Team survival × team kill rate × accuracy (teammate hits = misses), **no** explicit teamkill penalty; log teamkills, sacrifices and the 30 s outcome | Team survives longer than 2 copies of the stage-2 champion playing independently |
| 4 | Deathmatch 1v1, BOXY, start from stage-3 champions | Frag difference + damage difference + accuracy; opponents: 50% population / 30% hall of fame / 20% scripted | Elo vs fixed references keeps rising |
| 5 | Free-for-all with 4 players, then 16 as a show | Same, with rating-based fitness | — |
| 6 | Mixed co-op teams, bots with humans | Individual credit + team term | — |

**Multi-task while transferring:** at each stage, keep about 30% of episodes from the
previous stage for a while (§7.5).

---

## 14. What to expect later

* **Game updates break bots.** Any change to the domain's numbers (speeds, damage, spawns)
  changes what a genome does. Version the genomes against the commit, keep a "re-evaluate
  all champions" script, and expect to resume evolution after balance changes.
* **Bots in online lobbies.** A bot is just another `PlayerInput` source in `Match`.
  Forward passes are cheap (about 4k multiply-adds per decision), so even 15 bots cost
  little next to the simulation. Version the model files like the protocol.
* **Humans find bot weaknesses within minutes.** Expect to add those situations to training
  (special seeds or rooms).
* **Moving to deep RL (where your RTX 4060 helps):** if neuroevolution plateaus, PPO with a
  small CNN on a grid observation is the standard next step (libraries: CleanRL or
  Stable-Baselines3 in Python, through a socket bridge to the Node environment). The
  environment and observation work carries over. Hybrids (ES warm start, then PPO
  fine-tuning) also work.
* **Scale:** more rooms × difficulties × modes means more evaluation time. Prioritize with
  a curriculum; don't evaluate everything every generation.
* **Analysis grows into its own project:** with Parquet episode logs you can study what
  makes play good (Cox models of risk, clustering of play styles). That's data science on
  data you didn't have to collect from humans.

---

## 15. Reading list

Ordered by when you'll need it. Free resources are marked (free).

### Phase A: foundations (before building F4–F7)

1. **David Ha, "A Visual Guide to Evolution Strategies"**, blog.otoro.net, 2017 (free). The
   best first read: intuition for GA, ES and CMA-ES with pictures.
2. **A.E. Eiben & J.E. Smith, *Introduction to Evolutionary Computing***, 2nd ed., Springer,
   2015. Chapters 1–6 (representation, selection, mutation, diversity) are the textbook
   base.
3. **Sean Luke, *Essentials of Metaheuristics*** (free online). Short, practical, lots of
   pseudocode.
4. **Michael Nielsen, *Neural Networks and Deep Learning*** (free online), chapters 1–2, if
   you want to brush up on how MLPs compute.

### Phase B: neuroevolution for control and games (while building F7–F10)

5. **Salimans, Ho, Chen, Sidor, Sutskever, "Evolution Strategies as a Scalable Alternative
   to Reinforcement Learning"**, 2017 (arXiv). OpenAI-ES, rank shaping, parallelism.
6. **Such et al., "Deep Neuroevolution: Genetic Algorithms Are a Competitive Alternative for
   Training Deep Neural Networks for Reinforcement Learning"**, Uber AI, 2017 (arXiv).
   Mutation-only GA, the seed-list genome trick.
7. **Lilian Weng, "Evolution Strategies"**, lilianweng.github.io, 2019 (free). Clear survey
   of the ES family.
8. **Nikolaus Hansen, "The CMA Evolution Strategy: A Tutorial"**, arXiv 1604.00772 (free).
9. **Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies"**,
   Evolutionary Computation, 2002 (NEAT).
10. **Risi & Togelius, "Neuroevolution in Games: State of the Art and Open Challenges"**,
    IEEE TCIAIG, 2017. A map of the field, applied to games.
11. **Yannakakis & Togelius, *Artificial Intelligence and Games***, Springer, 2018 (free PDF at
    gameaibook.org). Chapters on playing games and on evaluating game AI.

### Phase C: pathologies (read before your first long run)

12. **Krakovna et al., "Specification gaming: the flip side of AI ingenuity"**, DeepMind
    blog, 2020, plus the linked examples list (free). Stalling, hiding and all their
    cousins.
13. **Lehman et al., "The Surprising Creativity of Digital Evolution"**, Artificial Life,
    2020 (arXiv, free). Real stories of evolution exploiting simulators.
14. **Watson & Pollack, "Coevolutionary Dynamics in a Minimal Substrate"**, GECCO 2001.
    Cycling, disengagement, the Red Queen.
15. **Rosin & Belew, "New Methods for Competitive Coevolution"**, Evolutionary Computation,
    1997. The hall of fame and shared sampling.
16. **Bansal et al., "Emergent Complexity via Multi-Agent Competition"**, OpenAI, 2017. Self-
    play, opponent sampling, curriculum.
17. **Zhang et al., "A Study on Overfitting in Deep Reinforcement Learning"**, 2018, and
    **Cobbe et al., "Leveraging Procedural Generation to Benchmark Reinforcement
    Learning"** (Procgen), 2019/2020. Seed and level overfitting.
18. **French, "Catastrophic forgetting in connectionist networks"**, Trends in Cognitive
    Sciences, 1999. The forgetting problem in general.

### Phase D: diversity and multiple objectives (for skill sets and styles)

19. **Deb et al., "A fast and elitist multiobjective genetic algorithm: NSGA-II"**, IEEE
    TEVC, 2002.
20. **Mouret & Clune, "Illuminating search spaces by mapping elites"**, 2015 (MAP-Elites,
    arXiv).
21. **Lehman & Stanley, "Abandoning Objectives: Evolution Through the Search for Novelty
    Alone"**, Evolutionary Computation, 2011.

### Phase E: ratings and evaluation

22. **Elo rating system**: any good overview; then **Herbrich, Minka & Graepel, "TrueSkill:
    A Bayesian Skill Rating System"**, NeurIPS 2006, for more than 2 players.
23. **Vinyals et al., "Grandmaster level in StarCraft II using multi-agent reinforcement
    learning"**, Nature, 2019. League training against forgetting, at scale (read for
    ideas, not implementation).

### Phase F: if you move to deep RL later

24. **Sutton & Barto, *Reinforcement Learning: An Introduction***, 2nd ed., 2018 (free
    online). The RL textbook.
25. **David Silver's UCL RL course** (2015, videos, free).
26. **Hugging Face Deep RL Course** (free). Hands-on PPO.
27. **CleanRL** (single-file PPO implementations, free). Readable code to learn from.

### Tools worth knowing (even if you write your own)

* **neat-python**, **DEAP** (Python EC framework), **EvoTorch** (GPU-friendly ES/GA in
  PyTorch), **pycma** (reference CMA-ES). Reading their source teaches you the details.
  For this project, keep training in TypeScript (no Python bridge per tick), and use Python
  only to analyze the Parquet logs.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| Genome / individual | One bot's weight vector |
| Population | All genomes of a generation |
| Fitness | The score used for selection; higher is better |
| Elitism | Copying the best genomes unchanged into the next generation |
| Mutation σ | Standard deviation of the Gaussian noise added to weights |
| Truncation / tournament selection | Keep the top X% / best of k random picks |
| Common random numbers | Evaluating all genomes on the same seeds within a generation |
| Validation seeds | Fixed seeds never used for training, used to measure real skill |
| Specification gaming | Scoring high on the fitness without doing what you meant |
| Premature convergence | The population collapses to one solution too early |
| Coevolution | Evolving against opponents that also evolve |
| Hall of fame | Frozen past champions kept as opponents |
| Red Queen effect | Running to stand still: progress invisible because opponents improve too |
| Pareto front | Solutions no other solution beats on all objectives at once |
| Quality-diversity | Searching for the best solution *of each kind* (e.g. MAP-Elites) |
| Behavior descriptor | Numbers that describe *how* a bot plays (not how well) |
| Curriculum | Ordering tasks from easy to hard |
| Action repeat / decision interval | How many ticks an action is held before deciding again |
| Right-censoring | An observation that ended (episode cap) before the event (death) happened |
| Elo / TrueSkill | Rating systems that infer skill from match outcomes |
