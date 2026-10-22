export class Position {
  constructor(
    public x: number,
    public y: number,
    public z = 0,
  ) {}

  static zero(): Position {
    return new Position(0, 0, 0);
  }

  clone(): Position {
    return new Position(this.x, this.y, this.z);
  }

  set(p: Position): this {
    this.x = p.x;
    this.y = p.y;
    this.z = p.z;
    return this;
  }

  setXYZ(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  clear(): this {
    return this.setXYZ(0, 0, 0);
  }

  get cellX(): number {
    return Math.trunc(this.x);
  }

  get cellY(): number {
    return Math.trunc(this.y);
  }

  cellCentre(): Position {
    return new Position(Math.floor(this.x) + CELL_CENTRE_OFFSET, Math.floor(this.y) + CELL_CENTRE_OFFSET, this.z);
  }

  snapToCellCentre(): this {
    this.x = Math.floor(this.x) + CELL_CENTRE_OFFSET;
    this.y = Math.floor(this.y) + CELL_CENTRE_OFFSET;
    return this;
  }

  round(): this {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    return this;
  }

  floor(): this {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    return this;
  }

  add(p: Position): Position {
    return new Position(this.x + p.x, this.y + p.y, this.z + p.z);
  }

  subtract(p: Position): Position {
    return new Position(this.x - p.x, this.y - p.y, this.z - p.z);
  }

  addInPlace(p: Position): this {
    this.x += p.x;
    this.y += p.y;
    this.z += p.z;
    return this;
  }

  equals(p: Position): boolean {
    return this.x === p.x && this.y === p.y && this.z === p.z;
  }

  isZero(): boolean {
    return this.x === 0 && this.y === 0 && this.z === 0;
  }

  scale(factor: number): this {
    this.x *= factor;
    this.y *= factor;
    this.z *= factor;
    return this;
  }

  scale2D(factor: number): this {
    this.x *= factor;
    this.y *= factor;
    return this;
  }

  invert(): this {
    return this.scale(-1);
  }

  get length(): number {
    return Math.sqrt(this.lengthSquared);
  }

  get lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  get length2D(): number {
    return Math.sqrt(this.length2DSquared);
  }

  get length2DSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  distance(p: Position): number {
    return Math.sqrt(this.distanceSquared(p));
  }

  distanceSquared(p: Position): number {
    const dx = this.x - p.x;
    const dy = this.y - p.y;
    const dz = this.z - p.z;
    return dx * dx + dy * dy + dz * dz;
  }

  distance2D(p: Position): number {
    return Math.sqrt(this.distance2DSquared(p));
  }

  distance2DSquared(p: Position): number {
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    return dx * dx + dy * dy;
  }

  normalize(length: number): this {
    return this.scale(this.isZero() ? 1 : length / this.length);
  }

  normalize2D(length: number): this {
    const isFlatZero = this.x === 0 && this.y === 0;
    return this.scale2D(isFlatZero ? 1 : length / this.length2D);
  }

  angleTo(p: Position): number {
    const angle = Math.atan2(p.y - this.y, p.x - this.x);
    return angle >= 0 ? angle : angle + FULL_TURN;
  }

  headingZ(): number {
    return Math.atan2(this.y, this.x);
  }

  dot(p: Position): number {
    return this.x * p.x + this.y * p.y + this.z * p.z;
  }

  cross(p: Position): Position {
    return new Position(this.y * p.z - this.z * p.y, this.z * p.x - this.x * p.z, this.x * p.y - this.y * p.x);
  }

  rotateZ(radians: number): this {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = this.x * cos - this.y * sin;
    this.y = this.y * cos + this.x * sin;
    this.x = x;
    return this;
  }

  toString(): string {
    return `(${this.x}, ${this.y}, ${this.z})`;
  }
}

export const CELL_CENTRE_OFFSET = 0.5;
export const FULL_TURN = Math.PI * 2;
