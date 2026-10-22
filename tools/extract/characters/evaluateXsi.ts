import vm from 'node:vm';
import { z } from 'zod';
import { XsiFrameSchema, XsiMaterialSchema, XsiVectorSchema } from '../../../src/adapters/assets/schemas.ts';

export const XSI_EVALUATION_TIMEOUT_MS = 60_000;

export const RawXsiItemSchema = z.object({
  mGroupID: z.string(),
  mAnimID: z.string(),
  mFrameSquence: z.array(z.number().int().nonnegative()).optional(),
  mRenderPartner: z.string().optional(),
  mXSI: z.object({
    mRotations: z.array(z.array(XsiFrameSchema)),
    mMaterials: z.record(z.string(), XsiMaterialSchema),
    mXSIInfo: z.object({ mTilt: z.number(), mLight: XsiVectorSchema }),
  }),
});
export type RawXsiItem = z.infer<typeof RawXsiItemSchema>;

export class XsiEvaluationError extends Error {}

interface XsiSandbox {
  _global: { mXSI_Data?: { mItems?: unknown } };
  trace: (message: unknown) => void;
}

export function evaluateXsiScript(source: string): RawXsiItem[] {
  const sandbox: XsiSandbox = { _global: {}, trace: () => undefined };
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { timeout: XSI_EVALUATION_TIMEOUT_MS });
  const items: unknown = sandbox._global.mXSI_Data?.mItems;
  if (items === undefined) throw new XsiEvaluationError('XSI script did not define _global.mXSI_Data.mItems');
  const parsed = z.array(RawXsiItemSchema).safeParse(JSON.parse(JSON.stringify(items)));
  if (!parsed.success) throw new XsiEvaluationError(z.prettifyError(parsed.error));
  return parsed.data;
}
