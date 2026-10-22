import {
  ASSET_FORMAT_VERSION,
  type AnimAnchors,
  type AnimMeta,
  type XsiCatalog,
  type XsiMaterial,
  type XsiSet,
} from '../../../src/adapters/assets/schemas.ts';
import { XSI_MODELS_WITH_ANCHORS } from '../tuning.ts';
import type { RawXsiItem } from './evaluateXsi.ts';

export interface XsiInputs {
  readonly items: readonly RawXsiItem[];
  readonly globalScale: number;
  readonly styleSheetTextureLinks: ReadonlyMap<string, readonly string[]>;
  readonly exports: ReadonlyMap<string, number>;
}

export interface XsiOutput {
  readonly xsi: XsiCatalog;
  readonly animMeta: AnimMeta;
}

export class XsiBuildError extends Error {}

const MATERIAL_USAGE_PREFIX = 'material:';
const STYLE_SHEET_USAGE_PREFIX = 'styleSheet:';

export function setId(item: RawXsiItem): string {
  return `${item.mGroupID}_${item.mAnimID}`;
}

export function mergeMasterMaterials(items: readonly RawXsiItem[]): Record<string, XsiMaterial> {
  const master: Record<string, XsiMaterial> = {};
  for (const item of [...items].reverse()) {
    for (const [name, material] of Object.entries(item.mXSI.mMaterials)) master[name] = material;
  }
  return master;
}

function textureLinkages(inputs: XsiInputs): XsiCatalog['textureLinkages'] {
  const usage = new Map<string, string[]>();
  const add = (linkage: string, user: string): void => {
    const users = usage.get(linkage) ?? [];
    if (!users.includes(user)) users.push(user);
    usage.set(linkage, users);
  };
  for (const item of inputs.items) {
    for (const [name, material] of Object.entries(item.mXSI.mMaterials)) {
      if (material.mcLinkID !== undefined) add(material.mcLinkID, `${MATERIAL_USAGE_PREFIX}${name}`);
    }
  }
  for (const [linkage, styleSheets] of inputs.styleSheetTextureLinks) {
    for (const styleSheet of styleSheets) add(linkage, `${STYLE_SHEET_USAGE_PREFIX}${styleSheet}`);
  }
  return Object.fromEntries(
    [...usage.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([linkage, usedBy]) => [linkage, { characterId: inputs.exports.get(linkage) ?? null, usedBy }]),
  );
}

function anchorsOf(item: RawXsiItem): AnimAnchors[][] {
  return item.mXSI.mRotations.map((direction) =>
    direction.map((frame) => {
      const anchors: AnimAnchors = {};
      for (const name of XSI_MODELS_WITH_ANCHORS) {
        const model = frame.Models[name];
        const position = model?.Empty === true ? undefined : model?.XSIInfo?.vPosition;
        if (position !== undefined) anchors[name] = { x: position.mX, y: position.mY, z: position.mZ };
      }
      return anchors;
    }),
  );
}

function sourceFrameCount(item: RawXsiItem): number {
  const counts = new Set(item.mXSI.mRotations.map((direction) => direction.length));
  const [count, ...others] = [...counts];
  if (count === undefined || others.length > 0) throw new XsiBuildError(`${setId(item)} has uneven direction lengths`);
  return count;
}

export function buildXsi(inputs: XsiInputs): XsiOutput {
  const sets: Record<string, XsiSet> = {};
  const meta: AnimMeta['sets'] = {};
  for (const item of inputs.items) {
    const id = setId(item);
    if (sets[id] !== undefined) throw new XsiBuildError(`Duplicate XSI set ${id}`);
    const optional = {
      ...(item.mFrameSquence === undefined ? {} : { frameSequence: item.mFrameSquence }),
      ...(item.mRenderPartner === undefined ? {} : { renderPartner: item.mRenderPartner }),
    };
    const frames = sourceFrameCount(item);
    const outOfRange = item.mFrameSquence?.find((frame) => frame >= frames);
    if (outOfRange !== undefined) throw new XsiBuildError(`${id} frame sequence references frame ${outOfRange}`);
    sets[id] = {
      groupId: item.mGroupID,
      animId: item.mAnimID,
      ...optional,
      tilt: item.mXSI.mXSIInfo.mTilt,
      light: item.mXSI.mXSIInfo.mLight,
      materials: item.mXSI.mMaterials,
      directions: item.mXSI.mRotations,
    };
    meta[id] = {
      groupId: item.mGroupID,
      animId: item.mAnimID,
      directionCount: item.mXSI.mRotations.length,
      frameCount: item.mFrameSquence?.length ?? frames,
      sourceFrameCount: frames,
      ...optional,
      tilt: item.mXSI.mXSIInfo.mTilt,
      anchors: anchorsOf(item),
    };
  }
  return {
    xsi: {
      formatVersion: ASSET_FORMAT_VERSION,
      globalScale: inputs.globalScale,
      setOrder: inputs.items.map(setId),
      materials: mergeMasterMaterials(inputs.items),
      textureLinkages: textureLinkages(inputs),
      sets,
    },
    animMeta: { formatVersion: ASSET_FORMAT_VERSION, globalScale: inputs.globalScale, sets: meta },
  };
}
