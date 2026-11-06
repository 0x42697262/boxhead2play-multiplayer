import { MainMenuChild } from '../menu/tuning.ts';

export const END_MATCH_BUTTON = { name: 'mcEndMatch', depth: 17, template: MainMenuChild.Options, offsetY: 33.25 } as const;

export const GameMenuButton = {
  Invite: MainMenuChild.SinglePlay,
  Settings: MainMenuChild.CoopPlay,
  Controls: MainMenuChild.DeathPlay,
  Quit: MainMenuChild.Options,
  EndMatch: END_MATCH_BUTTON.name,
} as const;

export type GameMenuButton = (typeof GameMenuButton)[keyof typeof GameMenuButton];

export const GameMenuKey = {
  Toggle: 'Escape',
} as const;

export const GAME_MENU_BACKDROP = 'rgba(255, 255, 255, 0.75)';
