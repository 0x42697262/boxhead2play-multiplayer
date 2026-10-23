import type { ColorTransform } from '../../assets/schemas.ts';
import { RGBA_STRIDE } from '../tuning.ts';

export const IDENTITY_COLOR: ColorTransform = { rMult: 1, gMult: 1, bMult: 1, aMult: 1, rAdd: 0, gAdd: 0, bAdd: 0, aAdd: 0 };

export function concatColor(parent: ColorTransform, child: ColorTransform): ColorTransform {
  return {
    rMult: parent.rMult * child.rMult,
    gMult: parent.gMult * child.gMult,
    bMult: parent.bMult * child.bMult,
    aMult: parent.aMult * child.aMult,
    rAdd: parent.rMult * child.rAdd + parent.rAdd,
    gAdd: parent.gMult * child.gAdd + parent.gAdd,
    bAdd: parent.bMult * child.bAdd + parent.bAdd,
    aAdd: parent.aMult * child.aAdd + parent.aAdd,
  };
}

export function alphaOnly(alpha: number): ColorTransform {
  return { ...IDENTITY_COLOR, aMult: alpha };
}

export function isAlphaOnly(ct: ColorTransform): boolean {
  return ct.rMult === 1 && ct.gMult === 1 && ct.bMult === 1 && ct.rAdd === 0 && ct.gAdd === 0 && ct.bAdd === 0 && ct.aAdd === 0;
}

export function splitAlpha(ct: ColorTransform): { readonly alpha: number; readonly color: ColorTransform | undefined } {
  if (isAlphaOnly(ct)) return { alpha: ct.aMult, color: undefined };
  return { alpha: 1, color: ct };
}

export function applyColorTransform(pixels: Uint8ClampedArray, ct: ColorTransform): void {
  for (let index = 0; index < pixels.length; index += RGBA_STRIDE) {
    pixels[index] = (pixels[index] as number) * ct.rMult + ct.rAdd;
    pixels[index + 1] = (pixels[index + 1] as number) * ct.gMult + ct.gAdd;
    pixels[index + 2] = (pixels[index + 2] as number) * ct.bMult + ct.bAdd;
    pixels[index + 3] = (pixels[index + 3] as number) * ct.aMult + ct.aAdd;
  }
}
