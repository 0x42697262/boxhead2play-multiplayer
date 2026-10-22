import {
  ASSET_FORMAT_VERSION,
  SoundRegistrationSchema,
  type SoundEntry,
  type SoundIndex,
  type SoundRegistration,
} from '../../../src/adapters/assets/schemas.ts';
import type { ParsedSoundRegistration } from '../scripts/actionScript.ts';
import type { SwfIndex } from '../swf/swfIndex.ts';
import { SOUND_LINKAGE_SUFFIX, TIMELINE_SOUND_ID_SEPARATOR, TIMELINE_SOUND_PREFIX } from '../tuning.ts';

export const SOUND_RATES_HZ = [5512, 11025, 22050, 44100] as const;
const SPRITE_PREFIX = 'Sprite';
const EXPORTED_FILE = /^(-?\d+)(?:_.*)?(\.[a-z0-9]+)$/;

export interface SoundCopy {
  readonly from: string;
  readonly to: string;
}

export interface SoundsOutput {
  readonly index: SoundIndex;
  readonly copies: SoundCopy[];
}

export class SoundBuildError extends Error {}

export function exportedSoundFiles(fileNames: readonly string[]): Map<number, string> {
  const files = new Map<number, string>();
  for (const name of fileNames) {
    const id = EXPORTED_FILE.exec(name)?.[1];
    if (id !== undefined) files.set(Number(id), name);
  }
  return files;
}

function extensionOf(fileName: string): string {
  return EXPORTED_FILE.exec(fileName)?.[2] ?? '';
}

function stripSoundSuffix(linkage: string): string {
  return linkage.endsWith(SOUND_LINKAGE_SUFFIX) ? linkage.slice(0, -SOUND_LINKAGE_SUFFIX.length) : linkage;
}

interface TimelineStart {
  readonly spriteId: number;
  readonly frame: number;
}

function timelineStarts(index: SwfIndex): Map<number, TimelineStart[]> {
  const starts = new Map<number, TimelineStart[]>();
  const spriteIds = [index.document.root.id, ...[...index.document.characters.values()].filter((c) => c.kind === 'sprite').map((c) => c.id)];
  for (const spriteId of spriteIds) {
    index.timeline(spriteId).forEach((frame, frameIndex) => {
      for (const sound of frame.sounds) {
        starts.set(sound.soundId, [...(starts.get(sound.soundId) ?? []), { spriteId, frame: frameIndex }]);
      }
    });
  }
  return starts;
}

export function describeOwner(index: SwfIndex, spriteId: number, seen = new Set<number>()): string {
  const linkage = index.linkageOf(spriteId);
  if (linkage !== undefined) return linkage;
  if (seen.has(spriteId)) return `${SPRITE_PREFIX}${spriteId}`;
  seen.add(spriteId);
  for (const parent of index.document.characters.values()) {
    if (parent.kind !== 'sprite') continue;
    for (const frame of index.timeline(parent.id)) {
      const placement = frame.displayList.find((item) => item.characterId === spriteId && item.name !== undefined);
      if (placement?.name !== undefined) {
        return `${describeOwner(index, parent.id, seen)}${TIMELINE_SOUND_ID_SEPARATOR}${placement.name}`;
      }
    }
  }
  return `${SPRITE_PREFIX}${spriteId}`;
}

function toRegistration(parsed: ParsedSoundRegistration): SoundRegistration {
  const result = SoundRegistrationSchema.safeParse(parsed);
  if (!result.success) throw new SoundBuildError(`Unsupported sound registration ${parsed.table}.${parsed.key}`);
  return result.data;
}

export function buildSounds(
  index: SwfIndex,
  exportedFiles: ReadonlyMap<number, string>,
  registrations: readonly ParsedSoundRegistration[],
): SoundsOutput {
  const starts = timelineStarts(index);
  const sounds: Record<string, SoundEntry> = {};
  const copies: SoundCopy[] = [];
  const definitions = [...index.document.characters.values()].sort((first, second) => first.id - second.id);
  for (const definition of definitions) {
    if (definition.kind !== 'sound') continue;
    const source = exportedFiles.get(definition.id);
    if (source === undefined) throw new SoundBuildError(`FFDec exported no file for sound ${definition.id}`);
    const linkage = index.linkageOf(definition.id);
    const soundStarts = starts.get(definition.id) ?? [];
    const firstStart = soundStarts[0];
    const key =
      linkage ??
      (firstStart === undefined
        ? `${TIMELINE_SOUND_PREFIX}${definition.id}`
        : `${describeOwner(index, firstStart.spriteId)}${TIMELINE_SOUND_ID_SEPARATOR}${TIMELINE_SOUND_PREFIX}${definition.id}`);
    const file = `${linkage === undefined ? key : stripSoundSuffix(linkage)}${extensionOf(source)}`;
    const sampleRate = SOUND_RATES_HZ[definition.rate];
    if (sampleRate === undefined) throw new SoundBuildError(`Sound ${definition.id} has unknown rate ${definition.rate}`);
    sounds[key] = {
      file,
      characterId: definition.id,
      source: linkage === undefined ? 'timeline' : 'export',
      ...(linkage === undefined ? {} : { linkage }),
      sampleCount: definition.sampleCount,
      sampleRate,
      stereo: definition.stereo,
      ...(soundStarts.length > 0
        ? { timelineStarts: soundStarts.map((start) => ({ ...start, owner: describeOwner(index, start.spriteId) })) }
        : {}),
    };
    copies.push({ from: source, to: file });
  }
  const unknown = registrations.filter((registration) => !Object.values(sounds).some((sound) => sound.linkage === registration.linkage));
  if (unknown.length > 0) throw new SoundBuildError(`CSound registers unexported sounds ${unknown.map((r) => r.linkage).join(', ')}`);
  return { index: { formatVersion: ASSET_FORMAT_VERSION, sounds, registrations: registrations.map(toRegistration) }, copies };
}
