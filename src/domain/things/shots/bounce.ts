import { SoundId } from '../../sounds.ts';
import type { Shot } from './Shot.ts';
import { GRENADE } from './tuning.ts';

export function bounceStep(shot: Shot): void {
  let bounced = false;
  const delta = shot.delta;
  delta.z -= GRENADE.gravity;
  if (shot.position.z + delta.z < 0) {
    delta.z = Math.abs(delta.z);
    if (delta.z <= GRENADE.restSpeed) delta.z = 0;
    delta.scale(GRENADE.floorBounce);
    shot.position.z = 0;
    bounced = true;
  }
  if (shot.world.map.collide.bounceCollide(shot)) {
    bounced = true;
    delta.scale2D(GRENADE.wallBounce);
  }
  if (bounced && delta.length > GRENADE.bounceSoundSpeed) shot.playSound(SoundId.GrenadeBounce);
  shot.move(shot.position.add(delta));
}
