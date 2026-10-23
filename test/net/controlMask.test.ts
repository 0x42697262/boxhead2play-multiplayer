import { describe, expect, it } from 'vitest';
import { PlayerControl } from '../../src/domain/world/input.ts';
import { controlBit, masksOf, RemoteControls } from '../../src/net/controlMask.ts';
import { decodeClientMessage, decodeServerMessage, encodeServerMessage } from '../../src/net/protocol.ts';
import { held } from '../domain/support/input.ts';

const fire = controlBit(PlayerControl.Fire);
const left = controlBit(PlayerControl.Left);

describe('control masks', () => {
  it('turn a player input into bit masks and back with the local sampler edge rules', () => {
    expect(masksOf(held(PlayerControl.Fire, PlayerControl.Left))).toEqual({ down: fire | left, pressed: fire | left, released: 0 });
    const remote = new RemoteControls();
    remote.receive({ down: left, pressed: left, released: 0 });
    expect(remote.sample().left).toEqual({ down: true, pressed: true, released: false, heldTicks: 1 });
    expect(remote.sample().left).toEqual({ down: true, pressed: false, released: false, heldTicks: 2 });
    remote.receive({ down: 0, pressed: 0, released: left });
    expect(remote.sample().left).toEqual({ down: false, pressed: false, released: true, heldTicks: 0 });
  });

  it('keep a tap that arrives between two ticks', () => {
    const remote = new RemoteControls();
    remote.receive({ down: fire, pressed: fire, released: 0 });
    remote.receive({ down: 0, pressed: 0, released: fire });
    expect(remote.sample().fire).toEqual({ down: false, pressed: true, released: true, heldTicks: 0 });
  });

  it('release held controls when the player disconnects', () => {
    const remote = new RemoteControls();
    remote.receive({ down: left, pressed: left, released: 0 });
    remote.sample();
    remote.releaseAll();
    expect(remote.sample().left).toEqual({ down: false, pressed: false, released: true, heldTicks: 0 });
  });
});

describe('protocol codec', () => {
  it('rejects unknown types, masks out of range and oversized names', () => {
    expect(decodeClientMessage('{"type":"input","down":-1,"pressed":0,"released":0}')).toBeUndefined();
    expect(decodeClientMessage('not json')).toBeUndefined();
    expect(decodeClientMessage(JSON.stringify({ type: 'joinLobby', lobbyId: '', character: 0 }))).toBeUndefined();
    expect(decodeClientMessage(JSON.stringify({ type: 'setCharacter', character: 9 }))).toBeUndefined();
    expect(decodeClientMessage(JSON.stringify({ type: 'setCharacter', character: 2 }))).toEqual({ type: 'setCharacter', character: 2 });
  });

  it('rounds fractions to three digits on the wire and rejects unknown text keys', () => {
    const text = encodeServerMessage({ type: 'gameOver', matchId: 'm', state: 'quit', winnerName: null, score: 1.23456 });
    expect(decodeServerMessage(text)).toEqual({ type: 'gameOver', matchId: 'm', state: 'quit', winnerName: null, score: 1.235 });
    const upgrades = JSON.stringify({ type: 'upgrades', upgrades: [{ index: 1, name: 'no.such.key', active: true, newWeapon: false }] });
    expect(decodeServerMessage(upgrades)).toBeUndefined();
  });
});
