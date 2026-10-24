export const GraphicsQuality = {
  Sharp: 'sharp',
  Smooth: 'smooth',
  Pixelated: 'pixelated',
} as const;

export type GraphicsQuality = (typeof GraphicsQuality)[keyof typeof GraphicsQuality];

export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = GraphicsQuality.Sharp;
