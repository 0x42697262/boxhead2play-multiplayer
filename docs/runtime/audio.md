# Audio

Source: `CSound.as`, `CWorld.ProcessAmbience`. Port: `src/adapters/audio/`.

## Model

`CSound.RegisterSound` attached each registration to its own `Sound` object on its own
movie clip, so every registration is one channel with its own volume:

* `SoundMixer` keeps one voice per `SoundId` (the domain's `mSamples` and `mAmbience`
  keys). Playing a voice that is still playing stops it and starts it again
  (`PlaySound_Normal`, `PlaySound_Positional`).
* Gain is the registration's volume factor (`SOUND_SAMPLES[id].volume`). The original
  called `PlaySound_Positional` with `(0, 0)` everywhere, which is pan 0 and volume 100, so
  the world position in `soundRequested` is ignored.
* `mAmbience` registrations are separate voices from the `mSamples` entries that use the
  same files. `ambiencePlaying()` counts the ambience voices still playing; `GameSession`
  passes it to the domain as `TickInput.ambienceSamplesPlaying`. `ambienceStopped` stops
  them.
* The sfx option (`SoundActive(false)`) stops every voice and ignores new requests. Every
  registration is `sfx`, so the music option has no effect.
* `CSound.Pause` is never called by the game. The port has no pause either.
  A finished game stops the ambience; leaving the game screen stops everything.

## WebAudio

`WebAudioOutput` decodes every registered MP3 (`sounds/index.json`) at boot into
`AudioBuffer`s. Each start creates an `AudioBufferSourceNode` through a `GainNode`.
The context starts suspended; the first key press or pointer press calls `resume()`
(browser autoplay policy). A hidden page, or single play frozen because the phone is upright
(`docs/runtime/loop.md`, "Visibility and portrait"), suspends the context; it resumes when
the page is visible and, for single play, in landscape again. Without WebAudio the mixer runs with a silent output and logs `audio.unavailable`.

Only registered sounds are decoded. The intro logo sounds (timeline StartSounds) are not
loaded, because the temporary shell has no intro screen.
