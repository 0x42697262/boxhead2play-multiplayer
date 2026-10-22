export const LogEvent = {
  BootStarted: 'boot.started',
  BootFailed: 'boot.failed',
  AssetsLoaded: 'assets.loaded',
  AssetLoadFailed: 'assets.load_failed',
  SaveDataLoaded: 'save.loaded',
  SaveDataMigrated: 'save.migrated',
  SaveDataRejected: 'save.rejected',
  SaveDataWriteFailed: 'save.write_failed',
  ScreenChanged: 'screen.changed',
  WorldStarted: 'world.started',
  WorldCompleted: 'world.completed',
  AudioUnavailable: 'audio.unavailable',
  FrameBudgetExceeded: 'loop.frame_budget_exceeded',
} as const;

export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];
