export const DEGREES_PER_HALF_TURN = 180;
export const FULL_TURN_DEGREES = 360;
export const FULL_TURN_RADIANS = Math.PI * 2;
export const QUARTER_TURN_RADIANS = Math.PI / 2;
export const ANGLE_STEPS = 256;
export const ANGLE_STEP_MASK = 0xff;

export const CHANNEL_MAX = 255;
export const RGBA_STRIDE = 4;
export const ALPHA_PERCENT = 100;
export const RED_SHIFT = 16;
export const GREEN_SHIFT = 8;
export const BYTE_MASK = 0xff;

export const CLIP_BUFFER_INFLATE_PX = 8;
export const XSI_BUFFER_INFLATE_PX = 2;
export const HUD_BUFFER_INFLATE_PX = 0;

export const OMNI_SKEW_Y_DIVISOR = 2;
export const OMNI_FRONT_SCALE_Y = 0.5;

export const XSI_SHADER_CONTRAST = 0.5;
export const XSI_SHADE_LIGHT = 0xffffff;
export const XSI_SHADE_DARK = 0x000000;
export const XSI_PROFILE_EDGE_MATERIAL = 'PEdge';
export const XSI_SHADOW_MATERIAL = 'Shadow';
export const XSI_DEFAULT_ANIMATION_SET = 'Player_Handgun_Walk';

export const XSI_SHADOW_FILTER = { blurX: 4, blurY: 4, strength: 0.25, passes: 1, color: 0x000000 } as const;
export const XSI_OUTLINE_GLOW = { blurX: 4, blurY: 4, strength: 2, passes: 1, color: 0x000000 } as const;

export const MAX_FILTER_STRENGTH = 255;
export const SURFACE_MIN_SIZE = 1;

export const HUD_CACHE_LIMIT = 256;

export const STAGE_LAYER_PADDING_PX = 16;
export const STAGE_LAYER_CACHE_LIMIT = 160;
export const STAGE_BACKGROUND = '#000';
