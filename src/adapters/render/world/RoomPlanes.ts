import type { DecalRequested } from '../../../domain/events.ts';
import type { Room } from '../../assets/schemas.ts';
import type { ClipBuffers } from '../clips/ClipBuffers.ts';
import { multiply, scaling, translation, type Matrix } from '../geometry/Matrix.ts';
import { cssColor, releaseSurface, resetContext, type Surface } from '../surface.ts';
import type { DrawOptions, SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import { pixelSnap } from './projection.ts';

export const FLOOR_FILL_COLOR = 0xff0000;
export const DECAL_MASK_FILL_COLOR = 0x000000;

export interface RoomPlanes {
  readonly floor: Surface;
  readonly decalMask: Surface;
  readonly cover: Surface;
  readonly resolution: number;
}

export function roomBitmapSize(room: Room): { readonly width: number; readonly height: number } {
  return { width: Math.trunc(room.size.width), height: Math.trunc(room.size.height) };
}

function filled(renderer: SymbolRenderer, width: number, height: number, color: number): Surface {
  const surface = renderer.createSurface(width, height);
  surface.ctx.fillStyle = cssColor(color);
  surface.ctx.fillRect(0, 0, width, height);
  return surface;
}

function maskOutside(renderer: SymbolRenderer, pieces: Surface): Surface {
  const mask = filled(renderer, pieces.width, pieces.height, DECAL_MASK_FILL_COLOR);
  mask.ctx.globalCompositeOperation = 'destination-out';
  mask.ctx.drawImage(pieces.canvas, 0, 0);
  resetContext(mask.ctx);
  return mask;
}

export function buildRoomPlanes(room: Room, renderer: SymbolRenderer, resolution = 1): RoomPlanes {
  const size = roomBitmapSize(room);
  const width = size.width * resolution;
  const height = size.height * resolution;
  const toDevice = scaling(resolution, resolution);
  const at = (position: { readonly x: number; readonly y: number }): Matrix => multiply(toDevice, translation(position.x, position.y));
  const options: DrawOptions = { hidden: new Set(room.hiddenCharacterIds), resolution };
  const floor = filled(renderer, width, height, FLOOR_FILL_COLOR);
  renderer.drawItems(floor.ctx, room.background, toDevice, options);
  const pieces = renderer.createSurface(width, height);
  for (const piece of room.pieces) {
    renderer.draw(floor.ctx, piece.characterId, 0, at(piece.position), options);
    renderer.draw(pieces.ctx, piece.characterId, 0, at(piece.position), options);
  }
  const decalMask = maskOutside(renderer, pieces);
  releaseSurface(pieces);
  const cover = renderer.createSurface(width, height);
  for (const piece of room.pieces) {
    if (piece.coverCharacterId !== null && piece.coverPosition !== null) renderer.draw(cover.ctx, piece.coverCharacterId, 0, at(piece.coverPosition), options);
  }
  return { floor, decalMask, cover, resolution };
}

export function releaseRoomPlanes(planes: RoomPlanes): void {
  for (const surface of [planes.floor, planes.decalMask, planes.cover]) releaseSurface(surface);
}

export class DecalStamper {
  private scratch: Surface | undefined = undefined;

  constructor(private readonly renderer: SymbolRenderer) {}

  stamp(planes: RoomPlanes, clips: ClipBuffers, decal: DecalRequested): void {
    const bitmap = clips.directionalFrame(decal.symbol, decal.rotationCount, decal.rotationIndex, decal.frame, { x: decal.scaleX, y: decal.scaleY });
    if (!bitmap) return;
    const scale = planes.resolution / clips.resolution;
    const x = pixelSnap(decal.xPx * planes.resolution + bitmap.dispX * scale);
    const y = pixelSnap(decal.yPx * planes.resolution + bitmap.dispY * scale);
    const source = bitmap.surface;
    const scaledWidth = source.width * scale;
    const scaledHeight = source.height * scale;
    const width = Math.ceil(scaledWidth);
    const height = Math.ceil(scaledHeight);
    const stamp = this.scratchFor(width, height);
    const ctx = stamp.ctx;
    resetContext(ctx);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source.canvas, 0, 0, scaledWidth, scaledHeight);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(planes.decalMask.canvas, -x, -y);
    resetContext(ctx);
    planes.floor.ctx.drawImage(stamp.canvas, 0, 0, width, height, x, y, width, height);
  }

  private scratchFor(width: number, height: number): Surface {
    const current = this.scratch;
    if (current && current.width >= width && current.height >= height) return current;
    const grown = this.renderer.createSurface(Math.max(width, current?.width ?? 0), Math.max(height, current?.height ?? 0));
    this.scratch = grown;
    return grown;
  }
}
