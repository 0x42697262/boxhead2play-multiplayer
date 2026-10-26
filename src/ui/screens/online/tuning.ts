import type { TextKey } from '../../../text/i18n.ts';
import type { TextStyle } from './stageText.ts';

export const EditTextAsset = {
  HudUpgradeRow: 24,
  HudMessage: 35,
  WinnerName: 536,
  FragsName: 58,
} as const;

const HUD_MESSAGE_FONT_PX = 24;
const WINNER_NAME_FONT_PX = 26;
const MENU_LABEL_FONT_PX = 42;
const WINDOW_TITLE_FONT_PX = 18;
const PROMPT_FONT_PX = 16;
const HEADING_FONT_PX = 14;
const SMALL_FONT_PX = 12;
const FRAGS_NAME_FONT_PX = 40;
const OPTION_TITLE_FONT_PX = 13;
const OPTION_BUTTON_FONT_PX = 17;
const UPGRADE_ROW_FONT_PX = 10;

export const TextStyles = {
  MenuLabel: { characterId: EditTextAsset.WinnerName, scale: MENU_LABEL_FONT_PX / WINNER_NAME_FONT_PX },
  WindowTitle: { characterId: EditTextAsset.HudMessage, scale: WINDOW_TITLE_FONT_PX / HUD_MESSAGE_FONT_PX },
  Prompt: { characterId: EditTextAsset.HudMessage, scale: PROMPT_FONT_PX / HUD_MESSAGE_FONT_PX },
  Heading: { characterId: EditTextAsset.HudMessage, scale: HEADING_FONT_PX / HUD_MESSAGE_FONT_PX },
  Small: { characterId: EditTextAsset.HudMessage, scale: SMALL_FONT_PX / HUD_MESSAGE_FONT_PX },
  RowLabel: { characterId: EditTextAsset.HudUpgradeRow, scale: 1 },
  ListHeading: { characterId: EditTextAsset.FragsName, scale: HEADING_FONT_PX / FRAGS_NAME_FONT_PX },
  ListItem: { characterId: EditTextAsset.FragsName, scale: SMALL_FONT_PX / FRAGS_NAME_FONT_PX },
  OptionTitle: { characterId: EditTextAsset.HudUpgradeRow, scale: OPTION_TITLE_FONT_PX / UPGRADE_ROW_FONT_PX },
  OptionInfo: { characterId: EditTextAsset.HudUpgradeRow, scale: 1 },
  OptionButton: { characterId: EditTextAsset.HudMessage, scale: OPTION_BUTTON_FONT_PX / HUD_MESSAGE_FONT_PX },
} as const satisfies Record<string, TextStyle>;

export const MENU_TEXT_COLOR = 0x333333;
export const ROW_LABEL_COLOR = 0x666666;
export const WINDOW_TEXT_COLOR = 0x000000;

export const OnlineMenuChild = {
  Host: 'mcSinglePlay',
  Join: 'mcCoopPlay',
  Contents: '_Contents',
  Back: '_Icon_Back',
  JoinWindow: 'mcWindow_Controls',
  Status: 'onlineStatus',
} as const;

export const BACK_TAB_DEPTH = 74;
export const MENU_LABEL_DEPTH = 3;
export const ATTACHED_LABEL_DEPTH = 4;
export const MENU_LABEL_TOP_OFFSET_PX = -6;
export const STATUS_TEXT = { depth: 90, anchorX: 320, top: 392, width: 600 } as const;

export const JoinWindowChild = {
  Title: 'joinTitle',
  Info: 'joinInfo',
  Cover: 'mc2PlayerCover',
  PressKey: 'mcPressKey',
  Reset: '_Button_Reset',
  Close: '_Button_Close',
  Button: '_Button',
  Selected: '_Selected',
  Lock: 'mcLock',
  RowLabelPrefix: 'joinRow',
} as const;

export const JOIN_TITLE_DEPTH = 95;
export const JOIN_INFO_DEPTH = 96;
export const JOIN_HIDDEN_DEPTHS: readonly number[] = [7, 94, JOIN_TITLE_DEPTH, JOIN_INFO_DEPTH];
export const JOIN_ATTACHED_DEPTH = 120;
export const JOIN_PANELS = ['mcPlayer1', 'mcPlayer2'] as const;
export const JOIN_ROW_ATTACHED_DEPTH = 50;
export const JOIN_LABEL_CELL_WIDTH_PX = 74;
export const JOIN_TEXT_WIDTH_PX = 440;

export interface JoinRowSpec {
  readonly button: string;
  readonly text: string;
  readonly labelDepth: number;
}

export const JOIN_ROWS: readonly JoinRowSpec[] = [
  { button: 'mcChangeKey_MoveUp', text: 'tbMoveUp', labelDepth: 18 },
  { button: 'mcChangeKey_MoveDown', text: 'tbMoveDown', labelDepth: 19 },
  { button: 'mcChangeKey_MoveLeft', text: 'tbMoveLeft', labelDepth: 20 },
  { button: 'mcChangeKey_MoveRight', text: 'tbMoveRight', labelDepth: 21 },
  { button: 'mcChangeKey_Shoot', text: 'tbShoot', labelDepth: 15 },
  { button: 'mcChangeKey_NextWeapon', text: 'tbNextWeapon', labelDepth: 16 },
  { button: 'mcChangeKey_PrevWeapon', text: 'tbPrevWeapon', labelDepth: 17 },
];

export const JOIN_SLOTS = JOIN_PANELS.length * JOIN_ROWS.length;

export interface JoinPagerButton {
  readonly name: string;
  readonly depth: number;
  readonly x: number;
  readonly step: number;
  readonly text: TextKey;
}

export const JOIN_PAGER_BUTTONS: readonly JoinPagerButton[] = [
  { name: 'joinPrevious', depth: 122, x: -85, step: -1, text: 'online.join.previous' },
  { name: 'joinNext', depth: 123, x: 85, step: 1, text: 'online.join.next' },
];
export const JOIN_PAGER_LABEL = 'pagerLabel';
export const JOIN_PAGER_LABEL_DEPTH = 6;
export const JOIN_PAGER_ATTACHED_LABEL_DEPTH = 7;
export const JOIN_PAGER_LABEL_COLOR = 0xffffff;
export const JOIN_PAGER_DISABLED_ALPHA = 0.3;

export const CARET_BLINK_TICKS = 25;

export const RoomChild = {
  Prompt: 'roomPrompt',
  Members: 'roomMember',
  Options: 'roomOptions',
  Notice: 'roomNotice',
  Invite: 'roomInvite',
  NameHint: 'roomNameHint',
} as const;

export const ROOM_PROMPT_DEPTH = 1;
export const ROOM_PROMPT_ATTACHED_DEPTH = 20;
export const ROOM_MEMBER_LINES = 12;
export const ROOM_INVITE = { depth: 399, anchorX: 632, top: 8, width: 420, align: 'right' } as const;
export const ROOM_MEMBERS = { depth: 400, left: 6, top: 242, lineHeight: 17, width: 196 } as const;
export const ROOM_OPTIONS = { depth: 450, top: 342, width: 420 } as const;
export const ROOM_NOTICE = { depth: 451, anchorX: 320, top: 420, width: 600 } as const;
export const ROOM_NAME_BUTTON = { name: 'mcRoomName', depth: 90, matrix: [0.45, 0, 0, 0.5, 410, 446], labelWidth: 920 } as const;
export const ROOM_NAME_HINT = { depth: 452, anchorX: 410, top: 463, width: 420 } as const;
