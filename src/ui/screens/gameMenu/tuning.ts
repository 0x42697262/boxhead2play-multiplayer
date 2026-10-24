import { MainMenuChild } from '../menu/tuning.ts';

export const GameMenuButton = {
  Settings: MainMenuChild.CoopPlay,
  Quit: MainMenuChild.DeathPlay,
} as const;

export type GameMenuButton = (typeof GameMenuButton)[keyof typeof GameMenuButton];

export const GameMenuKey = {
  Toggle: 'Escape',
} as const;

export const GAME_MENU_BACKDROP = 'rgba(255, 255, 255, 0.75)';
