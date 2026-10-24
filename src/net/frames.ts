import { DomainEventType, type DomainEvent } from '../domain/events.ts';
import { cellToScreen } from '../domain/world/camera.ts';
import type { CameraView, World } from '../domain/world/World.ts';
import { ServerMessageType, type NetEvent, type NetFrame, type NetHud } from './protocol.ts';

export function playerHudEntries(world: World): NetHud['players'] {
  return world.players().map((player) => {
    const { x, y, z } = player.position;
    return { playerIndex: player.playerIndex, position: { x, y, z }, status: player.hudStatus() };
  });
}

export function netEvents(events: readonly DomainEvent[], camera: CameraView, projectionFactor: number): NetEvent[] {
  const routed: NetEvent[] = [];
  for (const event of events) {
    switch (event.type) {
      case DomainEventType.SoundRequested:
      case DomainEventType.DecalRequested:
        routed.push(event);
        break;
      case DomainEventType.ScoreAwarded: {
        const screen = cellToScreen(event.worldPosition, projectionFactor);
        routed.push({ ...event, screenPosition: { x: screen.x - camera.drawOrigin.x, y: screen.y - camera.drawOrigin.y } });
        break;
      }
      default:
        break;
    }
  }
  return routed;
}

export function netFrameFor(world: World, playerIndex: number, events: readonly DomainEvent[]): NetFrame | undefined {
  const camera = world.cameraFor(playerIndex);
  if (!camera) return undefined;
  return {
    type: ServerMessageType.Frame,
    tick: world.tick,
    brightness: world.effectsFor(playerIndex).brightness,
    camera,
    entries: world.drawList(camera),
    hud: {
      totalScore: world.hud.totalScore,
      multiplier: world.upgrades.multiplier,
      multiplierTickRatio: world.upgrades.multiplierTickRatio,
      frags: [...world.hud.frags],
      deaths: [...world.hud.deathCounts],
      messages: world.hud.messages.filter((message) => message.playerIndex === undefined || message.playerIndex === playerIndex),
      players: playerHudEntries(world),
    },
    events: netEvents(events, camera, world.projectionFactor),
  };
}
