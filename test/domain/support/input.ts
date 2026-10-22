import { IDLE_CONTROL, IDLE_PLAYER_INPUT, IDLE_TICK_INPUT, type PlayerControl, type PlayerInput, type TickInput } from '../../../src/domain/world/input.ts';

export function held(...controls: PlayerControl[]): PlayerInput {
  const input: Record<string, unknown> = { ...IDLE_PLAYER_INPUT };
  for (const control of controls) input[control] = { ...IDLE_CONTROL, down: true, pressed: true };
  return input as PlayerInput;
}

export function released(...controls: PlayerControl[]): PlayerInput {
  const input: Record<string, unknown> = { ...IDLE_PLAYER_INPUT };
  for (const control of controls) input[control] = { ...IDLE_CONTROL, released: true };
  return input as PlayerInput;
}

export function tickInput(...players: PlayerInput[]): TickInput {
  return { ...IDLE_TICK_INPUT, players };
}

export function idleInput(): TickInput {
  return tickInput();
}
