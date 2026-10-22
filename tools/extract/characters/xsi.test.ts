import { describe, expect, it } from 'vitest';
import { buildXsi, mergeMasterMaterials, XsiBuildError } from './buildXsi.ts';
import { evaluateXsiScript, XsiEvaluationError, type RawXsiItem } from './evaluateXsi.ts';

const SCRIPT = `
var mRotations = [[{Models:{Hand_Right:{Shape_Material:["Hand"],Shape_Matrix:[0],Shape_vList:[[1,2,3,4]],Shape_Brightness:[0.31],Shadow:[],PEdge:[],Edge:[],XSIInfo:{vPosition:{mX:0.17609018126512477,mY:-29.4444,mZ:-28.95}},Empty:false},Hand_Left:{Empty:true}}},{Models:{Hand_Right:{Empty:true}}}]];
var mXSIInfo = {mTilt:45,mLight:{mX:0.1,mY:0.2,mZ:-0.9}};
var mMaterials = {Hand:{mColor:16764057,mAlpha:100},Body_Back:{mcLinkID:"Body_Back_MC",mSize:{x:64,y:64}}};
var mPlayer_Default_Walk = {mRotations:mRotations,mMaterials:mMaterials,mXSIInfo:mXSIInfo};
mItems = new Array();
_global.mXSI_Data = {mItems:mItems};
mItems.push({mGroupID:"Player",mAnimID:"Walk",mXSI:mPlayer_Default_Walk,mFrameSquence:[0,1,0]});
trace("IMPORTED XSI DATA! No. Items = " + _global.mXSI_Data.mItems.length);
mLoaded = true;
`;

describe('evaluateXsiScript', () => {
  it('evaluates the FFDec frame script in a sandbox and keeps numbers exact', () => {
    const [item] = evaluateXsiScript(SCRIPT);
    expect(item?.mGroupID).toBe('Player');
    expect(item?.mXSI.mRotations[0]?.[0]?.Models['Hand_Right']?.XSIInfo?.vPosition.mX).toBe(0.17609018126512477);
  });

  it('fails when the script does not publish items', () => {
    expect(() => evaluateXsiScript('var x = 1;')).toThrow(XsiEvaluationError);
  });
});

describe('buildXsi', () => {
  const items = evaluateXsiScript(SCRIPT);
  const output = buildXsi({
    items,
    globalScale: 0.35,
    styleSheetTextureLinks: new Map([['Bond_Head_Back', ['SS_BOND']]]),
    exports: new Map([['Body_Back_MC', 742]]),
  });

  it('keys sets by group and animation and keeps the frame sequence', () => {
    expect(output.xsi.setOrder).toEqual(['Player_Walk']);
    expect(output.xsi.sets['Player_Walk']).toMatchObject({ groupId: 'Player', animId: 'Walk', tilt: 45, frameSequence: [0, 1, 0] });
  });

  it('extracts anchor positions for non-empty models', () => {
    const meta = output.animMeta.sets['Player_Walk'];
    expect(meta).toMatchObject({ directionCount: 1, sourceFrameCount: 2, frameCount: 3 });
    expect(meta?.anchors[0]?.[0]).toEqual({ Hand_Right: { x: 0.17609018126512477, y: -29.4444, z: -28.95 } });
    expect(meta?.anchors[0]?.[1]).toEqual({});
  });

  it('reports texture linkages and whether they are exported', () => {
    expect(output.xsi.textureLinkages).toEqual({
      Body_Back_MC: { characterId: 742, usedBy: ['material:Body_Back'] },
      Bond_Head_Back: { characterId: null, usedBy: ['styleSheet:SS_BOND'] },
    });
  });

  it('merges master materials like AS2 for..in over mItems, so the first item wins', () => {
    const base = items[0];
    if (base === undefined) throw new Error('fixture missing');
    const variant = (color: number): RawXsiItem => ({
      ...base,
      mXSI: { ...base.mXSI, mMaterials: { Hand: { mColor: color, mAlpha: 100 } } },
    });
    expect(mergeMasterMaterials([variant(1), variant(2)])['Hand']?.mColor).toBe(1);
  });

  it('rejects frame sequences that reference missing frames', () => {
    const base = items[0];
    if (base === undefined) throw new Error('fixture missing');
    expect(() =>
      buildXsi({ items: [{ ...base, mFrameSquence: [5] }], globalScale: 1, styleSheetTextureLinks: new Map(), exports: new Map() }),
    ).toThrow(XsiBuildError);
  });
});
