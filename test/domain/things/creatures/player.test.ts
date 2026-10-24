import { describe, expect, it } from 'vitest';
import { DomainEventType, MessageTone } from '../../../../src/domain/events.ts';
import { killMessage } from '../../../../src/domain/hud/killMessage.ts';
import { ExplosionAffect } from '../../../../src/domain/things/affects/ExplosionAffect.ts';
import { Zombie } from '../../../../src/domain/things/creatures/Zombie.ts';
import { FireBall } from '../../../../src/domain/things/shots/FireBall.ts';
import { CollideFlag } from '../../../../src/domain/map/CollideFlag.ts';
import { BulletAffect } from '../../../../src/domain/things/affects/BulletAffect.ts';
import { ZombieAttackAffect } from '../../../../src/domain/things/affects/ZombieAttackAffect.ts';
import { CreatureState } from '../../../../src/domain/things/creatures/CreatureState.ts';
import type { Player } from '../../../../src/domain/things/creatures/Player.ts';
import { ThingClass } from '../../../../src/domain/things/ThingClass.ts';
import { VisualKind } from '../../../../src/domain/visuals.ts';
import { WeaponName } from '../../../../src/domain/weapons/WeaponName.ts';
import { CompletionState } from '../../../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../../../src/domain/world/GameMode.ts';
import { PlayerControl } from '../../../../src/domain/world/input.ts';
import { InitKind } from '../../../../src/domain/world/RoomDefinition.ts';
import { Difficulty } from '../../../../src/domain/world/SimulationSettings.ts';
import type { World } from '../../../../src/domain/world/World.ts';
import { cellObject, room, solid } from '../../support/fakes.ts';
import { held, tickInput } from '../../support/input.ts';
import { makeRealWorld, ofClass, playerOf, run } from '../../support/realWorld.ts';

const arena = (...extra: Parameters<typeof room>[2] & object) =>
  room(14, 10, [cellObject(InitKind.Player1, 3, 3), cellObject(InitKind.Player2, 9, 6, 1, 180), ...extra]);

function kill(world: World, player: Player): void {
  run(world, 15, tickInput(held(PlayerControl.Down), held(PlayerControl.Down)));
  player.invincible = 0;
  player.affect(new ZombieAttackAffect(player, 1000));
}

describe('Player control', () => {
  it('walks 0.16 cells per tick in the held direction and faces it', () => {
    const world = makeRealWorld(arena());
    const player = playerOf(world);
    expect(player.position.x).toBe(3.5);
    run(world, 5, tickInput(held(PlayerControl.Right)));
    expect(player.position.x).toBeCloseTo(3.5 + 5 * 0.16);
    expect(player.angle.radians).toBeCloseTo(0);
    run(world, 1, tickInput(held(PlayerControl.Down, PlayerControl.Left)));
    expect(player.angle.radians).toBeCloseTo((3 * Math.PI) / 4);
  });

  it('walks diagonally at the same 0.16 cells per tick as straight', () => {
    const world = makeRealWorld(arena());
    const player = playerOf(world);
    const start = player.position.clone();
    run(world, 5, tickInput(held(PlayerControl.Down, PlayerControl.Right)));
    expect(player.position.distance2D(start)).toBeCloseTo(5 * 0.16);
    expect(player.position.x - start.x).toBeCloseTo(player.position.y - start.y);
  });

  it('stops at static walls using 85% of its radius', () => {
    const world = makeRealWorld(room(14, 10, [solid(7, 0, 1, 10), cellObject(InitKind.Player1, 3, 3, 1)]));
    const player = playerOf(world);
    run(world, 100, tickInput(held(PlayerControl.Right)));
    expect(player.position.x).toBeLessThanOrEqual(7 - 0.45 * 0.85 + 1e-9);
    expect(player.position.x).toBeGreaterThan(6);
  });

  it('marks its cell for zombies, regenerates life and blinks while invincible', () => {
    const world = makeRealWorld(arena());
    const player = playerOf(world);
    expect(world.map.cell(3, 3).collide & CollideFlag.Player).toBeTruthy();
    expect(player.invincible).toBe(200);
    expect(player.visible).toBe(true);
    run(world, 1);
    expect(player.visible).toBe(false);
    player.life = 100;
    run(world, 1);
    expect(player.life).toBeCloseTo(100 + 200 / (25 * 30));
  });

  it('draws the weapon animation set of its character style and reports HUD status', () => {
    const world = makeRealWorld(arena(), { options: { playerCharacters: [1, 0] } });
    const player = playerOf(world);
    player.invincible = 0;
    run(world, 1);
    const visual = player.visual();
    if (visual?.kind !== VisualKind.Character) throw new Error('expected a character visual');
    expect(visual.style).toBe('bond');
    expect(visual.animation).toBe('Player_Handgun_Stand');
    run(world, 1, tickInput(held(PlayerControl.Up)));
    expect((player.visual() as { animation: string }).animation).toBe('Player_Handgun_Walk');
    expect(player.hudStatus()).toEqual({ lifeRatio: 1, weaponShortName: 'weapon.pistol.shortName', ammo: undefined, visible: true });
  });

  it('switches weapons with the number keys in every mode, and with next/previous', () => {
    const world = makeRealWorld(arena());
    const player = playerOf(world);
    player.newWeapon(WeaponName.Uzi);
    player.newWeapon(WeaponName.Railgun);
    world.events.drain();
    run(world, 1, tickInput(held(PlayerControl.Select2)));
    run(world, 1);
    expect(player.inventory.currentName).toBe(WeaponName.Uzi);
    const messages = world.events.drain().filter((event) => event.type === DomainEventType.HudMessage);
    expect(messages.map((event) => event.type === DomainEventType.HudMessage && event.text.key)).toEqual(['hud.weaponSelected.uzi']);
    run(world, 1, tickInput(held(PlayerControl.NextWeapon)));
    run(world, 1);
    expect(player.inventory.currentName).toBe(WeaponName.Railgun);
    run(world, 1, tickInput(held(PlayerControl.NextWeapon)));
    run(world, 1);
    expect(player.inventory.currentName).toBe(WeaponName.Pistol);
    run(world, 1, tickInput(held(PlayerControl.PrevWeapon)));
    run(world, 1);
    expect(player.inventory.currentName).toBe(WeaponName.Railgun);

    const coop = makeRealWorld(arena(), { options: { gameMode: GameMode.Coop } });
    const first = playerOf(coop);
    first.newWeapon(WeaponName.Uzi);
    run(coop, 1, tickInput(held(PlayerControl.Select2)));
    run(coop, 1);
    expect(first.inventory.currentName).toBe(WeaponName.Uzi);
  });
});

describe('Player death and respawn', () => {
  it('ends a single player game in the last second of the corpse', () => {
    const world = makeRealWorld(arena());
    const player = playerOf(world);
    kill(world, player);
    run(world, 1);
    expect(player.life).toBeLessThanOrEqual(0);
    run(world, 30);
    expect(player.state).toBe(CreatureState.Dead);
    expect(world.upgrades.playerCount).toBe(0);
    expect(world.hud.deathsOf(0)).toBe(1);
    run(world, 200);
    expect(world.completion).toBe(CompletionState.PlayerDead);
  });

  it('respawns a coop player near the other one with fresh life, emptied weapons and 5 s of invincibility', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.Coop } });
    const player = playerOf(world);
    player.newWeapon(WeaponName.Uzi);
    kill(world, player);
    let ticks = 0;
    while (player.state !== CreatureState.PlayerControl || ticks < 2) {
      world.update();
      ticks++;
      if (ticks > 400) throw new Error('no respawn');
    }
    expect(world.completion).toBeUndefined();
    expect(ticks).toBeGreaterThan(4 * 25 + 25);
    expect(player.life).toBe(200);
    expect(player.invincible).toBeGreaterThan(100);
    expect(player.inventory.slot(WeaponName.Uzi)?.weapon?.ammo).toBe(0);
    expect(player.inventory.currentName).toBe(WeaponName.Pistol);
    expect(world.upgrades.playerCount).toBe(2);
  });

  it('drops a pickup on a deathmatch death and respawns with 1 s of invincibility', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.DeathMatch } });
    const player = playerOf(world, 1);
    kill(world, player);
    run(world, 2);
    expect(ofClass(world, ThingClass.Pickup)).toHaveLength(1);
    for (let tick = 0; tick < 400 && player.state !== CreatureState.PlayerControl; tick++) world.update();
    expect(player.state).toBe(CreatureState.PlayerControl);
    expect(player.invincible).toBeLessThanOrEqual(25);
    expect(world.hud.deathsOf(1)).toBe(1);
  });

  it('credits the deathmatch frag to the player whose shot killed', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.DeathMatch, playerCharacters: [0, 1, 2] } });
    const victim = playerOf(world, 0);
    const shooter = playerOf(world, 2);
    run(world, 15);
    victim.invincible = 0;
    victim.affect(new BulletAffect(shooter, shooter, 1000, shooter.angle.clone()));
    for (let tick = 0; tick < 100 && victim.state !== CreatureState.Dead; tick++) world.update();
    expect(world.hud.frags.slice(0, 3)).toEqual([0, 0, 1]);
  });
});

describe('Player kill messages', () => {
  it('credits an explosion to the player who fired the shot and announces it in red with both names', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.DeathMatch, playerCharacters: [0, 1, 2] } });
    const victim = playerOf(world, 0);
    const shooter = playerOf(world, 2);
    run(world, 15);
    victim.invincible = 0;
    const shot = new FireBall(world, victim.position.clone(), shooter.angle.clone(), shooter, 0, false);
    victim.affect(new ExplosionAffect(shot, shot, 1000, 2));
    for (let tick = 0; tick < 100 && victim.state !== CreatureState.Dead; tick++) world.update();
    expect(world.hud.frags.slice(0, 3)).toEqual([0, 0, 1]);
    expect(world.hud.messages.find((message) => message.tone === MessageTone.Critical)).toMatchObject({ text: { key: 'hud.kill.player' }, names: { killer: 2, victim: 0 } });
  });

  it('names the kind of enemy that killed a player', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.Coop, playerCharacters: [0, 1] } });
    const victim = playerOf(world, 1);
    run(world, 15);
    victim.invincible = 0;
    victim.life = 1;
    const zombie = new Zombie(world, victim.position.clone());
    victim.affect(new ZombieAttackAffect(zombie, 50));
    for (let tick = 0; tick < 100 && victim.state !== CreatureState.Dead; tick++) world.update();
    expect(world.hud.messages.find((message) => message.tone === MessageTone.Critical)).toMatchObject({ text: { key: 'hud.kill.zombie' }, names: { victim: 1 } });
  });

  it('picks the message for player, self, zombie, devil and other kills', () => {
    expect(killMessage({ victim: 0, killer: 1, killerClass: ThingClass.Player }).text.key).toBe('hud.kill.player');
    expect(killMessage({ victim: 0, killer: 0, killerClass: ThingClass.Player }).text.key).toBe('hud.kill.self');
    expect(killMessage({ victim: 0, killer: undefined, killerClass: ThingClass.Devil }).text.key).toBe('hud.kill.devil');
    expect(killMessage({ victim: 0, killer: undefined, killerClass: ThingClass.Barrel }).text.key).toBe('hud.kill.other');
  });
});

describe('Player respawn countdown', () => {
  it('counts down 10 s from the dead state to the respawn in coop, and is absent while alive and in single play', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.Coop, playerCharacters: [0, 1] } });
    const player = playerOf(world, 1);
    expect(player.hudStatus().respawnTicks).toBeUndefined();
    kill(world, player);
    for (let tick = 0; tick < 200 && player.state !== CreatureState.Dead; tick++) world.update();
    const first = player.hudStatus().respawnTicks ?? 0;
    expect(Math.ceil(first / 25)).toBe(10);
    let ticks = 0;
    while (player.state !== CreatureState.PlayerControl && ticks < 400) {
      world.update();
      ticks++;
    }
    expect(ticks).toBe(first);
    expect(player.hudStatus().respawnTicks).toBeUndefined();
  });
});

describe('Player joining a running world', () => {
  it('gets the weapons unlocked so far in coop and empty ones in deathmatch', () => {
    const coop = makeRealWorld(arena(), { options: { gameMode: GameMode.Coop, difficulty: Difficulty.Expert } });
    const unlocked = coop.upgrades.unlockedWeapons;
    expect(unlocked).toContain(WeaponName.Uzi);
    coop.joinPlayer(2, 3);
    run(coop, 1);
    const joined = playerOf(coop, 2);
    expect(joined.character).toBe(3);
    for (const weapon of unlocked) expect(joined.inventory.slot(weapon)?.active).toBe(true);

    const deathMatch = makeRealWorld(arena(), { options: { gameMode: GameMode.DeathMatch } });
    deathMatch.joinPlayer(2, 0);
    run(deathMatch, 1);
    const late = playerOf(deathMatch, 2);
    const filled = late.inventory.slots.filter((slot) => slot.name !== WeaponName.Pistol && (slot.weapon?.ammo ?? 0) > 0);
    expect(filled).toEqual([]);
    expect(late.inventory.currentName).toBe(WeaponName.Pistol);
  });
});

describe('Player leaving a running world', () => {
  it('frees the map cell of the leaving player', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.Coop } });
    run(world, 2);
    const leaver = playerOf(world, 1);
    const cell = world.map.cellAt(leaver.position.x, leaver.position.y);
    expect((cell?.collide ?? 0) & CollideFlag.Player).toBeTruthy();
    expect(world.leavePlayer(1)).toBe(true);
    run(world, 1);
    expect((cell?.collide ?? 0) & CollideFlag.Player).toBe(0);
  });

  it('counts a player who leaves while being hit to death as gone exactly once', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.Coop, playerCharacters: [0, 1, 2] } });
    const leaver = playerOf(world, 1);
    const shooter = playerOf(world, 0);
    run(world, 15);
    leaver.invincible = 0;
    leaver.affect(new BulletAffect(shooter, shooter, 1000, shooter.angle.clone()));
    run(world, 1);
    expect(leaver.life).toBeLessThanOrEqual(0);
    expect(leaver.state).toBe(CreatureState.BulletHit);
    expect(leaver.deathLogged).toBe(false);
    expect(world.leavePlayer(1)).toBe(true);
    run(world, 1);
    expect(world.upgrades.playerCount).toBe(2);
  });

  it('counts a player who leaves after the death was logged as gone exactly once', () => {
    const world = makeRealWorld(arena(), { options: { gameMode: GameMode.Coop, playerCharacters: [0, 1, 2] } });
    const leaver = playerOf(world, 1);
    kill(world, leaver);
    for (let tick = 0; tick < 100 && !leaver.deathLogged; tick++) world.update();
    expect(world.upgrades.playerCount).toBe(2);
    expect(world.leavePlayer(1)).toBe(true);
    run(world, 1);
    expect(world.upgrades.playerCount).toBe(2);
  });
});
