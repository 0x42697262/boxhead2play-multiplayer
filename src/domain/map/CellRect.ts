export class CellRect {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {}

  static around(x: number, y: number, radius: number): CellRect {
    return new CellRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  get left(): number {
    return this.x;
  }

  get top(): number {
    return this.y;
  }

  get right(): number {
    return this.x + this.width;
  }

  get bottom(): number {
    return this.y + this.height;
  }
}

export interface CellBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface CellId {
  readonly x: number;
  readonly y: number;
}
