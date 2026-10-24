# ADR 0008: Room planes at their own resolution, with a ROOM DETAIL setting

Status: accepted

## Context

ADR 0006 renders every bitmap at the screen's resolution, up to 3 device pixels per stage
pixel. The room planes (floor, cover, decal mask, plus a temporary pieces surface while
they are built) are as large as the whole room, not the 640 x 480 view. ROOM_Single_0018 is
2784 x 2784 stage pixels: at resolution 2.25 (a 1080p window) each plane is 6264 x 6264
pixels, about 157 MB, so about 0.6 GB for the planes and more than 1 GB while a resize
rebuilds them.

* Safari (macOS and iOS) refuses canvases above 16,777,216 pixels (4096 x 4096). The
  context draws nothing or `getContext` fails, and the game breaks. At resolution 2.25
  room 18 is far above it; at resolution 3 rooms 14 and 16 are too.
* Phones run out of memory with planes this size.
* Drawing a frame copies only the visible part of the planes, so the per-frame cost does
  not depend on the plane size. Memory and the build time after a resize do.

## Decision

The planes get their own **plane resolution**, chosen by the `roomDetail` setting
(`src/services/roomDetail.ts`, SETTINGS row ROOM DETAIL):

* `low`: 1, the stage resolution of the original (`CWorld.bmDraw` was 640 x 480).
* `high`: the screen resolution.
* `auto` (default): the screen resolution, but at most what fits a per-plane pixel
  budget for the device, in steps of 0.25 and never below 1.

Every choice is then limited to the largest canvas the browser draws, so no choice can
break the game.

The math is a pure function, `planeResolution` in
`src/adapters/render/world/planeResolution.ts`; its numbers are in
`src/adapters/render/world/tuning.ts`:

* **Device budget** (`planeBudgetArea`): with `navigator.deviceMemory` (Chrome and Edge
  only; capped at 8 GiB by the browser), a share of the memory for the three planes at 4
  bytes per pixel: 1/32 on desktops, 1/64 on touch devices, limited to 4..64 M pixels.
  An 8 GiB desktop gets 22.4 M pixels per plane, room 18 resolution 1.5. Without device
  memory (Firefox, Safari): 16 M pixels on desktops, 8 M on touch devices. A device counts
  as touch with a coarse pointer or `navigator.maxTouchPoints > 0` (iPads report a Mac
  user agent).
* **Browser limit** (`CanvasAreaLimit`, `src/adapters/display/canvasArea.ts`): a probe
  creates an `OffscreenCanvas`, fills the far-corner pixel and reads it back. It tests the
  area the plane needs; when that fails it steps down through 256, 64, 32, 16, 8 and 4 M
  pixels. Results are cached (largest area that worked, smallest that failed), so each
  size class is probed once per page. Probing on demand, not at boot, means a page that
  only shows menus never allocates a test canvas, and no probe is larger than the plane
  about to be built. The probe is a square; the planes stay far below every browser's
  side limit, so only the area matters.

`WorldRenderer` asks for the plane resolution every frame (cheap: cached probe, a few
multiplications) and rebuilds the planes when it changes, so the setting applies at once,
also from the Esc menu. Planes below the screen resolution are drawn scaled with
smoothing; decals are stamped into them at the plane resolution.

## Consequences

* Room 18 loads in Safari on a 1080p window (plane resolution 1.25 instead of 2.25) and
  phones use about 30 MB per plane for it instead of 150 MB.
* With AUTO, large rooms on smaller devices look softer than menus and characters, which
  stay at the screen resolution. HIGH restores the ADR 0006 look where the browser
  allows it.
* A window resize that does not change the plane resolution (a room held by the budget or
  the browser limit) no longer rebuilds the planes.
* The pieces surface is released as soon as the decal mask is built, and old planes are
  released before new ones are built, so a rebuild no longer holds two sets.
* The budget numbers are estimates, not measurements on real devices. They are named
  constants and can be tuned.
