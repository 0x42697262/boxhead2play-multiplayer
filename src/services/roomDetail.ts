export const RoomDetail = {
  Auto: 'auto',
  High: 'high',
  Low: 'low',
} as const;

export type RoomDetail = (typeof RoomDetail)[keyof typeof RoomDetail];

export const DEFAULT_ROOM_DETAIL: RoomDetail = RoomDetail.Auto;
