export const PlayerControl = {
  Left: 'left',
  Right: 'right',
  Up: 'up',
  Down: 'down',
  Fire: 'fire',
  NextWeapon: 'nextWeapon',
  PrevWeapon: 'prevWeapon',
  Select0: 'select0',
  Select1: 'select1',
  Select2: 'select2',
  Select3: 'select3',
  Select4: 'select4',
  Select5: 'select5',
  Select6: 'select6',
  Select7: 'select7',
  Select8: 'select8',
  Select9: 'select9',
} as const;

export type PlayerControl = (typeof PlayerControl)[keyof typeof PlayerControl];

export interface ControlState {
  readonly down: boolean;
  readonly pressed: boolean;
  readonly released: boolean;
  readonly heldTicks: number;
}

export type PlayerInput = Readonly<Record<PlayerControl, ControlState>>;

export interface TickInput {
  readonly pausePressed: boolean;
  readonly quitRequested: boolean;
  readonly players: readonly PlayerInput[];
  readonly ambienceSamplesPlaying: number;
}

export const IDLE_CONTROL: ControlState = { down: false, pressed: false, released: false, heldTicks: 0 };

export const IDLE_PLAYER_INPUT: PlayerInput = Object.fromEntries(
  Object.values(PlayerControl).map((control) => [control, IDLE_CONTROL]),
) as PlayerInput;

export const IDLE_TICK_INPUT: TickInput = { pausePressed: false, quitRequested: false, players: [], ambienceSamplesPlaying: 0 };
