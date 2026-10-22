# Deliberate deviations from the original

| Area | Original | Port | Reason |
|---|---|---|---|
| Randomness | `random(n)`, `Math.random()` | Injected `Rng` | Deterministic tests and replays. |
| High scores | Submitted to seantcooper.com (`CHighscore_Submit`) | Removed | The service is gone; see ADR 0003. |
| Analytics | `CTracker` | Removed | See ADR 0003. |
| Init object order | `mInitList` order is the order of AS2 constructors while the room is attached | `rooms/*.json` `initObjects` in pre-order: tag order (which equals depth order in every room), a clip before its nested children | AS2 queues a registered clip's constructor before the constructors of the children its first frame creates. The only nested init objects are collision solids inside pieces, so this order affects no gameplay. |
| XSI master materials | `Register_Materials` per `mItems` entry, iterated with AS2 `for..in` (newest-first) | `characters/xsi.json` `materials` merged from the last item to the first, so the first item wins | Same result as the original. No material differs between sets today. |
