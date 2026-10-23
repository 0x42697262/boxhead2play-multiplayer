import type { DecalRequested } from '../../../domain/events.ts';
import type { Room } from '../../assets/schemas.ts';
import type { ClipBuffers } from '../clips/ClipBuffers.ts';
import { IDENTITY, translation } from '../geometry/Matrix.ts';
import { cssColor, resetContext, type Surface } from '../surface.ts';
import type { SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import { pixelSnap } from './projection.ts';

export const FLOOR_FILL_COLOR = 0xff0000;
export const DECAL_MASK_FILL_COLOR = 0x000000;

export interface RoomPlanes {
  readonly floor: Surface;
  readonly decalMask: Surface;
  readonly cover: Surface;
}

export function roomBitmapSize(room: Room): { readonly width: number; readonly height: number } {
  return { width: Math.trunc(room.size.width), height: Math.trunc(room.size.height) };
}

export function buildRoomPlanes(room: Room, renderer: SymbolRenderer): RoomPlanes {
  const { width, height } = roomBitmapSize(room);
  const hidden = new Set(room.hiddenCharacterIds);
  const floor = renderer.createSurface(width, height);
  const pieces = renderer.createSurface(width, height);
  const cover = renderer.createSurface(width, height);
  floor.ctx.fillStyle = cssColor(FLOOR_FILL_COLOR);
  floor.ctx.fillRect(0, 0, width, height);
  renderer.drawItems(floor.ctx, room.background, IDENTITY, { hidden });
  for (const piece of room.pieces) {
    const matrix = translation(piece.position.x, piece.position.y);
    renderer.draw(floor.ctx, piece.characterId, 0, matrix, { hidden });
    renderer.draw(pieces.ctx, piece.characterId, 0, matrix, { hidden });
    if (piece.coverCharacterId !== null && piece.coverPosition !== null) {
      renderer.draw(cover.ctx, piece.coverCharacterId, 0, translation(piece.coverPosition.x, piece.coverPosition.y), { hidden });
    }
  }
  const decalMask = renderer.createSurface(width, height);
  decalMask.ctx.fillStyle = cssColor(DECAL_MASK_FILL_COLOR);
  decalMask.ctx.fillRect(0, 0, width, height);
  decalMask.ctx.globalCompositeOperation = 'destination-out';
  decalMask.ctx.drawImage(pieces.canvas, 0, 0);
  resetContext(decalMask.ctx);
  return { floor, decalMask, cover };
}

export function stampDecal(planes: RoomPlanes, clips: ClipBuffers, renderer: SymbolRenderer, decal: DecalRequested): void {
  const bitmap = clips.directionalFrame(decal.symbol, decal.rotationCount, decal.rotationIndex, decal.frame, { x: decal.scaleX, y: decal.scaleY });
  if (!bitmap) return;
  const x = pixelSnap(decal.xPx + bitmap.dispX);
  const y = pixelSnap(decal.yPx + bitmap.dispY);
  const stamp = renderer.createSurface(bitmap.surface.width, bitmap.surface.height);
  stamp.ctx.drawImage(bitmap.surface.canvas, 0, 0);
  stamp.ctx.globalCompositeOperation = 'destination-in';
  stamp.ctx.drawImage(planes.decalMask.canvas, -x, -y);
  planes.floor.ctx.drawImage(stamp.canvas, x, y);
}
