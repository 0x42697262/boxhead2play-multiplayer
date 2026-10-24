export const Glyph = {
  Pause: ['M8 5v14', 'M16 5v14'],
  Close: ['M6 6l12 12', 'M18 6L6 18'],
  List: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  Fire: ['M19 12a7 7 0 1 1-14 0a7 7 0 1 1 14 0', 'M12 2v5', 'M12 17v5', 'M2 12h5', 'M17 12h5'],
  Players: ['M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20', 'M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0', 'M22 20v-1.5a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  Previous: ['M15 5l-7 7 7 7'],
  Next: ['M9 5l7 7-7 7'],
} as const;

export type Glyph = (typeof Glyph)[keyof typeof Glyph];

export const GLYPH_VIEW_BOX = '0 0 24 24';
