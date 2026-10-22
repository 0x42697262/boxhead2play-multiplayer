import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RoomSchema, SymbolsCatalogSchema } from '../../../src/adapters/assets/schemas.ts';
import { createFfdec, exportSpritePngs } from '../adapters/ffdec.ts';
import { makeWorkDir, readText, walkFiles, writeText } from '../adapters/files.ts';
import { loadExtractConfig } from '../config.ts';
import { roomFile } from '../rooms/roomIndex.ts';
import { DEBUG_DEFAULT_ROOMS, DEBUG_DIR_PREFIX, FFDEC_SPRITE_DIRECTORY_PREFIX, OutputPath, SVG_FILE_EXTENSION } from '../tuning.ts';
import { composeFloorSvg } from './floorComposite.ts';
import { readPngSize } from './png.ts';

const PNG_DIRECTORY = 'png';
const PNG_EXTENSION = '.png';
const UTF8 = 'utf8';

async function main(): Promise<void> {
  const config = loadExtractConfig();
  const roomIds = process.argv.length > 2 ? process.argv.slice(2) : [...DEBUG_DEFAULT_ROOMS];
  const outDir = await makeWorkDir(DEBUG_DIR_PREFIX);
  const libraryDir = path.join(config.outDir, OutputPath.LibraryDir);
  const symbols = SymbolsCatalogSchema.parse(JSON.parse(await readText(path.join(config.outDir, OutputPath.Symbols))));
  const rooms = await Promise.all(
    roomIds.map(async (id) =>
      RoomSchema.parse(JSON.parse(await readText(path.join(config.outDir, OutputPath.RoomsDir, roomFile(id))))),
    ),
  );
  for (const room of rooms) {
    const svg = composeFloorSvg(symbols, room, (relative) => readFileSync(path.join(libraryDir, relative), UTF8));
    const target = path.join(outDir, `${room.id}${SVG_FILE_EXTENSION}`);
    await writeText(target, svg);
    console.log(`composite ${room.id}: ${target}`);
  }
  const pngDir = path.join(outDir, PNG_DIRECTORY);
  await exportSpritePngs(createFfdec(config.ffdecJar), config.swfPath, pngDir, rooms.map((room) => room.characterId));
  const pngs = (await walkFiles(pngDir)).filter((file) => file.endsWith(PNG_EXTENSION));
  for (const room of rooms) {
    const png = pngs.find((file) => file.split(path.sep)[0]?.startsWith(`${FFDEC_SPRITE_DIRECTORY_PREFIX}${room.characterId}_`) === true);
    const bounds = symbols.sprites[String(room.characterId)]?.frameBounds[0];
    if (png === undefined || bounds === undefined || bounds === null) {
      console.log(`${room.id}: no PNG or bounds to compare`);
      continue;
    }
    const size = readPngSize(readFileSync(path.join(pngDir, png)));
    const width = bounds.xMax - bounds.xMin;
    const height = bounds.yMax - bounds.yMin;
    console.log(
      `${room.id}: FFDec PNG ${size.width}x${size.height}, library frame bounds ${width}x${height} (delta ${size.width - Math.ceil(width)}x${size.height - Math.ceil(height)}), PNG ${path.join(pngDir, png)}`,
    );
  }
}

await main();
