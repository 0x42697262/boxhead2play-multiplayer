import type { GlyphPlacement } from '../../../adapters/assets/schemas.ts';
import type { Rect } from '../../../adapters/render/geometry/Rect.ts';

export interface WordCut {
  readonly clip: Rect;
  readonly offsetX: number;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

const WHITESPACE = /\s/;

function glyphEnd(glyph: GlyphPlacement): number {
  return glyph.x + glyph.advance;
}

function wordRuns(glyphs: readonly GlyphPlacement[]): GlyphPlacement[][] {
  const runs: GlyphPlacement[][] = [];
  let run: GlyphPlacement[] = [];
  for (const glyph of glyphs) {
    if (WHITESPACE.test(glyph.char)) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push(glyph);
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

function span(run: readonly GlyphPlacement[]): Span | undefined {
  const first = run[0];
  const last = run[run.length - 1];
  return first && last ? { start: first.x, end: glyphEnd(last) } : undefined;
}

function center(value: Span): number {
  return (value.start + value.end) / 2;
}

export function wordCut(glyphs: readonly GlyphPlacement[], bounds: Rect, wordIndex: number): WordCut | undefined {
  const runs = wordRuns(glyphs);
  const word = runs[wordIndex];
  const wordSpan = word ? span(word) : undefined;
  const label = span(runs.flat());
  if (!wordSpan || !label) return undefined;
  const previous = runs[wordIndex - 1];
  const next = runs[wordIndex + 1];
  const previousEnd = previous ? span(previous)?.end : undefined;
  const nextStart = next ? span(next)?.start : undefined;
  return {
    clip: { xMin: previousEnd ?? bounds.xMin, yMin: bounds.yMin, xMax: nextStart ?? bounds.xMax, yMax: bounds.yMax },
    offsetX: center(label) - center(wordSpan),
  };
}
