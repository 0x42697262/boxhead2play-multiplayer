export const PARALLEL_DOWNLOADS = 8;

export const LoadPhase = {
  Catalogs: 'catalogs',
  Graphics: 'graphics',
  Fonts: 'fonts',
  Sounds: 'sounds',
  Done: 'done',
} as const;

export type LoadPhase = (typeof LoadPhase)[keyof typeof LoadPhase];

export interface LoadProgress {
  readonly phase: LoadPhase;
  readonly loaded: number;
  readonly total: number;
}

export type ProgressListener = (progress: LoadProgress) => void;

export const FONT_FAMILY_PREFIX = 'swf-font-';
