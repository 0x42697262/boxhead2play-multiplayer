import { MessageTone } from '../../../domain/events.ts';

export const HudSymbol = {
  Player: 'HUD.Player',
  Score: 'Hud.Score',
  ScoreTotal: 'Hud.ScoreTotal',
  Message: 'Hud.Message',
  UpgradeList: 'HUD.Paused',
} as const;

export const HudChild = {
  Life: 'mcLife',
  Ammo: 'mcAmmo',
  AmmoText: 'tfAmount',
  ScoreText: 'tfScore',
  MultiplierText: 'tfMultiple',
  Timer: 'mcTimer',
  MessageText: 'tfMessage',
  PopupText: 'tfAmount',
  Quit: '_Quit',
  UpgradeText: 'txtUpgrade',
  UpgradeIndex: 'txtMultiple',
} as const;

export const UPGRADE_COLUMNS = ['_Upgrade_C1', '_Upgrade_C2', '_Upgrade_C3'] as const;

export const SCORE_DIGITS = 12;
export const PAD_CHARACTER = '0';

export const SCORE_POPUP_SPEED_PX = 5;
export const SCORE_POPUP_ACCELERATION = 1.05;
export const SCORE_POPUP_FADE_START_Y = 140;
export const SCORE_POPUP_FADE_OFFSET = 40;

export const MESSAGE_START_MOVE_PX = 100;
export const MESSAGE_PUSH_PX = 19;
export const MESSAGE_MOVE_FRACTION = 0.25;
export const MESSAGE_FADE_START_MS = 2500;
export const MESSAGE_FADE_DIVISOR = 5;
export const MS_PER_SECOND = 1000;

export const MESSAGE_COLORS: Readonly<Record<MessageTone, number>> = {
  [MessageTone.Info]: 0xffffff,
  [MessageTone.Level]: 0xffffff,
  [MessageTone.Upgrade]: 0x00ff00,
  [MessageTone.Critical]: 0xff0000,
  [MessageTone.Joined]: 0xffff00,
};

export const AMMO_LETTER_SPACING_PX = -2;

export const UPGRADE_ROW_SPACING_PX = 17;
export const PAUSED_TITLE_DEPTH = 14;
export const UPGRADE_LIST_TITLE_DEPTH = 15;
export const SCOREBOARD_COLUMNS = UPGRADE_COLUMNS;
export const SCOREBOARD_TITLE_POSITION = { x: 320, y: 70 } as const;
export const UPGRADE_COLOR = 0xffffff;
export const NEW_WEAPON_UPGRADE_COLOR = 0x00ff00;
export const INACTIVE_UPGRADE_ALPHA = 0.25;

export const LIVE_CLIP_INFLATE_PX = 8;

export const PLAYER_NAME_CHILD = 'playerName';
export const PLAYER_NAME_FONT_PX = 10;
export const PLAYER_NAME_OFFSET_Y_PX = 14;
export const PLAYER_NAME_BOX_WIDTH_PX = 140;
export const LOCAL_PLAYER_NAME_COLOR = 0x00ff00;
export const OTHER_PLAYER_NAME_COLOR = 0xffffff;

export const PING_POSITION = { x: 634, y: 4 } as const;
export const PING_FONT_PX = 10;
export const PING_BOX_WIDTH_PX = 80;
export const PING_COLORS: readonly { readonly maxMs: number; readonly color: number }[] = [
  { maxMs: 60, color: 0x00ff00 },
  { maxMs: 120, color: 0xffff00 },
  { maxMs: 200, color: 0xff9900 },
];
export const PING_SLOW_COLOR = 0xff0000;

export const RESPAWN_TEXT_POSITION = { x: 320, y: 200 } as const;
export const RESPAWN_TEXT_SCALE = 2;
export const RESPAWN_TEXT_COLOR = 0xffffff;
