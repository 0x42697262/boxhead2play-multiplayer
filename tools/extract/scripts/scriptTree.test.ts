import { describe, expect, it } from 'vitest';
import { classifyScriptPath, organizeScripts } from './scriptTree.ts';

describe('script tree', () => {
  it('classifies FFDec script paths', () => {
    expect(classifyScriptPath('frame_10/DoAction.as')).toEqual({ kind: 'frame', spriteId: 0, frameIndex: 9 });
    expect(classifyScriptPath('DefineSprite_98/frame_1/DoAction.as')).toEqual({ kind: 'frame', spriteId: 98, frameIndex: 0 });
    expect(classifyScriptPath('__Packages/CSound.as')).toEqual({ kind: 'package' });
    expect(classifyScriptPath('Piece/Cube1.as')).toEqual({ kind: 'other' });
    expect(classifyScriptPath('DefineSprite_253_Screen_Main/frame_1/PlaceObject3_246_70/CLIPACTIONRECORD on(release).as')).toEqual({
      kind: 'other',
    });
  });

  it('separates class registrations, frame scripts, self-hiding sprites and the XSI data script', () => {
    const tree = organizeScripts([
      { path: 'Piece/Cube1.as', source: 'Object.registerClass("Piece.Cube1",eval("World.Init.CWorld_Init_Piece"));' },
      { path: 'DefineSprite_98/frame_1/DoAction.as', source: 'var §\\x01§ = 66;\n_visible = false;' },
      { path: 'DefineSprite_755_TMP/frame_1/DoAction.as', source: '_global.mXSI_Data = {mItems:mItems};' },
      { path: '__Packages/CMain.as', source: 'class CMain {}' },
    ]);
    expect(tree.classSources).toHaveLength(2);
    expect(tree.frameScripts.get(98)?.get(0)).toBe('_visible = false;');
    expect([...tree.selfHiddenSpriteIds]).toEqual([98]);
    expect(tree.xsiSource).toContain('mXSI_Data');
    expect(tree.frameScripts.has(755)).toBe(false);
  });
});
