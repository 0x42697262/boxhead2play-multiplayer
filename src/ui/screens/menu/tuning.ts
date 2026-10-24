import { GameMode } from '../../../domain/world/GameMode.ts';
import { Difficulty, GameAmount, GameSpeed } from '../../../domain/world/SimulationSettings.ts';
import { BASE_TICKS_PER_SECOND } from '../../../domain/world/tuning.ts';
import { GraphicsQuality } from '../../../services/graphicsQuality.ts';
import { SOUND_VOLUME_MAX, SOUND_VOLUME_OFF } from '../../../services/SettingsService.ts';
import type { TextKey } from '../../../text/i18n.ts';
import type { KeyField } from '../../../services/menuSettings.ts';
import { OPTION_OFF, OPTION_ON, OptionField } from '../../../services/menuSettings.ts';

export const MENU_TICKS_PER_SECOND = 50;
export const SCREEN_PROCESS_TICKS = MENU_TICKS_PER_SECOND / BASE_TICKS_PER_SECOND;

export const TRANSITION_STEPS = 10;

export const MenuSymbol = {
  Main: 'Screen_Main',
  SelectWorld: 'Screen_SelectWorld',
  LevelIcons: 'LevelIcons_Single',
} as const;

export const SUB_SCREEN_SYMBOLS: Readonly<Record<GameMode, string>> = {
  [GameMode.Single]: 'SubScreen_Single',
  [GameMode.Coop]: 'SubScreen_Coop',
  [GameMode.DeathMatch]: 'SubScreen_DeathMatch',
};

export const MAIN_MENU_BACKGROUND_DEPTH = 1;
export const MAIN_MENU_TITLE_DEPTH = 82;

export const MainMenuChild = {
  SinglePlay: 'mcSinglePlay',
  CoopPlay: 'mcCoopPlay',
  DeathPlay: 'mcDeathPlay',
  Options: 'mcInstructions',
  Contents: '_Contents',
  OptionsWindow: 'mcWindow_Options',
} as const;

export const SetupWindowChild = {
  Lock: 'mcLock',
  Close: '_Button_Close',
  Reset: '_Button_Reset',
  Button: '_Button',
  Selected: '_Selected',
  Title: 'setupTitle',
  RowTitle: 'setupRowTitle',
  RowInfo: 'setupRowInfo',
  ButtonLabel: 'setupButtonLabel',
} as const;

export const SETUP_WINDOW_BACKGROUND_DEPTH = 3;
export const SETUP_TITLE_DEPTH = 134;
export const SETUP_BUTTON_LABEL_DEPTH = 6;
export const SETUP_ATTACHED_DEPTH = 300;
export const SETUP_ATTACHED_LABEL_DEPTH = 10;
export const SETUP_INFO_WIDTH_PX = 500;
export const SETUP_TITLE_CENTER_X = 0;

export interface SetupButtonSpec<Value> {
  readonly instance: string;
  readonly value: Value;
  readonly label: TextKey;
}

export interface SetupRowSpec<Value> {
  readonly titleDepth: number;
  readonly infoDepth: number;
  readonly rowOf: string;
  readonly title: TextKey;
  readonly info: TextKey;
  readonly buttons: readonly SetupButtonSpec<Value>[];
}

export const GRAPHICS_ROW: SetupRowSpec<GraphicsQuality> = {
  titleDepth: 12,
  infoDepth: 20,
  rowOf: '_Collide_Off',
  title: 'setup.graphics.title',
  info: 'setup.graphics.info',
  buttons: [
    { instance: '_Level_Beginner', value: GraphicsQuality.Sharp, label: 'setup.graphics.sharp' },
    { instance: '_Level_Intermediate', value: GraphicsQuality.Smooth, label: 'setup.graphics.smooth' },
    { instance: '_Level_Expert', value: GraphicsQuality.Pixelated, label: 'setup.graphics.pixelated' },
  ],
};

const VOLUME_LOW = 25;
const VOLUME_MEDIUM = 50;

export const VOLUME_ROW: SetupRowSpec<number> = {
  titleDepth: 28,
  infoDepth: 36,
  rowOf: '_Devils_Off',
  title: 'setup.volume.title',
  info: 'setup.volume.info',
  buttons: [
    { instance: '_Game1', value: SOUND_VOLUME_OFF, label: 'setup.volume.off' },
    { instance: '_Game2', value: VOLUME_LOW, label: 'setup.volume.low' },
    { instance: '_Game3', value: VOLUME_MEDIUM, label: 'setup.volume.medium' },
    { instance: '_Game4', value: SOUND_VOLUME_MAX, label: 'setup.volume.full' },
  ],
};

export const SHAKE_ROW: SetupRowSpec<boolean> = {
  titleDepth: 44,
  infoDepth: 52,
  rowOf: '_Damage_Off',
  title: 'setup.shake.title',
  info: 'setup.shake.info',
  buttons: [
    { instance: '_Damage_Off', value: false, label: 'setup.switch.off' },
    { instance: '_Damage_On', value: true, label: 'setup.switch.on' },
  ],
};

export const BLOOD_ROW: SetupRowSpec<boolean> = {
  titleDepth: 53,
  infoDepth: 75,
  rowOf: '_Speed_Slow',
  title: 'setup.blood.title',
  info: 'setup.blood.info',
  buttons: [
    { instance: '_Speed_Slow', value: false, label: 'setup.switch.off' },
    { instance: '_Speed_Normal', value: true, label: 'setup.switch.on' },
  ],
};

export const ROLL_OUT_ALPHA = 0.5;
export const ROLL_OVER_ALPHA = 1;

export const ROLL_OVER_SHADOW = {
  maxDistance: 3,
  angleChoices: 360,
  blur: 4,
  strength: 1,
  quality: 1,
  color: { r: 0, g: 0, b: 0, a: 255 },
} as const;

export const ROLL_OVER_BLUR = { max: 2, quality: 1 } as const;

export const SELECT_WORLD_REMOVED_NAMES: ReadonlySet<string> = new Set(['_IconMoreGames', '_STC']);
export const SELECT_WORLD_BANNER_DEPTHS: ReadonlySet<number> = new Set([50, 56, 60, 65]);

export const SelectWorldChild = {
  SubScreenContainer: '_SubScreen_Container',
  Back: '_Icon_Back',
  GameOptions: '_Game_Options',
  GameControls: '_Game_Controls',
  WindowOptions: 'mcWindow_Options',
  WindowControls: 'mcWindow_Controls',
  Button: '_Button',
  Selected: '_Selected',
  Close: '_Button_Close',
  Reset: '_Button_Reset',
  Lock: 'mcLock',
  LevelSelection: 'mcLevel_Selection',
  LevelIcons: '_mcLevelIcons',
  Shadow: '_Shadow',
  Left: 'bLeft',
  Right: 'bRight',
  ViewHighScore: '_ViewHighScore',
  Exclusive: 'mcExclusive',
  Character: 'mcCharacter',
  PressKey: 'mcPressKey',
  PressAKey: 'mcPressAKey',
  InvalidKey: 'mcInvalidKey',
  TwoPlayerCover: 'mc2PlayerCover',
} as const;

export const PLAYER_CHARACTER_CARD = 'mcPlayer1_Character';
export const SECOND_CHARACTER_CARD = 'mcPlayer2_Character';
export const SECOND_CHARACTER_LABEL_DEPTH = 37;
export const CONTROL_PANEL = 'mcPlayer1';
export const SECOND_CONTROL_PANEL = 'mcPlayer2';
export const CONTROLS_TITLE_DEPTH = 7;
export const SECOND_CONTROLS_TITLE_DEPTH = 94;
export const CONTROLS_INFO_DEPTH = 96;
export const CONTROLS_PANEL_X = -77.5;
export const CONTROLS_TEXT_CENTER_X = 0;
export const CONTROLS_TEXT_WIDTH_PX = 440;
export const CONTROLS_ATTACHED_DEPTH = 130;

export const HISCORE_NOTE = 'Forfeits hiscore!';
export const OPTION_INFO_CLIP_MARGIN_PX = 4;

export const ControlsWindowText = {
  Title: 'controlsTitle',
  Info: 'controlsInfo',
} as const;

export const SELECT_WORLD_EXPANDED: ReadonlySet<string> = new Set([
  SelectWorldChild.SubScreenContainer,
  SelectWorldChild.LevelSelection,
  SelectWorldChild.WindowOptions,
  SelectWorldChild.WindowControls,
  SelectWorldChild.PressKey,
  PLAYER_CHARACTER_CARD,
  SECOND_CHARACTER_CARD,
]);

export interface OptionButtonSpec {
  readonly instance: string;
  readonly value: number;
}

export interface OptionGroupSpec {
  readonly field: OptionField;
  readonly buttons: readonly OptionButtonSpec[];
}

export const OPTION_GROUPS: readonly OptionGroupSpec[] = [
  {
    field: OptionField.Difficulty,
    buttons: [
      { instance: '_Level_Beginner', value: Difficulty.Beginner },
      { instance: '_Level_Intermediate', value: Difficulty.Intermediate },
      { instance: '_Level_Expert', value: Difficulty.Expert },
      { instance: '_Level_Nightmare', value: Difficulty.Nightmare },
    ],
  },
  {
    field: OptionField.GameSpeed,
    buttons: [
      { instance: '_Speed_Slow', value: GameSpeed.Slow },
      { instance: '_Speed_Normal', value: GameSpeed.Normal },
      { instance: '_Speed_Fast', value: GameSpeed.Fast },
    ],
  },
  {
    field: OptionField.Devils,
    buttons: [
      { instance: '_Devils_Off', value: OPTION_OFF },
      { instance: '_Devils_On', value: OPTION_ON },
    ],
  },
  {
    field: OptionField.Collisions,
    buttons: [
      { instance: '_Collide_Off', value: OPTION_OFF },
      { instance: '_Collide_On', value: OPTION_ON },
    ],
  },
  {
    field: OptionField.Damage,
    buttons: [
      { instance: '_Damage_Off', value: OPTION_OFF },
      { instance: '_Damage_On', value: OPTION_ON },
    ],
  },
  {
    field: OptionField.GameAmount,
    buttons: [
      { instance: '_Game1', value: GameAmount.Kills5 },
      { instance: '_Game2', value: GameAmount.Kills10 },
      { instance: '_Game3', value: GameAmount.Kills20 },
      { instance: '_Game4', value: GameAmount.Kills50 },
    ],
  },
];

export interface KeyRowSpec {
  readonly variable: string;
  readonly field: KeyField;
}

export const KEY_ROWS: readonly KeyRowSpec[] = [
  { variable: 'Shoot', field: 'fire' },
  { variable: 'MoveUp', field: 'up' },
  { variable: 'MoveDown', field: 'down' },
  { variable: 'MoveLeft', field: 'left' },
  { variable: 'MoveRight', field: 'right' },
  { variable: 'NextWeapon', field: 'nextWeapon' },
  { variable: 'PrevWeapon', field: 'prevWeapon' },
];

export const CHANGE_KEY_PREFIX = 'mcChangeKey_';
export const KEY_TEXT_PREFIX = 'tb';

export const INVALID_KEY_PHASE_MS = 500;
export const MS_PER_SECOND = 1000;
