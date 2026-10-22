import { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';

export class WallMovable extends Thing {
  readonly classId = ThingClass.WallMovable;

  process(): void {
    return;
  }
}

export class LaserNode extends Thing {
  readonly classId = ThingClass.LaserNode;

  process(): void {
    return;
  }
}
