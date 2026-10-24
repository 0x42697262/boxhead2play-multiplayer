const MEBI = 1024 * 1024;

export const PLANE_RESOLUTION_STEP = 0.25;
export const LOW_PLANE_RESOLUTION = 1;
export const MIN_AUTO_PLANE_RESOLUTION = 1;

export const ROOM_PLANE_COUNT = 3;
export const BYTES_PER_GIB = 1024 * MEBI;
export const DESKTOP_PLANE_MEMORY_SHARE = 1 / 32;
export const TOUCH_PLANE_MEMORY_SHARE = 1 / 64;
export const DESKTOP_PLANE_BUDGET_PX = 16 * MEBI;
export const TOUCH_PLANE_BUDGET_PX = 8 * MEBI;
export const MIN_PLANE_BUDGET_PX = 4 * MEBI;
export const MAX_PLANE_BUDGET_PX = 64 * MEBI;

export const CANVAS_PROBE_AREAS_PX = [256 * MEBI, 64 * MEBI, 32 * MEBI, 16 * MEBI, 8 * MEBI, 4 * MEBI] as const;
