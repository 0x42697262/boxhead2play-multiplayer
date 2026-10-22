import { sign } from '../math/scalar.ts';

export const LineTest = {
  ThingsAndWalls: 'thingsAndWalls',
  WallsOnly: 'wallsOnly',
} as const;

export type LineTest = (typeof LineTest)[keyof typeof LineTest];

export class LineProbe {
  readonly dx: number;
  readonly dy: number;
  readonly xGradient: number;
  readonly yGradient: number;
  readonly xDirection: number;
  readonly yDirection: number;

  constructor(
    readonly x1: number,
    readonly y1: number,
    readonly x2: number,
    readonly y2: number,
    readonly ownerId: number,
    readonly affectFlags: number,
    readonly test: LineTest,
  ) {
    this.dx = x2 - x1;
    this.dy = y2 - y1;
    this.xGradient = this.dy / this.dx;
    this.yGradient = this.dx / this.dy;
    this.xDirection = sign(this.dx);
    this.yDirection = sign(this.dy);
  }

  distanceToLineSquared(px: number, py: number): number {
    const t = (this.dx * (px - this.x1) + this.dy * (py - this.y1)) / (this.dx * this.dx + this.dy * this.dy);
    const ox = px - (this.x1 + this.dx * t);
    const oy = py - (this.y1 + this.dy * t);
    return ox * ox + oy * oy;
  }

  distanceFromStartSquared(px: number, py: number): number {
    const ox = px - this.x1;
    const oy = py - this.y1;
    return ox * ox + oy * oy;
  }
}
