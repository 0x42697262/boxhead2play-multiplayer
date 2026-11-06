import { describe, expect, it } from 'vitest';
import { Angle } from '../../../src/domain/math/Angle.ts';
import { Position } from '../../../src/domain/math/Position.ts';
import { SeededRng } from '../../../src/domain/math/Rng.ts';
import type { Player } from '../../../src/domain/things/creatures/Player.ts';
import { createThingFactory } from '../../../src/domain/things/factory.ts';
import { Explosion } from '../../../src/domain/things/effects/Explosion.ts';
import { Barrel } from '../../../src/domain/things/objects/Barrel.ts';
import { ChargePack } from '../../../src/domain/things/objects/ChargePack.ts';
import { ExplosivePhase, Mine } from '../../../src/domain/things/objects/Mine.ts';
import { Bullet } from '../../../src/domain/things/shots/Bullet.ts';
import { ClusterShell } from '../../../src/domain/things/shots/ClusterShell.ts';
import { GrenadeShot } from '../../../src/domain/things/shots/GrenadeShot.ts';
import { Laser } from '../../../src/domain/things/shots/Laser.ts';
import { RocketShot } from '../../../src/domain/things/shots/Missile.ts';
import { RailgunShot } from '../../../src/domain/things/shots/PiercingShot.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { MINE } from '../../../src/domain/things/objects/tuning.ts';
import { GRENADE } from '../../../src/domain/things/shots/tuning.ts';
import { PISTOL } from '../../../src/domain/things/weapons/tuning.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { createSimulationSettings, DEFAULT_GAME_OPTIONS, Difficulty, PlayerCharacter } from '../../../src/domain/world/SimulationSettings.ts';
import { Team } from '../../../src/domain/world/TeamBattle.ts';
import { World } from '../../../src/domain/world/World.ts';
import { assetAnimationCatalog } from '../support/animationCatalog.ts';
import { playerOf, run, runUntil } from '../support/realWorld.ts';
import { assetRoom } from '../support/rooms.ts';

const definition = assetRoom('ROOM_Single_0001');
const animations = assetAnimationCatalog();
const ACTORS = ['Ann', 'Bob', 'Chris'] as const;
const DAMAGE = PISTOL.damage;
const RANGE = 8;

function battle(zombiesActive = false, devilsActive = false): World {
  if (!definition || !animations) throw new Error('Extract the game assets before running Team Battle verification');
  const world = World.create(definition, createSimulationSettings({
    ...DEFAULT_GAME_OPTIONS,
    gameMode: GameMode.TeamBattle,
    zombiesActive,
    devilsActive,
    difficulty: Difficulty.Intermediate,
    playerCharacters: ACTORS.map(() => PlayerCharacter.Bambo),
  }), { rng: new SeededRng(7), animations, factory: createThingFactory() });
  ACTORS.forEach((actorId, index) => {
    world.assignCombatant(index, { actorId, team: index === ACTORS.length - 1 ? Team.B : Team.A });
    const player = playerOf(world, index);
    player.invincible = 0;
    player.move(new Position(4.5 + index * 2, 8.5));
  });
  run(world, 1);
  return world;
}

function unchanged(player: Player, position: Position): void {
  expect(player.life).toBe(player.maxLife);
  expect(player.position).toEqual(position);
  expect(player.delta.length).toBe(0);
}

describe.skipIf(!definition || !animations)('approved Team Battle plan: actual room, characters and weapons', () => {
  it.each([{ name: 'bullet', Shot: Bullet }, { name: 'piercing shot', Shot: RailgunShot }, { name: 'laser', Shot: Laser }])('$name passes through an ally and damages the opposing player without allied knockback', ({ Shot }) => {
    const world = battle();
    const owner = playerOf(world);
    const ally = playerOf(world, 1);
    const enemy = playerOf(world, 2);
    const position = ally.position.clone();
    world.things.add(new Shot(world, owner.position.clone(), new Angle(0), owner, DAMAGE, RANGE));
    run(world, 2);
    unchanged(ally, position);
    expect(enemy.life).toBeLessThan(enemy.maxLife);
  });

  it.each([{ name: 'rocket', Shot: RocketShot }, { name: 'fragment', Shot: ClusterShell }])('$name preserves the source through its actual detonation', ({ Shot }) => {
    const world = battle();
    const owner = playerOf(world);
    const ally = playerOf(world, 1);
    const enemy = playerOf(world, 2);
    ally.move(new Position(enemy.position.x, enemy.position.y + 1));
    run(world, 1);
    const position = ally.position.clone();
    const shot = new Shot(world, new Position(enemy.position.x - 1, enemy.position.y), new Angle(0), owner, DAMAGE);
    world.things.add(shot);
    runUntil(world, () => enemy.life < enemy.maxLife, world.ticksPerSecond * 4);
    unchanged(ally, position);
    expect(enemy.life).toBeLessThan(enemy.maxLife);
  });

  it('a thrown grenade retains its team through flight and the actual fuse', () => {
    const world = battle();
    const owner = playerOf(world);
    const ally = playerOf(world, 1);
    const enemy = playerOf(world, 2);
    const grenade = world.things.add(new GrenadeShot(world, owner.position.add(new Position(1, 0)), new Angle(0), owner, DAMAGE, GRENADE.minPower));
    runUntil(world, () => grenade.life === 1, GRENADE.lifeTicks);
    owner.move(new Position(4.5, 11.5));
    const landing = grenade.position.clone();
    landing.z = 0;
    enemy.move(landing.add(new Position(0, 0.5)));
    ally.move(landing.add(new Position(0, -0.5)));
    const position = ally.position.clone();
    run(world, 3);
    unchanged(ally, position);
    expect(enemy.life).toBeLessThan(enemy.maxLife);
  });

  it('an allied mine remains armed under an ally, then detonates for an opposing player', () => {
    const world = battle();
    const owner = playerOf(world);
    const ally = playerOf(world, 1);
    const enemy = playerOf(world, 2);
    const mine = world.things.add(new Mine(world, ally.position.clone(), new Angle(0), owner));
    run(world, 2);
    expect(mine.phase).toBe(ExplosivePhase.Armed);
    const position = ally.position.clone();
    run(world, world.ticksPerSecond);
    unchanged(ally, position);
    ally.move(mine.position.add(new Position(0, 1)));
    const protectedPosition = ally.position.clone();
    enemy.move(mine.position.clone());
    runUntil(world, () => enemy.life < enemy.maxLife, world.ticksPerSecond * (MINE.detonateSeconds + 1));
    unchanged(ally, protectedPosition);
    expect(enemy.life).toBeLessThan(enemy.maxLife);
  });

  it('a charge pack protects the planter team during its actual detonation', () => {
    const world = battle();
    const owner = playerOf(world);
    const ally = playerOf(world, 1);
    const enemy = playerOf(world, 2);
    ally.move(new Position(enemy.position.x, enemy.position.y + 1));
    run(world, 1);
    const position = ally.position.clone();
    const pack = world.things.add(new ChargePack(world, enemy.position.clone(), new Angle(0), owner));
    pack.detonateRequested = true;
    runUntil(world, () => enemy.life < enemy.maxLife, world.ticksPerSecond * 2);
    unchanged(ally, position);
    expect(enemy.life).toBeLessThan(enemy.maxLife);
  });

  it('map barrels, chained barrels and their fragments inherit the triggering attacker, not a barrel planter', () => {
    const world = battle();
    const owner = playerOf(world);
    const ally = playerOf(world, 1);
    const enemy = playerOf(world, 2);
    ally.move(new Position(6.5, 9.5));
    const first = world.things.add(new Barrel(world, new Position(6.5, 8.5)));
    const second = world.things.add(new Barrel(world, new Position(7.5, 8.5), new Angle(0), enemy));
    run(world, 2);
    const position = ally.position.clone();
    world.things.add(new Bullet(world, owner.position.clone(), new Angle(0), owner, DAMAGE, RANGE));
    const explosions = new Set<string>();
    for (let tick = 0; tick < world.ticksPerSecond; tick++) {
      run(world, 1);
      for (const fragment of world.things.filter((thing) => thing.classId === ThingClass.EffectExplosion)) {
        expect(fragment.attackSource?.actorId).toBe(ACTORS[0]);
        explosions.add(fragment.key);
      }
    }
    unchanged(ally, position);
    expect(explosions.size).toBeGreaterThan([first, second].length);
    expect(first.isProcessing).toBe(false);
    expect(second.isProcessing).toBe(false);
    expect(enemy.life).toBeLessThan(enemy.maxLife);

  });

  it('delayed kills keep their team point after departure and do not give a reused slot individual credit', () => {
    const world = battle();
    const owner = playerOf(world);
    const enemy = playerOf(world, 2);
    const explosion = new Explosion(world, enemy.position.clone(), new Angle(0), owner, enemy.maxLife);
    world.leavePlayer(owner.playerIndex);
    expect(world.joinPlayer(owner.playerIndex, PlayerCharacter.Swat, { actorId: 'Replacement', team: Team.B })).toBe(true);
    world.things.add(explosion);
    runUntil(world, () => enemy.deathLogged, world.ticksPerSecond * 2);
    expect(enemy.deathLogged).toBe(true);
    expect(world.teamBattle?.scores).toEqual({ a: 1, b: 0 });
    expect(world.hud.fragsOf(owner.playerIndex)).toBe(0);
    world.logKill(enemy);
    expect(world.teamBattle?.scores).toEqual({ a: 1, b: 0 });
    world.leavePlayer(enemy.playerIndex);
    expect(world.teamBattle?.scores).toEqual({ a: 1, b: 0 });
  });

  it('self explosions still hurt, but self, creature and unowned deaths never award team points', () => {
    const world = battle();
    const owner = playerOf(world);
    world.things.add(new Explosion(world, owner.position.clone(), new Angle(0), owner, owner.maxLife));
    runUntil(world, () => owner.deathLogged, world.ticksPerSecond * 2);
    expect(owner.deathLogged).toBe(true);
    expect(world.teamBattle?.scores).toEqual({ a: 0, b: 0 });
    const enemy = playerOf(world, 2);
    world.things.add(new Explosion(world, enemy.position.clone(), new Angle(0), undefined, enemy.maxLife));
    runUntil(world, () => enemy.deathLogged, world.ticksPerSecond * 2);
    expect(enemy.deathLogged).toBe(true);
    expect(world.teamBattle?.scores).toEqual({ a: 0, b: 0 });
    world.playerDead();
    expect(world.completion).toBeUndefined();
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])('enemy switches zombies=%s devils=%s omit disabled quotas without changing deathmatch equipment', (zombies, devils) => {
    const world = battle(zombies, devils);
    const weapons = [...world.upgrades.unlockedWeapons];
    run(world, world.ticksPerSecond * 8);
    expect(world.things.count(ThingClass.Zombie) > 0).toBe(zombies);
    expect(world.things.count(ThingClass.Devil) > 0).toBe(devils);
    if (!zombies) expect(world.upgrades.level.zombieTotalCount).toBe(0);
    if (!devils) expect(world.upgrades.level.devilTotalCount).toBe(0);
    expect(world.upgrades.unlockedWeapons).toEqual(weapons);
    expect(world.teamBattle?.scores).toEqual({ a: 0, b: 0 });
    expect(world.completion).toBeUndefined();
  });
});
