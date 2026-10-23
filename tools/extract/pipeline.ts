import path from 'node:path';
import type { z } from 'zod';
import {
  AnimMetaSchema,
  FontIndexSchema,
  ManifestSchema,
  RoomIndexSchema,
  RoomSchema,
  SoundIndexSchema,
  SymbolsCatalogSchema,
  XsiCatalogSchema,
  type Manifest,
  type SymbolsCatalog,
} from '../../src/adapters/assets/schemas.ts';
import type { Logger } from '../../src/observability/logger.ts';
import { LogEvent } from '../../src/text/logEvents.ts';
import { createFfdec, exportResources, swfToXml } from './adapters/ffdec.ts';
import {
  copyInto,
  digestFile,
  listFiles,
  makeWorkDir,
  readSvgDirectory,
  readText,
  removeDir,
  walkFiles,
  writeText,
} from './adapters/files.ts';
import { buildXsi } from './characters/buildXsi.ts';
import { evaluateXsiScript } from './characters/evaluateXsi.ts';
import type { ResolvedExtractConfig } from './config.ts';
import { buildFonts, exportedFontFiles } from './fonts/buildFonts.ts';
import { buildSymbols } from './library/buildSymbols.ts';
import { buildManifest } from './manifest.ts';
import { composeRoom } from './rooms/composeRoom.ts';
import { buildRoomIndex, roomFile } from './rooms/roomIndex.ts';
import {
  parseRegisteredClasses,
  parseSoundRegistrations,
  parseStaticNumber,
  parseStaticNumberArray,
  parseStyleSheetTextureLinks,
} from './scripts/actionScript.ts';
import { organizeScripts, type ScriptTree } from './scripts/scriptTree.ts';
import { buildSounds, exportedSoundFiles } from './sounds/buildSounds.ts';
import { readSwfXml } from './swf/readSwfXml.ts';
import { SwfIndex } from './swf/swfIndex.ts';
import {
  EXCLUSIVE_MODES,
  EXPECTED_ROOM_COUNT,
  MANIFEST_JSON_INDENT,
  OutputPath,
  PipelineStep,
  REQUIRED_EXPORTS,
  ROOM_LINKAGE_PATTERN,
  SCRIPT_FILE_EXTENSION,
  ScriptPath,
  SVG_FILE_EXTENSION,
  WORK_DIR_PREFIX,
  WorkPath,
} from './tuning.ts';
import { parseXml } from './xml/parseXml.ts';

export class PipelineError extends Error {}

const GLOBAL_SCALE_FIELD = 'mGlobalScale';
const EXCLUSIVES_SUFFIX = '_Exclusives';
const OUTPUT_ROOTS = [
  OutputPath.Manifest,
  OutputPath.LibraryDir,
  OutputPath.RoomsDir,
  path.dirname(OutputPath.Xsi),
  OutputPath.SoundsDir,
  OutputPath.FontsDir,
] as const;

interface PendingOutput {
  readonly path: string;
  readonly write: (absolutePath: string) => Promise<void>;
}

interface Extraction {
  readonly index: SwfIndex;
  readonly scripts: ScriptTree;
  readonly classes: ReadonlyMap<string, string>;
  readonly work: (relative: string) => string;
  readonly packageScript: (relative: string) => Promise<string>;
  readonly logger: Logger;
}

interface StepResult {
  readonly outputs: PendingOutput[];
}

function validated<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PipelineError(`${label} failed schema validation: ${result.error.message}`);
  return result.data;
}

function jsonOutput<T>(relativePath: string, schema: z.ZodType<T>, value: T): PendingOutput {
  const checked = validated(schema, value, relativePath);
  return { path: relativePath, write: (target) => writeText(target, JSON.stringify(checked)) };
}

function textOutput(relativePath: string, content: string): PendingOutput {
  return { path: relativePath, write: (target) => writeText(target, content) };
}

function copyOutput(relativePath: string, source: string): PendingOutput {
  return { path: relativePath, write: (target) => copyInto(source, target) };
}

async function readScripts(scriptsDir: string): Promise<{ path: string; source: string }[]> {
  const files = (await walkFiles(scriptsDir)).filter((file) => file.endsWith(SCRIPT_FILE_EXTENSION));
  return Promise.all(files.map(async (file) => ({ path: file, source: await readText(path.join(scriptsDir, file)) })));
}

async function extract(config: ResolvedExtractConfig, workDir: string, logger: Logger): Promise<Extraction> {
  const ffdec = createFfdec(config.ffdecJar);
  const work = (relative: string): string => path.join(workDir, relative);
  logger.info(LogEvent.ExtractStep, { step: PipelineStep.SwfToXml, workDir });
  await swfToXml(ffdec, config.swfPath, work(WorkPath.SwfXml));
  logger.info(LogEvent.ExtractStep, { step: PipelineStep.Export });
  await exportResources(ffdec, config.swfPath, work(WorkPath.Export));
  logger.info(LogEvent.ExtractStep, { step: PipelineStep.Parse });
  const index = new SwfIndex(readSwfXml(parseXml(await readText(work(WorkPath.SwfXml)))));
  const missing = REQUIRED_EXPORTS.filter((linkage) => !index.document.exports.has(linkage));
  if (missing.length > 0) throw new PipelineError(`SWF lacks required exports: ${missing.join(', ')}`);
  const scripts = organizeScripts(await readScripts(work(WorkPath.Scripts)));
  return {
    index,
    scripts,
    classes: parseRegisteredClasses(scripts.classSources),
    work,
    packageScript: (relative) => readText(path.join(work(WorkPath.Scripts), relative)),
    logger,
  };
}

async function libraryStep(extraction: Extraction): Promise<StepResult & { readonly symbols: SymbolsCatalog }> {
  const { work } = extraction;
  const library = buildSymbols({
    index: extraction.index,
    classes: extraction.classes,
    frameScripts: extraction.scripts.frameScripts,
    selfHiddenSpriteIds: extraction.scripts.selfHiddenSpriteIds,
    shapeSvgs: await readSvgDirectory(work(WorkPath.Shapes), SVG_FILE_EXTENSION),
    textSvgs: await readSvgDirectory(work(WorkPath.Texts), SVG_FILE_EXTENSION),
    morphSvgs: await readSvgDirectory(work(WorkPath.MorphShapes), SVG_FILE_EXTENSION),
  });
  return {
    symbols: library.catalog,
    outputs: [
      jsonOutput(OutputPath.Symbols, SymbolsCatalogSchema, library.catalog),
      ...library.files.map((file) => textOutput(`${OutputPath.LibraryDir}/${file.path}`, file.content)),
    ],
  };
}

async function roomsStep(extraction: Extraction, symbols: SymbolsCatalog): Promise<StepResult & { readonly roomPaths: string[] }> {
  const { index } = extraction;
  const linkages = [...index.document.exports.keys()].filter((linkage) => ROOM_LINKAGE_PATTERN.test(linkage)).sort();
  if (linkages.length !== EXPECTED_ROOM_COUNT) throw new PipelineError(`Expected ${EXPECTED_ROOM_COUNT} rooms, found ${linkages.length}`);
  const context = { index, classes: extraction.classes, selfHiddenSpriteIds: extraction.scripts.selfHiddenSpriteIds };
  const roomPaths = linkages.map((linkage) => `${OutputPath.RoomsDir}/${roomFile(linkage)}`);
  const outputs = linkages.map((linkage, position) => jsonOutput(roomPaths[position] ?? linkage, RoomSchema, composeRoom(context, linkage)));
  const selectWorld = await extraction.packageScript(ScriptPath.SelectWorld);
  const exclusives = (mode: string): number[] => parseStaticNumberArray(selectWorld, `${mode}${EXCLUSIVES_SUFFIX}`);
  const roomIndex = buildRoomIndex({
    index,
    texts: symbols.texts,
    exclusives: {
      single: exclusives(EXCLUSIVE_MODES.single),
      coop: exclusives(EXCLUSIVE_MODES.coop),
      deathMatch: exclusives(EXCLUSIVE_MODES.deathMatch),
    },
  });
  return { roomPaths, outputs: [...outputs, jsonOutput(OutputPath.RoomIndex, RoomIndexSchema, roomIndex)] };
}

async function charactersStep(extraction: Extraction): Promise<StepResult> {
  if (extraction.scripts.xsiSource === undefined) throw new PipelineError('No frame script defines the XSI character data');
  const characters = buildXsi({
    items: evaluateXsiScript(extraction.scripts.xsiSource),
    globalScale: parseStaticNumber(await extraction.packageScript(ScriptPath.XsiBase), GLOBAL_SCALE_FIELD),
    styleSheetTextureLinks: parseStyleSheetTextureLinks(await extraction.packageScript(ScriptPath.XsiStyleSheet)),
    exports: extraction.index.document.exports,
  });
  const missing = Object.entries(characters.xsi.textureLinkages).filter(([, link]) => link.characterId === null);
  if (missing.length > 0) {
    extraction.logger.warn(LogEvent.ExtractWarning, { reason: 'texture linkage not exported', linkages: missing.map(([name]) => name) });
  }
  return {
    outputs: [
      jsonOutput(OutputPath.Xsi, XsiCatalogSchema, characters.xsi),
      jsonOutput(OutputPath.AnimMeta, AnimMetaSchema, characters.animMeta),
    ],
  };
}

async function audioAndFontsStep(extraction: Extraction): Promise<StepResult> {
  const { work } = extraction;
  const sounds = buildSounds(
    extraction.index,
    exportedSoundFiles(await listFiles(work(WorkPath.Sounds))),
    parseSoundRegistrations(await extraction.packageScript(ScriptPath.Sound)),
  );
  const fonts = buildFonts(extraction.index, exportedFontFiles(await listFiles(work(WorkPath.Fonts))));
  return {
    outputs: [
      jsonOutput(OutputPath.SoundIndex, SoundIndexSchema, sounds.index),
      ...sounds.copies.map((copy) => copyOutput(`${OutputPath.SoundsDir}/${copy.to}`, path.join(work(WorkPath.Sounds), copy.from))),
      jsonOutput(OutputPath.FontIndex, FontIndexSchema, fonts.index),
      ...fonts.copies.map((copy) => copyOutput(`${OutputPath.FontsDir}/${copy.to}`, path.join(work(WorkPath.Fonts), copy.from))),
    ],
  };
}

async function writeOutputs(outDir: string, outputs: readonly PendingOutput[]): Promise<string[]> {
  for (const root of OUTPUT_ROOTS) await removeDir(path.join(outDir, root));
  const written = new Set<string>();
  for (const output of outputs) {
    if (written.has(output.path)) throw new PipelineError(`Two outputs target ${output.path}`);
    written.add(output.path);
    await output.write(path.join(outDir, output.path));
  }
  return [...written].sort();
}

async function writeManifest(config: ResolvedExtractConfig, index: SwfIndex, roomPaths: string[], written: readonly string[]): Promise<Manifest> {
  const manifest = buildManifest({
    source: { file: path.basename(config.swfPath), ...(await digestFile(config.swfPath)) },
    generator: index.document.generator,
    catalogs: {
      symbols: OutputPath.Symbols,
      roomIndex: OutputPath.RoomIndex,
      rooms: roomPaths,
      xsi: OutputPath.Xsi,
      animMeta: OutputPath.AnimMeta,
      sounds: OutputPath.SoundIndex,
      fonts: OutputPath.FontIndex,
    },
    files: await Promise.all(written.map(async (relative) => ({ path: relative, ...(await digestFile(path.join(config.outDir, relative))) }))),
  });
  const checked = validated(ManifestSchema, manifest, OutputPath.Manifest);
  await writeText(path.join(config.outDir, OutputPath.Manifest), JSON.stringify(checked, null, MANIFEST_JSON_INDENT));
  return checked;
}

export async function runPipeline(config: ResolvedExtractConfig, logger: Logger): Promise<Manifest> {
  const workDir = await makeWorkDir(WORK_DIR_PREFIX);
  try {
    const extraction = await extract(config, workDir, logger);
    logger.info(LogEvent.ExtractStep, { step: PipelineStep.Build });
    const library = await libraryStep(extraction);
    const rooms = await roomsStep(extraction, library.symbols);
    const characters = await charactersStep(extraction);
    const media = await audioAndFontsStep(extraction);
    const outputs = [...library.outputs, ...rooms.outputs, ...characters.outputs, ...media.outputs];
    logger.info(LogEvent.ExtractStep, { step: PipelineStep.Write, outDir: config.outDir, files: outputs.length });
    const written = await writeOutputs(config.outDir, outputs);
    return await writeManifest(config, extraction.index, rooms.roomPaths, written);
  } finally {
    await removeDir(workDir);
  }
}
