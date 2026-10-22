import { describe, expect, it } from 'vitest';
import { DomainEventType } from '../../../src/domain/events.ts';
import { SoundId } from '../../../src/domain/sounds.ts';
import { INITIAL_AMBIENCE, stepAmbience, type AmbienceState } from '../../../src/domain/world/ambience.ts';

function run(state: AmbienceState, ticks: number, zombies: number, playing: number) {
  let current = state;
  const events = [];
  for (let i = 0; i < ticks; i++) {
    const step = stepAmbience(current, zombies, playing);
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

describe('zombie ambience', () => {
  it('chooses channels and frequency from the number of visible zombies', () => {
    expect(stepAmbience(INITIAL_AMBIENCE, 1, 0).state).toMatchObject({ channels: 1, frequencyTicks: 150 });
    expect(stepAmbience(INITIAL_AMBIENCE, 4, 0).state).toMatchObject({ channels: 2, frequencyTicks: 150 });
    expect(stepAmbience(INITIAL_AMBIENCE, 8, 0).state).toMatchObject({ channels: 3, frequencyTicks: 60 });
    expect(stepAmbience(INITIAL_AMBIENCE, 9, 0).state).toMatchObject({ channels: 3, frequencyTicks: 1 });
  });

  it('cycles four sample slots where slot 0 is silent, as in the original lookup', () => {
    const { events, state } = run(INITIAL_AMBIENCE, 4, 20, 0);
    expect(events.map((event) => (event.type === DomainEventType.AmbienceRequested ? event.sound : event.type))).toEqual([
      SoundId.ZombieAmbience1,
      SoundId.ZombieAmbience2,
      SoundId.ZombieAmbience3,
    ]);
    expect(state.sampleIndex).toBe(0);
  });

  it('does not start a sample when all channels are busy, and stops ambience when no zombie is visible', () => {
    expect(run(INITIAL_AMBIENCE, 150, 1, 1).events).toHaveLength(0);
    expect(stepAmbience(INITIAL_AMBIENCE, 0, 2).events).toEqual([{ type: DomainEventType.AmbienceStopped }]);
    expect(stepAmbience(INITIAL_AMBIENCE, 0, 0).events).toEqual([]);
  });
});
