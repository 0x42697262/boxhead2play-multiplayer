export const TouchCode = {
  Up: 'TouchUp',
  Down: 'TouchDown',
  Left: 'TouchLeft',
  Right: 'TouchRight',
  Fire: 'TouchFire',
  NextWeapon: 'TouchNextWeapon',
  PrevWeapon: 'TouchPrevWeapon',
  UpgradeList: 'TouchUpgradeList',
} as const;

export type TouchCode = (typeof TouchCode)[keyof typeof TouchCode];

export const TOUCH_CODES: readonly TouchCode[] = Object.values(TouchCode);
