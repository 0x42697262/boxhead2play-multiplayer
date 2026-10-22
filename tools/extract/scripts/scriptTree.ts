import { ScriptPath, XSI_DATA_MARKER } from '../tuning.ts';
import { cleanScript, frameIndexFromDirectory, isSelfHiding, spriteIdFromDirectory } from './actionScript.ts';

export const ROOT_TIMELINE_ID = 0;
const FRAME_ACTION_FILE = /^DoAction(?:_\d+)?\.as$/;
const PATH_SEPARATOR = /[\\/]/;
const FRAME_PATH_DEPTH_ROOT = 2;
const FRAME_PATH_DEPTH_SPRITE = 3;

export type ScriptLocation =
  | { readonly kind: 'frame'; readonly spriteId: number; readonly frameIndex: number }
  | { readonly kind: 'package' }
  | { readonly kind: 'other' };

export function classifyScriptPath(relativePath: string): ScriptLocation {
  const parts = relativePath.split(PATH_SEPARATOR);
  if (parts[0] === ScriptPath.Packages) return { kind: 'package' };
  const fileName = parts.at(-1) ?? '';
  if (!FRAME_ACTION_FILE.test(fileName)) return { kind: 'other' };
  if (parts.length === FRAME_PATH_DEPTH_ROOT) {
    const frameIndex = frameIndexFromDirectory(parts[0] ?? '');
    return frameIndex === undefined ? { kind: 'other' } : { kind: 'frame', spriteId: ROOT_TIMELINE_ID, frameIndex };
  }
  if (parts.length === FRAME_PATH_DEPTH_SPRITE) {
    const spriteId = spriteIdFromDirectory(parts[0] ?? '');
    const frameIndex = frameIndexFromDirectory(parts[1] ?? '');
    if (spriteId !== undefined && frameIndex !== undefined) return { kind: 'frame', spriteId, frameIndex };
  }
  return { kind: 'other' };
}

export interface ScriptFile {
  readonly path: string;
  readonly source: string;
}

export interface ScriptTree {
  readonly classSources: string[];
  readonly frameScripts: Map<number, Map<number, string>>;
  readonly selfHiddenSpriteIds: Set<number>;
  readonly xsiSource: string | undefined;
}

export function organizeScripts(files: readonly ScriptFile[]): ScriptTree {
  const tree: ScriptTree = { classSources: [], frameScripts: new Map(), selfHiddenSpriteIds: new Set(), xsiSource: undefined };
  let xsiSource: string | undefined;
  for (const file of files) {
    const location = classifyScriptPath(file.path);
    if (location.kind === 'package') continue;
    if (location.kind === 'frame' && file.source.includes(XSI_DATA_MARKER)) {
      xsiSource = file.source;
      continue;
    }
    tree.classSources.push(file.source);
    if (location.kind !== 'frame') continue;
    const cleaned = cleanScript(file.source);
    const frames = tree.frameScripts.get(location.spriteId) ?? new Map<number, string>();
    const existing = frames.get(location.frameIndex);
    frames.set(location.frameIndex, existing === undefined ? cleaned : `${existing}\n${cleaned}`);
    tree.frameScripts.set(location.spriteId, frames);
    if (location.frameIndex === 0 && isSelfHiding(cleaned)) tree.selfHiddenSpriteIds.add(location.spriteId);
  }
  return { ...tree, xsiSource };
}
