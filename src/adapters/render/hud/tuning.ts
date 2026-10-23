import { MessageTone } from '../../../domain/events.ts';

export const HudSymbol = {
  Player: 'HUD.Player',
  Score: 'Hud.Score',
  ScoreTotal: 'Hud.ScoreTotal',
  Message: 'Hud.Message',
  Paused: 'HUD.Paused',
  PlayerFrags: 'Hud_PlayerFrags',
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
  Player1: 'mcPlayer1',
  Player2: 'mcPlayer2',
  Frags: 'tfFrags',
  PlayerName: 'tfPlayerName',
  SwitchSides: 'mcSwitchSides',
  Quit: '_Quit',
  UpgradeText: 'txtUpgrade',
  UpgradeIndex: 'txtMultiple',
} as const;

export const UPGRADE_COLUMNS = ['_Upgrade_C1', '_Upgrade_C2', '_Upgrade_C3'] as const;

export const SCORE_DIGITS = 12;
export const FRAG_DIGITS = 2;
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
};

export const AMMO_LETTER_SPACING_PX = -2;

export const PAUSE_ROW_SPACING_PX = 17;
export const UPGRADE_COLOR = 0xffffff;
export const NEW_WEAPON_UPGRADE_COLOR = 0x00ff00;
export const INACTIVE_UPGRADE_ALPHA = 0.25;

export const LIVE_CLIP_INFLATE_PX = 8;
