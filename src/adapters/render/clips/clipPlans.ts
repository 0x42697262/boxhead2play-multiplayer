import { CONTENTS_CHILD } from '../../assets/mapping.ts';
import { concat, IDENTITY, flashScale, rotation, transformPoint, withRotationDegrees, type Matrix } from '../geometry/Matrix.ts';
import type { Overrides, SymbolLibrary } from '../symbols/SymbolLibrary.ts';
import { CLIP_BUFFER_INFLATE_PX, FULL_TURN_DEGREES, FULL_TURN_RADIANS, OMNI_FRONT_SCALE_Y, OMNI_SKEW_Y_DIVISOR, QUARTER_TURN_RADIANS } from '../tuning.ts';
import { bufferLayout, type BufferLayout } from './bufferLayout.ts';

export const TOP_CHILD = '_Top';
export const FRONT_CHILD = '_Front';

export interface BufferPlan {
  readonly characterId: number;
  readonly frame: number;
  readonly overrides?: Overrides;
  readonly layout: BufferLayout;
}

export interface BufferScale {
  readonly x: number;
  readonly y: number;
}

export const UNIT_BUFFER_SCALE: BufferScale = { x: 1, y: 1 };

function plan(library: SymbolLibrary, characterId: number, frame: number, overrides: Overrides | undefined, scale: BufferScale): BufferPlan {
  const bounds = library.localBounds(characterId, frame, overrides);
  const layout = bufferLayout(bounds, scale.x, scale.y, CLIP_BUFFER_INFLATE_PX);
  return overrides ? { characterId, frame, overrides, layout } : { characterId, frame, layout };
}

function contentsFrameCount(library: SymbolLibrary, characterId: number): { readonly contentsId: number; readonly frames: number } | undefined {
  const contents = library.findChild(characterId, CONTENTS_CHILD);
  const sprite = contents ? library.sprite(contents.characterId) : undefined;
  return contents && sprite ? { contentsId: contents.characterId, frames: sprite.frameCount } : undefined;
}

export function planStatic(library: SymbolLibrary, characterId: number): BufferPlan {
  return plan(library, characterId, 0, undefined, UNIT_BUFFER_SCALE);
}

export function planAnimationFrame(library: SymbolLibrary, characterId: number, frame: number): BufferPlan {
  const contents = contentsFrameCount(library, characterId);
  if (contents) return plan(library, characterId, 0, { [CONTENTS_CHILD]: { frame } }, UNIT_BUFFER_SCALE);
  return plan(library, characterId, frame, undefined, UNIT_BUFFER_SCALE);
}

export function animationFrameCount(library: SymbolLibrary, characterId: number): number {
  return contentsFrameCount(library, characterId)?.frames ?? library.sprite(characterId)?.frameCount ?? 1;
}

export function directionalRotationDegrees(direction: number, directions: number): number {
  return (direction * FULL_TURN_DEGREES) / directions;
}

export function planDirectionalFrame(
  library: SymbolLibrary,
  characterId: number,
  directions: number,
  direction: number,
  frame: number,
  scale: BufferScale,
): BufferPlan {
  const contents = library.findChild(characterId, CONTENTS_CHILD);
  if (!contents) return plan(library, characterId, frame, undefined, scale);
  const matrix = withRotationDegrees(contents.matrix, directionalRotationDegrees(direction, directions));
  return plan(library, characterId, 0, { [CONTENTS_CHILD]: { frame, matrix } }, scale);
}

export function omniAngles(directions: number): number[] {
  const angles: number[] = [];
  for (let angle = 0; angle < FULL_TURN_RADIANS; angle += FULL_TURN_RADIANS / directions) angles.push(angle);
  return angles;
}

export interface OmniMatrices {
  readonly top: Matrix;
  readonly front: Matrix;
}

export function omniMatrices(angle: number): OmniMatrices {
  const turn = rotation(angle);
  const across = transformPoint(turn, 1, 0);
  const down = transformPoint(turn, 0, 1);
  const acrossY = across.y / OMNI_SKEW_Y_DIVISOR;
  const downY = down.y / OMNI_SKEW_Y_DIVISOR;
  const skew: Matrix = [1, acrossY / across.x, down.x / downY, 1, 0, 0];
  const top = concat(flashScale(IDENTITY, across.x, downY), skew);
  const frontAngle = angle + QUARTER_TURN_RADIANS;
  const front = flashScale([Math.cos(frontAngle), Math.sin(frontAngle), 0, 1, 0, 0], 1, OMNI_FRONT_SCALE_Y);
  return { top, front };
}

export function planOmni(library: SymbolLibrary, characterId: number, angle: number): BufferPlan {
  const { top, front } = omniMatrices(angle);
  const overrides: Overrides = { [TOP_CHILD]: { matrix: top }, [FRONT_CHILD]: { matrix: front } };
  return plan(library, characterId, 0, overrides, UNIT_BUFFER_SCALE);
}
