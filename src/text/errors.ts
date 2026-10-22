export const ErrorCode = {
  ConfigInvalid: 'CONFIG_INVALID',
  AssetMissing: 'ASSET_MISSING',
  AssetInvalid: 'ASSET_INVALID',
  RoomUnknown: 'ROOM_UNKNOWN',
  CanvasUnavailable: 'CANVAS_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}
