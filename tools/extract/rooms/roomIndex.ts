import { ASSET_FORMAT_VERSION, type RoomIndex } from '../../../src/adapters/assets/schemas.ts';
import type { SwfIndex } from '../swf/swfIndex.ts';
import { LEVEL_ICONS_LINKAGE, ROOM_LINKAGE_PREFIX, ROOM_NUMBER_DIGITS } from '../tuning.ts';
import { RoomError } from './composeRoom.ts';

export interface ExclusiveTables {
  readonly single: readonly number[];
  readonly coop: readonly number[];
  readonly deathMatch: readonly number[];
}

export interface RoomIndexInputs {
  readonly index: SwfIndex;
  readonly texts: Readonly<Record<string, { readonly text: string }>>;
  readonly exclusives: ExclusiveTables;
}

const ROOM_NUMBER_TEXT = /^\d+$/;
const ROOM_TOTAL_TEXT = /^\/\d+$/;
const EXCLUSIVE_FLAG = 1;

export function roomLinkage(roomIndex: number): string {
  return `${ROOM_LINKAGE_PREFIX}${String(roomIndex + 1).padStart(ROOM_NUMBER_DIGITS, '0')}`;
}

export function roomFile(linkage: string): string {
  return `${linkage}.json`;
}

export function buildRoomIndex(inputs: RoomIndexInputs): RoomIndex {
  const { index } = inputs;
  const iconsId = index.document.exports.get(LEVEL_ICONS_LINKAGE);
  if (iconsId === undefined) throw new RoomError(`${LEVEL_ICONS_LINKAGE} is not exported`);
  const frames = index.timeline(iconsId);
  const rooms = frames.map((frame, frameIndex) => {
    const id = roomLinkage(frameIndex);
    if (!index.document.exports.has(id)) throw new RoomError(`Level icon frame ${frameIndex} has no room ${id}`);
    const strings = frame.displayList
      .map((item) => inputs.texts[String(item.characterId)]?.text)
      .filter((text): text is string => text !== undefined)
      .map((text) => text.trim());
    const names = strings.filter((text) => !ROOM_NUMBER_TEXT.test(text) && !ROOM_TOTAL_TEXT.test(text));
    const numbers = strings.filter((text) => ROOM_NUMBER_TEXT.test(text)).map(Number);
    const name = names[0];
    if (names.length !== 1 || name === undefined) throw new RoomError(`Level icon frame ${frameIndex} has names ${names.join('|')}`);
    if (!numbers.includes(frameIndex + 1)) throw new RoomError(`Level icon frame ${frameIndex} does not show number ${frameIndex + 1}`);
    return {
      index: frameIndex,
      id,
      file: roomFile(id),
      name,
      iconFrame: frameIndex,
      exclusive: {
        single: inputs.exclusives.single[frameIndex] === EXCLUSIVE_FLAG,
        coop: inputs.exclusives.coop[frameIndex] === EXCLUSIVE_FLAG,
        deathMatch: inputs.exclusives.deathMatch[frameIndex] === EXCLUSIVE_FLAG,
      },
    };
  });
  return { formatVersion: ASSET_FORMAT_VERSION, rooms };
}
