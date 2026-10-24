export const Glyph = {
  Pause: ['M8 5v14', 'M16 5v14'],
  Close: ['M6 6l12 12', 'M18 6L6 18'],
  List: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  Fire: ['M19 12a7 7 0 1 1-14 0a7 7 0 1 1 14 0', 'M12 2v5', 'M12 17v5', 'M2 12h5', 'M17 12h5'],
  Previous: ['M15 5l-7 7 7 7'],
  Next: ['M9 5l7 7-7 7'],
} as const;

export type Glyph = (typeof Glyph)[keyof typeof Glyph];

export const GLYPH_VIEW_BOX = '0 0 24 24';
