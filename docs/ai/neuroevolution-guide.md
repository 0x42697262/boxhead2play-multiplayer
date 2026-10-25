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
17. [Literature list (verified links)](#17-literature-list-verified-links)

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
* **Planned extensions after the first milestone** (style roster, a bandit that picks a style
  per match, a manager network over skill specialists) are parked in `docs/plans.md` under
  "Bot AI", with their papers in §17.20.
* **Analysis grows into its own project:** with Parquet episode logs you can study what
  makes play good (Cox models of risk, clustering of play styles). That's data science on
  data you didn't have to collect from humans.

---

## 15. Reading list

A short starting path, ordered by when you'll need it. Free resources are marked (free).
The full list with verified PDF links is in §17.

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

---

## 17. Literature list (verified links)

172 papers, books, courses and posts, grouped by topic. The ★ marks about 70 core
readings, a typical related-literature review. The rest go deeper on one topic.

**How each link was checked (2026-10-25):**

* **arXiv IDs:** resolved through the arXiv API and compared with the intended title. All
  80 match.
* **DOIs:** resolved through Crossref and compared with the intended title. 3 of my first
  guesses pointed to unrelated papers and were corrected.
* **PDF links:** downloaded, and the paper's title had to appear in the first two pages
  (`pdftotext`). HAL files were confirmed through HAL's API.
* **Web pages:** fetched, and the expected heading had to be on the page.

Links are listed in your preferred order: a free PDF first, then arXiv, with the DOI last.
Titles, authors and years come from arXiv or Crossref, not from memory. arXiv entries show
the preprint year; some also appeared later in a journal or conference.

Links can die. If a PDF link breaks, the DOI or the arXiv abstract page still identifies the
paper.

**Suggested order:** read the ★ items of 17.1, 17.3, 17.11 and 17.8 before your first long
run. Then read ★ items as each topic becomes relevant (17.6 when you want styles and skill
levels, 17.9 and 17.10 when you reach deathmatch and co-op, 17.12 before you compare
configurations).

### 17.1 Textbooks and free courses

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Ha (2017). A Visual Guide to Evolution Strategies. *blog* | Best first read: GA, ES and CMA-ES explained with pictures and code. | [Link](https://blog.otoro.net/2017/10/29/visual-evolution-strategies/) |
| ★ | Weng (2019). Evolution Strategies. *blog* | Compact survey of the ES family with the maths written out. | [Link](https://lilianweng.github.io/posts/2019-09-05-evolution-strategies/) |
| ★ | Eiben & Smith (2015). Introduction to Evolutionary Computing. *Springer, 2nd ed.* | The standard EC textbook. Chapters 1–6 cover representation, selection, mutation and diversity. | [DOI](https://doi.org/10.1007/978-3-662-44874-8) |
| ★ | Luke (2013). Essentials of Metaheuristics (2nd ed.). *free book (Lulu)* | Free, short, practical, lots of pseudocode. The GMU server could not be reached from here; check the link yourself. | [Link](https://cs.gmu.edu/~sean/book/metaheuristics/) |
| ★ | Yannakakis & Togelius (2018). Artificial Intelligence and Games. *Springer* | Game AI textbook. Chapters on playing games, evaluating agents and modelling players. | [PDF](https://gameaibook.org/book.pdf) · [DOI](https://doi.org/10.1007/978-3-319-63519-4) |
| ★ | Sutton & Barto (2018). Reinforcement Learning: An Introduction (2nd ed.). *MIT Press (free PDF)* | The RL textbook. Read chapters 1–3 for the vocabulary even if you stay with evolution. | [PDF](http://incompleteideas.net/book/RLbook2020.pdf) |
|  | Nielsen (2015). Neural Networks and Deep Learning. *free online book* | Free online book. Chapters 1–2 explain what an MLP computes. | [Link](http://neuralnetworksanddeeplearning.com/) |
|  | Silver (2015). UCL Course on Reinforcement Learning. *course* | Lecture videos and slides. The classic RL course. | [Link](https://www.davidsilver.uk/teaching/) |
|  | Hugging Face (online). Deep Reinforcement Learning Course. *course* | Hands-on, free; PPO and self-play units. For later. | [Link](https://huggingface.co/learn/deep-rl-course/unit0/introduction) |
|  | Achiam (OpenAI) (2018). Spinning Up in Deep RL. *course* | Concise RL introduction with clean reference code. | [Link](https://spinningup.openai.com/en/latest/) |

### 17.2 Evolutionary computation foundations

| | Paper | Why read it | Links |
|---|---|---|---|
|  | Whitley (1994). A genetic algorithm tutorial. *Statistics and Computing* | Classic short GA tutorial: selection, crossover, mutation, schema intuition. | [DOI](https://doi.org/10.1007/BF00175354) |
|  | Miller & Goldberg (1995). Genetic Algorithms, Tournament Selection, and the Effects of Noise. *Complex Systems 9(3)* | Tournament selection under noisy fitness, which is your situation. | [Link](https://www.complex-systems.com/abstracts/v09_i03_a02/) |
|  | Beyer & Schwefel (2002). Evolution strategies – A comprehensive introduction. *Natural Computing* | Thorough introduction to evolution strategies (mutation strength, self-adaptation). | [DOI](https://doi.org/10.1023/A:1015059928466) |
|  | Hansen & Ostermeier (2001). Completely Derandomized Self-Adaptation in Evolution Strategies. *Evolutionary Computation* | The CMA-ES paper. | [PDF](http://www.cmap.polytechnique.fr/~nikolaus.hansen/cmaartic.pdf) · [DOI](https://doi.org/10.1162/106365601750190398) |
| ★ | Hansen (2016). The CMA Evolution Strategy: A Tutorial. *arXiv* | The practical CMA-ES tutorial; read this instead of the 2001 paper first. | [PDF](https://arxiv.org/pdf/1604.00772) · [arXiv](https://arxiv.org/abs/1604.00772) |
|  | Ros & Hansen (2008). A Simple Modification in CMA-ES Achieving Linear Time and Space Complexity. *Lecture Notes in Computer Science* | sep-CMA-ES: linear cost, for networks with thousands of weights. | [PDF](https://inria.hal.science/inria-00270901/document) · [DOI](https://doi.org/10.1007/978-3-540-87700-4_30) |
|  | Wierstra et al. (2011). Natural Evolution Strategies. *arXiv* | Natural Evolution Strategies: the theory that OpenAI-ES builds on. | [PDF](https://arxiv.org/pdf/1106.4487) · [arXiv](https://arxiv.org/abs/1106.4487) |
| ★ | Jin & Branke (2005). Evolutionary Optimization in Uncertain Environments—A Survey. *IEEE Transactions on Evolutionary Computation* | Survey of optimization under noisy fitness; why and how to re-evaluate. | [DOI](https://doi.org/10.1109/TEVC.2005.846356) |
| ★ | Squillero & Tonda (2016). Divergence of character and premature convergence: A survey of methodologies for promoting diversity in evolutionary optimization. *Information Sciences* | Survey of diversity preservation and premature convergence. | [DOI](https://doi.org/10.1016/j.ins.2015.09.056) |

### 17.3 Neuroevolution: core papers

| | Paper | Why read it | Links |
|---|---|---|---|
|  | Yao (1999). Evolving artificial neural networks. *Proceedings of the IEEE* | Early big survey of evolving neural networks (weights, architectures, rules). | [DOI](https://doi.org/10.1109/5.784219) |
|  | Floreano et al. (2008). Neuroevolution: from architectures to learning. *Evolutionary Intelligence* | Survey: neuroevolution from architectures to learning. | [PDF](https://infoscience.epfl.ch/record/112676/files/FloreanoDuerrMattiussi2008.pdf) · [DOI](https://doi.org/10.1007/s12065-007-0002-4) |
| ★ | Stanley & Miikkulainen (2002). Evolving Neural Networks through Augmenting Topologies. *Evolutionary Computation* | NEAT: evolving topology and weights, speciation, and the "competing conventions" problem of crossover. | [PDF](https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf) · [DOI](https://doi.org/10.1162/106365602320169811) |
|  | Stanley et al. (2009). A Hypercube-Based Encoding for Evolving Large-Scale Neural Networks. *Artificial Life* | HyperNEAT: indirect encoding for large networks. | [DOI](https://doi.org/10.1162/artl.2009.15.2.15202) |
|  | Gomez, Schmidhuber & Miikkulainen (2008). Accelerated Neural Evolution through Cooperatively Coevolved Synapses. *JMLR 9* | CoSyNE: strong neuroevolution baseline on control tasks. | [PDF](https://jmlr.org/papers/volume9/gomez08a/gomez08a.pdf) |
| ★ | Stanley et al. (2019). Designing neural networks through neuroevolution. *Nature Machine Intelligence* | Modern overview of neuroevolution by its leading researchers. | [DOI](https://doi.org/10.1038/s42256-018-0006-z) |
| ★ | Such et al. (2017). Deep Neuroevolution: Genetic Algorithms Are a Competitive Alternative for Training Deep Neural Networks for Reinforcement Learning. *arXiv* | Mutation-only GA training deep networks on Atari; the seed-list genome trick. Your algorithm's closest relative. | [PDF](https://arxiv.org/pdf/1712.06567) · [arXiv](https://arxiv.org/abs/1712.06567) |
|  | Lehman et al. (2017). Safe Mutations for Deep and Recurrent Neural Networks through Output Gradients. *arXiv* | Safe mutations: scaling mutation per weight so a mutation does not break the network. | [PDF](https://arxiv.org/pdf/1712.06563) · [arXiv](https://arxiv.org/abs/1712.06563) |
|  | Ha & Schmidhuber (2018). World Models. *arXiv* | World Models: a tiny controller trained with CMA-ES on top of learned features. | [PDF](https://arxiv.org/pdf/1803.10122) · [arXiv](https://arxiv.org/abs/1803.10122) |
|  | Tang et al. (2020). Neuroevolution of Self-Interpretable Agents. *arXiv* | Small neuroevolved agents with attention; shows how compact a good policy can be. | [PDF](https://arxiv.org/pdf/2003.08165) · [arXiv](https://arxiv.org/abs/2003.08165) |
|  | Real et al. (2018). Regularized Evolution for Image Classifier Architecture Search. *arXiv* | Regularized (aging) evolution: tournament selection plus killing the oldest; a simple, robust GA variant. | [PDF](https://arxiv.org/pdf/1802.01548) · [arXiv](https://arxiv.org/abs/1802.01548) |

### 17.4 Evolution and gradient-based RL

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Salimans et al. (2017). Evolution Strategies as a Scalable Alternative to Reinforcement Learning. *arXiv* | OpenAI-ES: rank shaping, antithetic sampling, massive parallelism; competitive with RL. | [PDF](https://arxiv.org/pdf/1703.03864) · [arXiv](https://arxiv.org/abs/1703.03864) |
|  | Zhang et al. (2017). On the Relationship Between the OpenAI Evolution Strategy and Stochastic Gradient Descent. *arXiv* | How the OpenAI-ES gradient relates to SGD. | [PDF](https://arxiv.org/pdf/1712.06564) · [arXiv](https://arxiv.org/abs/1712.06564) |
|  | Lehman et al. (2017). ES Is More Than Just a Traditional Finite-Difference Approximator. *arXiv* | Why ES is more than finite differences: it optimizes for robustness to perturbation. | [PDF](https://arxiv.org/pdf/1712.06568) · [arXiv](https://arxiv.org/abs/1712.06568) |
|  | Conti et al. (2017). Improving Exploration in Evolution Strategies for Deep Reinforcement Learning via a Population of Novelty-Seeking Agents. *arXiv* | ES plus novelty search for exploration (NS-ES). | [PDF](https://arxiv.org/pdf/1712.06560) · [arXiv](https://arxiv.org/abs/1712.06560) |
| ★ | Mania et al. (2018). Simple random search provides a competitive approach to reinforcement learning. *arXiv* | Augmented random search: how far very simple random search gets on control. | [PDF](https://arxiv.org/pdf/1803.07055) · [arXiv](https://arxiv.org/abs/1803.07055) |
|  | Moriarty et al. (1999). Evolutionary Algorithms for Reinforcement Learning. *Journal of Artificial Intelligence Research* | Survey of evolutionary algorithms for RL (pre-deep-learning, still relevant). | [PDF (arXiv)](https://arxiv.org/pdf/1106.0221) · [DOI](https://doi.org/10.1613/jair.613) |
|  | Igel (2003). Neuroevolution for reinforcement learning using evolution strategies. *The 2003 Congress on Evolutionary Computation, 2003. CEC '03.* | CMA-ES as a neuroevolution method for RL. | [DOI](https://doi.org/10.1109/CEC.2003.1299414) |
|  | Heidrich-Meisner & Igel (2009). Neuroevolution strategies for episodic reinforcement learning. *Journal of Algorithms* | Neuroevolution strategies for episodic RL: careful comparison with policy gradients. | [DOI](https://doi.org/10.1016/j.jalgor.2009.04.002) |
|  | Whiteson & Stone (2006). Evolutionary Function Approximation for Reinforcement Learning. *JMLR 7* | Combining NEAT with temporal-difference learning. | [PDF](https://jmlr.org/papers/volume7/whiteson06a/whiteson06a.pdf) |
|  | Khadka & Tumer (2018). Evolution-Guided Policy Gradient in Reinforcement Learning. *arXiv* | ERL: evolution plus policy gradient in one loop. | [PDF](https://arxiv.org/pdf/1805.07917) · [arXiv](https://arxiv.org/abs/1805.07917) |
|  | Pourchot & Sigaud (2018). CEM-RL: Combining evolutionary and gradient-based methods for policy search. *arXiv* | CEM-RL: cross-entropy method combined with TD3. | [PDF](https://arxiv.org/pdf/1810.01222) · [arXiv](https://arxiv.org/abs/1810.01222) |
| ★ | Jaderberg et al. (2017). Population Based Training of Neural Networks. *arXiv* | Population Based Training: evolving hyperparameters during training; also used for game agents. | [PDF](https://arxiv.org/pdf/1711.09846) · [arXiv](https://arxiv.org/abs/1711.09846) |

### 17.5 Neuroevolution in games

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Risi & Togelius (2014). Neuroevolution in Games: State of the Art and Open Challenges. *arXiv* | Survey of neuroevolution in games: the map of this whole field. | [PDF](https://arxiv.org/pdf/1410.7326) · [arXiv](https://arxiv.org/abs/1410.7326) |
| ★ | Stanley et al. (2005). Real-Time Neuroevolution in the NERO Video Game. *IEEE Transactions on Evolutionary Computation* | NERO: real-time neuroevolution of combat bots inside a game, trained by players. | [PDF](https://nn.cs.utexas.edu/downloads/papers/stanley.ieeetec05.pdf) · [DOI](https://doi.org/10.1109/TEVC.2005.856210) |
| ★ | Hausknecht et al. (2014). A Neuroevolution Approach to General Atari Game Playing. *IEEE Transactions on Computational Intelligence and AI in Games* | Neuroevolution (NEAT, HyperNEAT, CMA-ES) on 61 Atari games: compares encodings and inputs. | [PDF](https://www.cs.utexas.edu/~mhauskn/papers/atari.pdf) · [DOI](https://doi.org/10.1109/TCIAIG.2013.2294713) |
|  | Togelius et al. (2009). Super mario evolution. *2009 IEEE Symposium on Computational Intelligence and Games* | Evolving Super Mario controllers: input design and incremental difficulty. | [PDF](http://julian.togelius.com/Togelius2009Super.pdf) · [DOI](https://doi.org/10.1109/CIG.2009.5286481) |
|  | Togelius et al. (2013). The Mario AI Championship 2009–2012. *AI Magazine* | What four years of a game-AI competition taught about agents and evaluation. | [DOI](https://doi.org/10.1609/aimag.v34i3.2492) |
|  | Cardamone et al. (2009). Evolving competitive car controllers for racing games with neuroevolution. *GECCO 2009* | Neuroevolution of competitive racing controllers (opponents on track). | [DOI](https://doi.org/10.1145/1569901.1570060) |
|  | Schrum & Miikkulainen (2011). Evolving multimodal networks for multitask games. *IEEE CIG 2011* | Multimodal networks for games where one bot must switch between tasks (Ms. Pac-Man). | [PDF](https://nn.cs.utexas.edu/downloads/papers/schrum.cig11.pdf) · [DOI](https://doi.org/10.1109/cig.2011.6031995) |
| ★ | Schrum et al. (2011). UT^2: Human-like behavior via neuroevolution of combat behavior and replay of human traces. *2011 IEEE Conference on Computational Intelligence and Games (CIG'11)* | UT^2: neuroevolved Unreal Tournament bot judged human-like (BotPrize winner). | [DOI](https://doi.org/10.1109/CIG.2011.6032024) |
| ★ | Stanley & Miikkulainen (2004). Competitive Coevolution through Evolutionary Complexification. *Journal of Artificial Intelligence Research* | Competitive coevolution of robot duelling with NEAT: how strategies complexify. | [PDF](https://jair.org/index.php/jair/article/download/10367/24809) · [PDF (arXiv)](https://arxiv.org/pdf/1107.0037) · [DOI](https://doi.org/10.1613/jair.1338) |

### 17.6 Quality-diversity, novelty and open-endedness

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Lehman & Stanley (2011). Abandoning Objectives: Evolution Through the Search for Novelty Alone. *Evolutionary Computation* | Novelty search: rewarding being different escapes deceptive fitness. | [PDF](https://www.cs.swarthmore.edu/~meeden/DevelopmentalRobotics/lehman_ecj11.pdf) · [DOI](https://doi.org/10.1162/EVCO_a_00025) |
|  | Lehman & Stanley (2011). Evolving a diversity of virtual creatures through novelty search and local competition. *Proceedings of the 13th annual conference on Genetic and evolutionary computation* | Novelty search with local competition: diversity and quality together. | [DOI](https://doi.org/10.1145/2001576.2001606) |
| ★ | Mouret & Clune (2015). Illuminating search spaces by mapping elites. *arXiv* | MAP-Elites: the best bot for every style cell, i.e. your "varying skill sets" roster. | [PDF](https://arxiv.org/pdf/1504.04909) · [arXiv](https://arxiv.org/abs/1504.04909) |
| ★ | Pugh et al. (2016). Quality Diversity: A New Frontier for Evolutionary Computation. *Frontiers in Robotics and AI* | Quality-diversity as a field: overview and comparison. | [PDF](https://www.frontiersin.org/articles/10.3389/frobt.2016.00040/pdf) · [DOI](https://doi.org/10.3389/frobt.2016.00040) |
|  | Cully et al. (2014). Robots that can adapt like animals. *arXiv* | MAP-Elites archive used to recover from damage (Nature); shows why diversity pays. | [PDF](https://arxiv.org/pdf/1407.3501) · [arXiv](https://arxiv.org/abs/1407.3501) |
|  | Vassiliades et al. (2016). Using Centroidal Voronoi Tessellations to Scale Up the Multi-dimensional Archive of Phenotypic Elites Algorithm. *arXiv* | CVT-MAP-Elites: scaling the archive to more behaviour dimensions. | [PDF](https://arxiv.org/pdf/1610.05729) · [arXiv](https://arxiv.org/abs/1610.05729) |
| ★ | Fontaine et al. (2019). Covariance Matrix Adaptation for the Rapid Illumination of Behavior Space. *arXiv* | CMA-ME: CMA-ES inside MAP-Elites, applied to game strategies (Hearthstone). | [PDF](https://arxiv.org/pdf/1912.02400) · [arXiv](https://arxiv.org/abs/1912.02400) |
|  | Fontaine & Nikolaidis (2021). Differentiable Quality Diversity. *arXiv* | Differentiable quality-diversity, for when you have gradients. | [PDF](https://arxiv.org/pdf/2106.03894) · [arXiv](https://arxiv.org/abs/2106.03894) |
|  | Gravina et al. (2019). Procedural Content Generation through Quality Diversity. *arXiv* | Quality-diversity for generating game content. | [PDF](https://arxiv.org/pdf/1907.04053) · [arXiv](https://arxiv.org/abs/1907.04053) |
|  | Mouret & Doncieux (2012). Encouraging Behavioral Diversity in Evolutionary Robotics: An Empirical Study. *Evolutionary Computation* | Behavioural diversity measures and their effect in evolutionary robotics. | [PDF](https://hal.science/hal-00687609/document) · [DOI](https://doi.org/10.1162/EVCO_a_00048) |
|  | Wang et al. (2019). Paired Open-Ended Trailblazer (POET): Endlessly Generating Increasingly Complex and Diverse Learning Environments and Their Solutions. *arXiv* | POET: co-evolving environments and agents; automatic curricula. | [PDF](https://arxiv.org/pdf/1901.01753) · [arXiv](https://arxiv.org/abs/1901.01753) |
|  | Wang et al. (2020). Enhanced POET: Open-Ended Reinforcement Learning through Unbounded Invention of Learning Challenges and their Solutions. *arXiv* | Enhanced POET. | [PDF](https://arxiv.org/pdf/2003.08536) · [arXiv](https://arxiv.org/abs/2003.08536) |
|  | Ecoffet et al. (2019). Go-Explore: a New Approach for Hard-Exploration Problems. *arXiv* | Go-Explore: remember and return to promising states; hard-exploration games. | [PDF](https://arxiv.org/pdf/1901.10995) · [arXiv](https://arxiv.org/abs/1901.10995) |

### 17.7 Multi-objective optimization

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Deb et al. (2002). A fast and elitist multiobjective genetic algorithm: NSGA-II. *IEEE Transactions on Evolutionary Computation* | NSGA-II: fast non-dominated sorting and crowding distance. The method for survival / kills / accuracy as separate objectives. | [DOI](https://doi.org/10.1109/4235.996017) |
|  | Zhang & Li (2007). MOEA/D: A Multiobjective Evolutionary Algorithm Based on Decomposition. *IEEE Transactions on Evolutionary Computation* | MOEA/D: decomposition into scalar subproblems; an alternative to NSGA-II. | [DOI](https://doi.org/10.1109/TEVC.2007.892759) |
|  | Deb & Jain (2014). An Evolutionary Many-Objective Optimization Algorithm Using Reference-Point-Based Nondominated Sorting Approach, Part I: Solving Problems With Box Constraints. *IEEE Transactions on Evolutionary Computation* | NSGA-III, for 4+ objectives. | [DOI](https://doi.org/10.1109/TEVC.2013.2281535) |
|  | Coello (2006). Evolutionary multi-objective optimization: a historical view of the field. *IEEE Computational Intelligence Magazine* | Historical overview of evolutionary multi-objective optimization. | [DOI](https://doi.org/10.1109/MCI.2006.1597059) |

### 17.8 Coevolution and its pathologies

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Rosin & Belew (1997). New Methods for Competitive Coevolution. *Evolutionary Computation* | Hall of fame and competitive fitness sharing: the classic fixes for forgetting. | [DOI](https://doi.org/10.1162/evco.1997.5.1.1) |
| ★ | Cliff & Miller (1995). Tracking the red queen: Measurements of adaptive progress in co-evolutionary simulations. *ECAL 1995, LNCS* | The Red Queen: measuring real progress when opponents also evolve (CIAO plots). | [DOI](https://doi.org/10.1007/3-540-59496-5_300) |
| ★ | Watson & Pollack (2001). Coevolutionary Dynamics in a Minimal Substrate. *GECCO 2001* | Disengagement, cycling and loss of gradient shown in the simplest possible setting. | [PDF](http://www.demo.cs.brandeis.edu/papers/gecco2001_cdms.pdf) |
|  | de Jong (2007). A Monotonic Archive for Pareto-Coevolution. *Evolutionary Computation* | A monotonic archive: guaranteeing that coevolution never loses ground. | [DOI](https://doi.org/10.1162/evco.2007.15.1.61) |
|  | Miconi (2009). Why Coevolution Doesn’t “Work”: Superiority and Progress in Coevolution. *EuroGP 2009, LNCS* | Why coevolution seems not to "work": superiority vs progress. | [DOI](https://doi.org/10.1007/978-3-642-01181-8_5) |
| ★ | Popovici et al. (2012). Coevolutionary Principles. *Handbook of Natural Computing* | Coevolutionary principles: book-chapter survey of the whole area. | [DOI](https://doi.org/10.1007/978-3-540-92910-9_31) |
|  | Potter & de Jong (2000). Cooperative Coevolution: An Architecture for Evolving Coadapted Subcomponents. *Evolutionary Computation* | Cooperative coevolution: evolving parts that must work together. | [DOI](https://doi.org/10.1162/106365600568086) |

### 17.9 Self-play, leagues and competitive multi-agent learning

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Bansal et al. (2017). Emergent Complexity via Multi-Agent Competition. *arXiv* | Self-play in simulated physics games: opponent sampling against forgetting, curricula. | [PDF](https://arxiv.org/pdf/1710.03748) · [arXiv](https://arxiv.org/abs/1710.03748) |
| ★ | Jaderberg et al. (2018). Human-level performance in first-person multiplayer games with population-based deep reinforcement learning. *arXiv* | Capture the Flag (Quake III): population-based training of FPS team agents. Closest to your setting. | [PDF](https://arxiv.org/pdf/1807.01281) · [arXiv](https://arxiv.org/abs/1807.01281) |
| ★ | Vinyals et al. (2019). Grandmaster level in StarCraft II using multi-agent reinforcement learning. *Nature* | AlphaStar: league training with exploiters to avoid forgetting and cycles. | [DOI](https://doi.org/10.1038/s41586-019-1724-z) |
|  | OpenAI et al. (2019). Dota 2 with Large Scale Deep Reinforcement Learning. *arXiv* | OpenAI Five (Dota 2): self-play at scale, past-self opponents. | [PDF](https://arxiv.org/pdf/1912.06680) · [arXiv](https://arxiv.org/abs/1912.06680) |
|  | Silver et al. (2017). Mastering Chess and Shogi by Self-Play with a General Reinforcement Learning Algorithm. *arXiv* | AlphaZero: self-play from zero in chess and shogi. | [PDF](https://arxiv.org/pdf/1712.01815) · [arXiv](https://arxiv.org/abs/1712.01815) |
|  | Silver et al. (2017). Mastering the game of Go without human knowledge. *Nature* | AlphaGo Zero: self-play without human data. | [DOI](https://doi.org/10.1038/nature24270) |
|  | Heinrich & Silver (2016). Deep Reinforcement Learning from Self-Play in Imperfect-Information Games. *arXiv* | Fictitious self-play: playing against the average of past selves. | [PDF](https://arxiv.org/pdf/1603.01121) · [arXiv](https://arxiv.org/abs/1603.01121) |
| ★ | Lanctot et al. (2017). A Unified Game-Theoretic Approach to Multiagent Reinforcement Learning. *arXiv* | PSRO: a game-theoretic recipe for choosing opponents from a population. | [PDF](https://arxiv.org/pdf/1711.00832) · [arXiv](https://arxiv.org/abs/1711.00832) |
|  | Balduzzi et al. (2019). Open-ended Learning in Symmetric Zero-sum Games. *arXiv* | Open-ended learning in symmetric zero-sum games; cycles and the "gamescape". | [PDF](https://arxiv.org/pdf/1901.08106) · [arXiv](https://arxiv.org/abs/1901.08106) |
| ★ | Baker et al. (2019). Emergent Tool Use From Multi-Agent Autocurricula. *arXiv* | Hide-and-seek: emergent strategies and exploits of the physics engine. | [PDF](https://arxiv.org/pdf/1909.07528) · [arXiv](https://arxiv.org/abs/1909.07528) |

### 17.10 Cooperative multi-agent learning, teammates and humans

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Panait & Luke (2005). Cooperative Multi-Agent Learning: The State of the Art. *Autonomous Agents and Multi-Agent Systems* | The cooperative multi-agent learning survey: team learning vs concurrent learning, credit assignment. | [DOI](https://doi.org/10.1007/s10458-005-2631-2) |
|  | Lowe et al. (2017). Multi-Agent Actor-Critic for Mixed Cooperative-Competitive Environments. *arXiv* | MADDPG: learning in mixed cooperative and competitive settings. | [PDF](https://arxiv.org/pdf/1706.02275) · [arXiv](https://arxiv.org/abs/1706.02275) |
| ★ | Foerster et al. (2017). Counterfactual Multi-Agent Policy Gradients. *arXiv* | COMA: counterfactual credit assignment, i.e. who deserves credit for a team result. | [PDF](https://arxiv.org/pdf/1705.08926) · [arXiv](https://arxiv.org/abs/1705.08926) |
|  | Rashid et al. (2018). QMIX: Monotonic Value Function Factorisation for Deep Multi-Agent Reinforcement Learning. *arXiv* | QMIX: factorizing a team value into per-agent values. | [PDF](https://arxiv.org/pdf/1803.11485) · [arXiv](https://arxiv.org/abs/1803.11485) |
| ★ | Leibo et al. (2017). Multi-agent Reinforcement Learning in Sequential Social Dilemmas. *arXiv* | Sequential social dilemmas: when agents learn to cooperate or defect. Relevant to teamkills. | [PDF](https://arxiv.org/pdf/1702.03037) · [arXiv](https://arxiv.org/abs/1702.03037) |
| ★ | Carroll et al. (2019). On the Utility of Learning about Humans for Human-AI Coordination. *arXiv* | Overcooked: agents trained only with copies of themselves fail with humans. | [PDF](https://arxiv.org/pdf/1910.05789) · [arXiv](https://arxiv.org/abs/1910.05789) |
| ★ | Strouse et al. (2021). Collaborating with Humans without Human Data. *arXiv* | Fictitious co-play: training partners that work with people without human data. | [PDF](https://arxiv.org/pdf/2110.08176) · [arXiv](https://arxiv.org/abs/2110.08176) |
|  | Hu et al. (2020). "Other-Play" for Zero-Shot Coordination. *arXiv* | Other-play: coordinating with unknown partners. | [PDF](https://arxiv.org/pdf/2003.02979) · [arXiv](https://arxiv.org/abs/2003.02979) |

### 17.11 Specification gaming, reward hacking and shaping

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Krakovna et al. (DeepMind) (2020). Specification gaming: the flip side of AI ingenuity. *blog* | Read before your first long run: stalling, hiding and every cousin. | [Link](https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/) |
| ★ | Krakovna (2018). Specification gaming examples in AI. *blog* | The original post with the running list of examples. | [Link](https://vkrakovna.wordpress.com/2018/04/02/specification-gaming-examples-in-ai/) |
| ★ | Lehman et al. (2018). The Surprising Creativity of Digital Evolution: A Collection of Anecdotes from the Evolutionary Computation and Artificial Life Research Communities. *arXiv* | Real stories of evolution exploiting simulators and fitness functions. | [PDF](https://arxiv.org/pdf/1803.03453) · [arXiv](https://arxiv.org/abs/1803.03453) |
|  | Amodei et al. (2016). Concrete Problems in AI Safety. *arXiv* | Concrete problems in AI safety: reward hacking, side effects, safe exploration. | [PDF](https://arxiv.org/pdf/1606.06565) · [arXiv](https://arxiv.org/abs/1606.06565) |
|  | Skalse et al. (2022). Defining and Characterizing Reward Hacking. *arXiv* | A formal definition of reward hacking. | [PDF](https://arxiv.org/pdf/2209.13085) · [arXiv](https://arxiv.org/abs/2209.13085) |
|  | Pan et al. (2022). The Effects of Reward Misspecification: Mapping and Mitigating Misaligned Models. *arXiv* | How more capable agents exploit misspecified rewards more. | [PDF](https://arxiv.org/pdf/2201.03544) · [arXiv](https://arxiv.org/abs/2201.03544) |
|  | Leike et al. (2017). AI Safety Gridworlds. *arXiv* | AI safety gridworlds: small test environments for these failure modes. | [PDF](https://arxiv.org/pdf/1711.09883) · [arXiv](https://arxiv.org/abs/1711.09883) |
| ★ | Ng, Harada & Russell (1999). Policy invariance under reward transformations: theory and application to reward shaping. *ICML 1999* | Which shaping terms cannot change the optimal behaviour (potential-based shaping). | [PDF](https://people.eecs.berkeley.edu/~russell/papers/icml99-shaping.pdf) |

### 17.12 Generalization, evaluation methodology and statistics

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Zhang et al. (2018). A Study on Overfitting in Deep Reinforcement Learning. *arXiv* | Agents memorize training levels and seeds. Your seed-overfitting risk, studied. | [PDF](https://arxiv.org/pdf/1804.06893) · [arXiv](https://arxiv.org/abs/1804.06893) |
| ★ | Cobbe et al. (2018). Quantifying Generalization in Reinforcement Learning. *arXiv* | Quantifying generalization with separate train and test levels (CoinRun). | [PDF](https://arxiv.org/pdf/1812.02341) · [arXiv](https://arxiv.org/abs/1812.02341) |
|  | Cobbe et al. (2019). Leveraging Procedural Generation to Benchmark Reinforcement Learning. *arXiv* | Procgen: procedurally generated levels as a generalization benchmark. | [PDF](https://arxiv.org/pdf/1912.01588) · [arXiv](https://arxiv.org/abs/1912.01588) |
| ★ | Justesen et al. (2018). Illuminating Generalization in Deep Reinforcement Learning through Procedural Level Generation. *arXiv* | Procedural level generation to make game agents generalize. | [PDF](https://arxiv.org/pdf/1806.10729) · [arXiv](https://arxiv.org/abs/1806.10729) |
|  | Kirk et al. (2021). A Survey of Zero-shot Generalisation in Deep Reinforcement Learning. *arXiv* | Survey of generalization in deep RL. | [PDF](https://arxiv.org/pdf/2111.09794) · [arXiv](https://arxiv.org/abs/2111.09794) |
| ★ | Machado et al. (2017). Revisiting the Arcade Learning Environment: Evaluation Protocols and Open Problems for General Agents. *arXiv* | Deterministic Atari invites memorization; sticky actions and evaluation protocols. Directly relevant to a deterministic game. | [PDF](https://arxiv.org/pdf/1709.06009) · [arXiv](https://arxiv.org/abs/1709.06009) |
| ★ | Henderson et al. (2017). Deep Reinforcement Learning that Matters. *arXiv* | Seeds, implementation details and reporting change RL results; how to report honestly. | [PDF](https://arxiv.org/pdf/1709.06560) · [arXiv](https://arxiv.org/abs/1709.06560) |
| ★ | Agarwal et al. (2021). Deep Reinforcement Learning at the Edge of the Statistical Precipice. *arXiv* | Statistics for few runs: IQM, confidence intervals, performance profiles (rliable). | [PDF](https://arxiv.org/pdf/2108.13264) · [arXiv](https://arxiv.org/abs/2108.13264) |
| ★ | Colas et al. (2018). How Many Random Seeds? Statistical Power Analysis in Deep Reinforcement Learning Experiments. *arXiv* | How many random seeds you need to claim one method beats another. | [PDF](https://arxiv.org/pdf/1806.08295) · [arXiv](https://arxiv.org/abs/1806.08295) |
|  | Demšar (2006). Statistical Comparisons of Classifiers over Multiple Data Sets. *JMLR 7* | Non-parametric tests for comparing algorithms across many tasks. | [PDF](https://jmlr.org/papers/volume7/demsar06a/demsar06a.pdf) |
| ★ | Derrac et al. (2011). A practical tutorial on the use of nonparametric statistical tests as a methodology for comparing evolutionary and swarm intelligence algorithms. *Swarm and Evolutionary Computation* | Tutorial on non-parametric tests specifically for evolutionary algorithms. | [DOI](https://doi.org/10.1016/j.swevo.2011.02.002) |
|  | Bergstra & Bengio (2012). Random Search for Hyper-Parameter Optimization. *JMLR 13* | Why random search beats grid search for tuning σ, population and the rest. | [PDF](https://jmlr.org/papers/volume13/bergstra12a/bergstra12a.pdf) |
|  | Akiba et al. (2019). Optuna: A Next-generation Hyperparameter Optimization Framework. *arXiv* | Optuna: practical hyperparameter search framework. | [PDF](https://arxiv.org/pdf/1907.10902) · [arXiv](https://arxiv.org/abs/1907.10902) |

### 17.13 Curriculum, transfer and forgetting

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Bengio et al. (2009). Curriculum learning. *Proceedings of the 26th Annual International Conference on Machine Learning* | Curriculum learning: easy to hard helps learning. | [PDF](https://ronan.collobert.com/pub/2009_curriculum_icml.pdf) · [DOI](https://doi.org/10.1145/1553374.1553380) |
| ★ | Narvekar et al. (2020). Curriculum Learning for Reinforcement Learning Domains: A Framework and Survey. *arXiv* | Curriculum learning for RL: framework and survey. | [PDF](https://arxiv.org/pdf/2003.04960) · [arXiv](https://arxiv.org/abs/2003.04960) |
|  | Portelas et al. (2020). Automatic Curriculum Learning For Deep RL: A Short Survey. *arXiv* | Automatic curriculum learning: survey. | [PDF](https://arxiv.org/pdf/2003.04664) · [arXiv](https://arxiv.org/abs/2003.04664) |
| ★ | Taylor & Stone (2009). Transfer Learning for Reinforcement Learning Domains: A Survey. *JMLR 10* | Transfer between tasks; relevant to zombies → co-op → deathmatch. | [PDF](https://jmlr.org/papers/volume10/taylor09a/taylor09a.pdf) |
|  | McCloskey & Cohen (1989). Catastrophic Interference in Connectionist Networks: The Sequential Learning Problem. *Psychology of Learning and Motivation* | The original catastrophic-interference paper. | [DOI](https://doi.org/10.1016/S0079-7421(08)60536-8) |
| ★ | French (1999). Catastrophic forgetting in connectionist networks. *Trends in Cognitive Sciences* | Review of catastrophic forgetting. | [DOI](https://doi.org/10.1016/S1364-6613(99)01294-2) |
|  | Kirkpatrick et al. (2016). Overcoming catastrophic forgetting in neural networks. *arXiv* | Elastic weight consolidation: protecting important weights when learning a new task. | [PDF](https://arxiv.org/pdf/1612.00796) · [arXiv](https://arxiv.org/abs/1612.00796) |
|  | Parisi et al. (2018). Continual Lifelong Learning with Neural Networks: A Review. *arXiv* | Review of continual (lifelong) learning. | [PDF](https://arxiv.org/pdf/1802.07569) · [arXiv](https://arxiv.org/abs/1802.07569) |
| ★ | Ellefsen et al. (2015). Neural Modularity Helps Organisms Evolve to Learn New Skills without Forgetting Old Skills. *PLOS Computational Biology* | Neuroevolution: modular networks learn new skills without forgetting old ones. | [PDF](https://journals.plos.org/ploscompbiol/article/file?id=10.1371/journal.pcbi.1004128&type=printable) · [DOI](https://doi.org/10.1371/journal.pcbi.1004128) |

### 17.14 Ratings and skill

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Glickman (1999). Parameter Estimation in Large Dynamic Paired Comparison Experiments. *Journal of the Royal Statistical Society Series C: Applied Statistics* | Glicko: Elo with rating uncertainty. | [PDF](http://www.glicko.net/research/glicko.pdf) · [DOI](https://doi.org/10.1111/1467-9876.00159) |
|  | Glickman (2022). Example of the Glicko-2 system. *note* | Step-by-step Glicko-2 computation; easy to implement. | [PDF](http://www.glicko.net/glicko/glicko2.pdf) |
| ★ | Herbrich et al. (2007). TrueSkill™: A Bayesian Skill Rating System. *NeurIPS 2006 (proceedings 2007)* | TrueSkill: Bayesian ratings for more than 2 players and teams (free-for-all). | [PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2007/01/NIPS2006_0688.pdf) · [DOI](https://doi.org/10.7551/mitpress/7503.003.0076) |
| ★ | Balduzzi et al. (2018). Re-evaluating Evaluation. *arXiv* | Re-evaluating evaluation: Nash averaging, and why Elo misleads with cycles. | [PDF](https://arxiv.org/pdf/1806.02643) · [arXiv](https://arxiv.org/abs/1806.02643) |

### 17.15 Human-like bots, difficulty and game-AI evaluation

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Hingston (2009). A Turing Test for Computer Game Bots. *IEEE Transactions on Computational Intelligence and AI in Games* | The BotPrize: a Turing test for game bots. | [DOI](https://doi.org/10.1109/TCIAIG.2009.2032534) |
| ★ | Zhao et al. (2019). Winning Isn't Everything: Enhancing Game Development with Intelligent Agents. *arXiv* | EA (Electronic Arts) on agents for game development: skill levels, human-likeness, playtesting. | [PDF](https://arxiv.org/pdf/1903.10545) · [arXiv](https://arxiv.org/abs/1903.10545) |
|  | Hunicke (2005). The case for dynamic difficulty adjustment in games. *Proceedings of the 2005 ACM SIGCHI International Conference on Advances in computer entertainment technology* | The case for dynamic difficulty adjustment. | [DOI](https://doi.org/10.1145/1178477.1178573) |
| ★ | Isaksen et al. (2018). Exploring Game Space of Minimal Action Games via Parameter Tuning and Survival Analysis. *IEEE Transactions on Games* | Survival analysis of game difficulty with simulated players: your survival-analysis background applied to games. | [DOI](https://doi.org/10.1109/tciaig.2017.2750181) |
|  | Justesen et al. (2017). Deep Learning for Video Game Playing. *arXiv* | Survey of deep learning for playing video games. | [PDF](https://arxiv.org/pdf/1708.07902) · [arXiv](https://arxiv.org/abs/1708.07902) |

### 17.16 Platforms and benchmarks (for comparison and ideas)

| | Paper | Why read it | Links |
|---|---|---|---|
|  | Bellemare et al. (2012). The Arcade Learning Environment: An Evaluation Platform for General Agents. *arXiv* | The Arcade Learning Environment (Atari). | [PDF](https://arxiv.org/pdf/1207.4708) · [arXiv](https://arxiv.org/abs/1207.4708) |
|  | Kempka et al. (2016). ViZDoom: A Doom-based AI Research Platform for Visual Reinforcement Learning. *arXiv* | ViZDoom: Doom as a research platform (first-person shooter). | [PDF](https://arxiv.org/pdf/1605.02097) · [arXiv](https://arxiv.org/abs/1605.02097) |
| ★ | Lample & Chaplot (2016). Playing FPS Games with Deep Reinforcement Learning. *arXiv* | Deep RL agents for FPS deathmatch in ViZDoom. | [PDF](https://arxiv.org/pdf/1609.05521) · [arXiv](https://arxiv.org/abs/1609.05521) |
|  | Perez-Liebana et al. (2018). General Video Game AI: a Multi-Track Framework for Evaluating Agents, Games and Content Generation Algorithms. *arXiv* | General Video Game AI framework. | [PDF](https://arxiv.org/pdf/1802.10363) · [arXiv](https://arxiv.org/abs/1802.10363) |
|  | Juliani et al. (2018). Unity: A General Platform for Intelligent Agents. *arXiv* | Unity ML-Agents. | [PDF](https://arxiv.org/pdf/1809.02627) · [arXiv](https://arxiv.org/abs/1809.02627) |

### 17.17 Deep RL (for later, when the GPU becomes useful)

| | Paper | Why read it | Links |
|---|---|---|---|
|  | Mnih et al. (2015). Human-level control through deep reinforcement learning. *Nature* | DQN: deep RL on Atari. | [DOI](https://doi.org/10.1038/nature14236) |
|  | Mnih et al. (2016). Asynchronous Methods for Deep Reinforcement Learning. *arXiv* | A3C: asynchronous actor-critic. | [PDF](https://arxiv.org/pdf/1602.01783) · [arXiv](https://arxiv.org/abs/1602.01783) |
| ★ | Schulman et al. (2017). Proximal Policy Optimization Algorithms. *arXiv* | PPO: the default deep RL algorithm today. | [PDF](https://arxiv.org/pdf/1707.06347) · [arXiv](https://arxiv.org/abs/1707.06347) |
|  | Schulman et al. (2015). High-Dimensional Continuous Control Using Generalized Advantage Estimation. *arXiv* | GAE: the advantage estimator PPO uses. | [PDF](https://arxiv.org/pdf/1506.02438) · [arXiv](https://arxiv.org/abs/1506.02438) |
| ★ | Huang et al. (2022). The 37 Implementation Details of Proximal Policy Optimization. *ICLR Blog Track* | Every detail that makes PPO work in practice. | [Link](https://iclr-blog-track.github.io/2022/03/25/ppo-implementation-details/) |
|  | Engstrom et al. (2020). Implementation Matters in Deep Policy Gradients: A Case Study on PPO and TRPO. *arXiv* | Implementation details matter as much as the algorithm. | [PDF](https://arxiv.org/pdf/2005.12729) · [arXiv](https://arxiv.org/abs/2005.12729) |
|  | Andrychowicz et al. (2020). What Matters In On-Policy Reinforcement Learning? A Large-Scale Empirical Study. *arXiv* | Large-scale study of what matters in on-policy RL. | [PDF](https://arxiv.org/pdf/2006.05990) · [arXiv](https://arxiv.org/abs/2006.05990) |
|  | Espeholt et al. (2018). IMPALA: Scalable Distributed Deep-RL with Importance Weighted Actor-Learner Architectures. *arXiv* | IMPALA: scalable distributed actor-learner. | [PDF](https://arxiv.org/pdf/1802.01561) · [arXiv](https://arxiv.org/abs/1802.01561) |
|  | Hessel et al. (2017). Rainbow: Combining Improvements in Deep Reinforcement Learning. *arXiv* | Rainbow: combined DQN improvements. | [PDF](https://arxiv.org/pdf/1710.02298) · [arXiv](https://arxiv.org/abs/1710.02298) |
|  | Huang et al. (2021). CleanRL: High-quality Single-file Implementations of Deep Reinforcement Learning Algorithms. *arXiv* | CleanRL: single-file reference implementations. | [PDF](https://arxiv.org/pdf/2111.08819) · [arXiv](https://arxiv.org/abs/2111.08819) |
|  | Raffin et al. (2021). Stable-Baselines3: Reliable Reinforcement Learning Implementations. *JMLR 22* | The most used RL library in Python. | [PDF](https://jmlr.org/papers/volume22/20-1364/20-1364.pdf) |

### 17.18 Survival analysis (for bot lifetimes)

| | Paper | Why read it | Links |
|---|---|---|---|
|  | Kaplan & Meier (1958). Nonparametric Estimation from Incomplete Observations. *Journal of the American Statistical Association* | Kaplan–Meier: the estimator for right-censored lifetimes. | [DOI](https://doi.org/10.1080/01621459.1958.10501452) |
|  | Cox (1972). Regression Models and Life-Tables. *Journal of the Royal Statistical Society Series B: Statistical Methodology* | The Cox proportional hazards model. | [DOI](https://doi.org/10.1111/j.2517-6161.1972.tb00899.x) |
| ★ | Davidson-Pilon (2019). lifelines: survival analysis in Python. *Journal of Open Source Software* | lifelines: survival analysis in Python; use it on your episode Parquet files. | [PDF](https://www.theoj.org/joss-papers/joss.01317/10.21105.joss.01317.pdf) · [DOI](https://doi.org/10.21105/joss.01317) |

### 17.19 Libraries (papers describing tools)

| | Paper | Why read it | Links |
|---|---|---|---|
|  | Toklu et al. (2023). EvoTorch: Scalable Evolutionary Computation in Python. *arXiv* | EvoTorch: scalable evolutionary computation in PyTorch. | [PDF](https://arxiv.org/pdf/2302.12600) · [arXiv](https://arxiv.org/abs/2302.12600) |
|  | Lange (2022). evosax: JAX-based Evolution Strategies. *arXiv* | evosax: evolution strategies in JAX. | [PDF](https://arxiv.org/pdf/2212.04180) · [arXiv](https://arxiv.org/abs/2212.04180) |
|  | Tang et al. (2022). EvoJAX: Hardware-Accelerated Neuroevolution. *arXiv* | EvoJAX: hardware-accelerated neuroevolution. | [PDF](https://arxiv.org/pdf/2202.05008) · [arXiv](https://arxiv.org/abs/2202.05008) |

### 17.20 Combining specialists and in-match adaptation (planned work, see `docs/plans.md`)

Background for the "Bot AI" entry in `docs/plans.md`: picking between specialists per match
(bandit), per situation (manager network), or merging them into one network.

| | Paper | Why read it | Links |
|---|---|---|---|
| ★ | Lattimore & Szepesvári (2020). Bandit Algorithms. *Cambridge University Press* | The bandit textbook: UCB, Thompson sampling, and non-stationary bandits for picking a style per match. The author hosts a free PDF at tor-lattimore.com/downloads/book/book.pdf; that server was too slow to verify from here. | [DOI](https://doi.org/10.1017/9781108571401) |
| ★ | Jacobs et al. (1991). Adaptive Mixtures of Local Experts. *Neural Computation* | Mixture of experts: a gating network hands each input to a specialist. The idea behind the "manager" option. | [DOI](https://doi.org/10.1162/neco.1991.3.1.79) |
| ★ | Sutton et al. (1999). Between MDPs and semi-MDPs: A framework for temporal abstraction in reinforcement learning. *Artificial Intelligence* | The options framework: sub-behaviors that run for a while once chosen, which prevents jittery switching. | [DOI](https://doi.org/10.1016/S0004-3702(99)00052-1) |
| | Rusu et al. (2015). Policy Distillation. *arXiv* | Training one student network to imitate several specialists. | [PDF](https://arxiv.org/pdf/1511.06295) · [arXiv](https://arxiv.org/abs/1511.06295) |
| | Teh et al. (2017). Distral: Robust Multitask Reinforcement Learning. *arXiv* | Distillation across tasks, keeping a shared policy and task policies close. | [PDF](https://arxiv.org/pdf/1707.04175) · [arXiv](https://arxiv.org/abs/1707.04175) |
| | Wortsman et al. (2022). Model soups: averaging weights of multiple fine-tuned models improves accuracy without increasing inference time. *arXiv* | Why weight averaging only works for models fine-tuned from the same base, and so not for separately evolved bots. | [PDF](https://arxiv.org/pdf/2203.05482) · [arXiv](https://arxiv.org/abs/2203.05482) |

**Deferred: networks that adapt within a match.** Parked for scope (owner decision,
2026-10-25). Kept here in case it comes back.

| | Paper | Why read it | Links |
|---|---|---|---|
| | Duan et al. (2016). RL²: Fast Reinforcement Learning via Slow Reinforcement Learning. *arXiv* | A recurrent network whose memory makes it adapt within an episode while its weights stay frozen. | [PDF](https://arxiv.org/pdf/1611.02779) · [arXiv](https://arxiv.org/abs/1611.02779) |
| | Wang et al. (2016). Learning to reinforcement learn. *arXiv* | The same idea, published at the same time. | [PDF](https://arxiv.org/pdf/1611.05763) · [arXiv](https://arxiv.org/abs/1611.05763) |
| | Finn et al. (2017). Model-Agnostic Meta-Learning for Fast Adaptation of Deep Networks. *arXiv* | MAML: a base model trained so that a few gradient steps adapt it. | [PDF](https://arxiv.org/pdf/1703.03400) · [arXiv](https://arxiv.org/abs/1703.03400) |
| | Soltoggio et al. (2017). Born to Learn: the Inspiration, Progress, and Future of Evolved Plastic Artificial Neural Networks. *arXiv* | Review of evolving learning rules (plasticity), neuroevolution's own form of learning during play. | [PDF](https://arxiv.org/pdf/1703.10371) · [arXiv](https://arxiv.org/abs/1703.10371) |
| | Najarro & Risi (2020). Meta-Learning through Hebbian Plasticity in Random Networks. *arXiv* | Evolving Hebbian rules so weights self-organize during an episode. | [PDF](https://arxiv.org/pdf/2007.02686) · [arXiv](https://arxiv.org/abs/2007.02686) |
| | Miconi et al. (2018). Differentiable plasticity: training plastic neural networks with backpropagation. *arXiv* | Plastic connections trained with gradients. | [PDF](https://arxiv.org/pdf/1804.02464) · [arXiv](https://arxiv.org/abs/1804.02464) |
| | Sun et al. (2019). Test-Time Training with Self-Supervision for Generalization under Distribution Shifts. *arXiv* | Adapting a copy of a model while it is being used. | [PDF](https://arxiv.org/pdf/1909.13231) · [arXiv](https://arxiv.org/abs/1909.13231) |
| | Wang et al. (2020). Tent: Fully Test-time Adaptation by Entropy Minimization. *arXiv* | Test-time adaptation without labels. | [PDF](https://arxiv.org/pdf/2006.10726) · [arXiv](https://arxiv.org/abs/2006.10726) |

### 17.21 Recent work worth knowing

| | Paper | Why read it | Links |
|---|---|---|---|
| | Sarkar et al. (2025). Evolution Strategies at the Hyperscale. *arXiv* | EGGROLL: evolution strategies with low-rank (rank-r) perturbations, so a whole population runs about as fast as batched inference on a GPU, for networks up to billions of parameters. Includes theory on ES in high dimensions and a minimal reference implementation (nano-egg). For this project it matters only if the networks grow large or the simulation moves to the GPU; today the CPU simulation is the bottleneck. | [PDF](https://arxiv.org/pdf/2511.16652) · [arXiv](https://arxiv.org/abs/2511.16652) · [Site](https://eshyperscale.github.io/) · [Code](https://github.com/ESHyperscale/HyperscaleES) · [nano-egg](https://github.com/ESHyperscale/nano-egg) |
| | Qiu et al. (2025). Evolution Strategies at Scale: LLM Fine-Tuning Beyond Reinforcement Learning. *arXiv* | ES fine-tuning of language models as an alternative to RL; the EGGROLL page builds on it. Evidence that ES scales far beyond small control networks. | [PDF](https://arxiv.org/pdf/2509.24372) · [arXiv](https://arxiv.org/abs/2509.24372) |
| | Cammarata (2026). Neural Networks Are Already Clean. *Goodfire, essay* | An informal working hypothesis (an essay, not a peer-reviewed paper): most neurons in vision and language models are individually understandable, and the evidence for "superposition" was misread. Relevant to inspecting your bots: with small evolved networks you can look at single neurons directly (which fire when the bot retreats or switches weapons), as §11's debug overlay suggests. | [Link](https://already-clean.goodfire.com/) |
| | Herring et al. (2026). Targeted Neuron Modulation via Contrastive Pair Search. *arXiv* | Contrastive neuron attribution (CNA): run the network on two contrasting sets of inputs and find the few MLP neurons whose activations differ most. It needs only forward passes, no gradients or extra training. Ablating or scaling those neurons changes behavior without degrading the rest. Shown on language-model refusal (Llama and Qwen, 1B to 72B), but the method is simple enough to try on a bot: compare "enemy close and life low" with "enemy close and life high" to find the neurons behind retreating, then inspect them, or ablate and scale them as a style or difficulty knob. That transfer to small policy networks is my extrapolation, not something the paper tests. | [PDF](https://arxiv.org/pdf/2605.12290) · [HTML](https://arxiv.org/html/2605.12290v1) · [arXiv](https://arxiv.org/abs/2605.12290) |

### Not included

* **Ficici & Pollack (1998)**, *Challenges in coevolutionary learning: arms-race dynamics,
  open-endedness, and mediocre stable states* (ALIFE VI). An important coevolution paper,
  but the copy I knew of returns 404 and it has no DOI. Search for it by title.
* **Clark & Amodei (OpenAI, 2016)**, *Faulty reward functions in the wild* (the boat-racing
  example). The page blocks automated checks, so I couldn't confirm the URL. The DeepMind
  and Krakovna posts in 17.11 cover the same example.
* **Free copies of Panait & Luke 2005 and Potter & de Jong 2000.** They exist on the GMU
  site, but it was unreachable from here; their DOIs are listed instead.
