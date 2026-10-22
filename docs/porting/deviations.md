# Deliberate deviations from the original

| Area | Original | Port | Reason |
|---|---|---|---|
| Randomness | `random(n)`, `Math.random()` | Injected `Rng` | Deterministic tests and replays. |
| High scores | Submitted to seantcooper.com (`CHighscore_Submit`) | Removed | The service is gone; see ADR 0003. |
| Analytics | `CTracker` | Removed | See ADR 0003. |
