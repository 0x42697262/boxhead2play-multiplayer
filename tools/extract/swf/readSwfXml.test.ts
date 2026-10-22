import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml/parseXml.ts';
import { readColorTransform, readControlTag, readFilter, readMatrix, readSwfXml, stripNulTerminator, SwfXmlError } from './readSwfXml.ts';

const element = (xml: string) => parseXml(xml);

describe('readMatrix', () => {
  it('maps scaleX/rotateSkew0/rotateSkew1/scaleY to a/b/c/d and keeps twips', () => {
    const matrix = readMatrix(
      element(
        '<matrix hasRotate="true" hasScale="true" scaleX="0.0" scaleY="0.0" rotateSkew0="-1.0" rotateSkew1="1.0" translateX="7003" translateY="8721"/>',
      ),
    );
    expect(matrix).toEqual({ a: 0, b: -1, c: 1, d: 0, tx: 7003, ty: 8721 });
  });

  it('defaults absent scale and rotation', () => {
    expect(readMatrix(element('<matrix hasRotate="false" hasScale="false" translateX="20" translateY="40"/>'))).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      tx: 20,
      ty: 40,
    });
  });
});

describe('readColorTransform', () => {
  it('converts 8.8 multipliers and keeps add terms', () => {
    const transform = readColorTransform(
      element('<c hasMultTerms="true" hasAddTerms="true" redMultTerm="128" greenMultTerm="256" blueMultTerm="256" alphaMultTerm="64" redAddTerm="5"/>'),
    );
    expect(transform).toMatchObject({ rMult: 0.5, gMult: 1, aMult: 0.25, rAdd: 5, gAdd: 0 });
  });
});

describe('readFilter', () => {
  it('converts attributes, colors and lists generically', () => {
    const filter = readFilter(
      element(
        '<item type="GRADIENTGLOWFILTER" id="4" blurX="16.0" knockout="false"><gradientColors><item type="RGBA" alpha="0" blue="0" green="255" red="255"/></gradientColors><gradientRatio><item>0</item><item>210</item></gradientRatio></item>',
      ),
    );
    expect(filter).toEqual({
      type: 'gradientGlow',
      blurX: 16,
      knockout: false,
      gradientColors: [{ r: 255, g: 255, b: 0, a: 0 }],
      gradientRatio: [0, 210],
    });
  });
});

describe('readControlTag', () => {
  it('reads PlaceObject2 flags', () => {
    const tag = readControlTag(
      element(
        '<item type="PlaceObject2Tag" characterId="98" depth="199" name="_Size" placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagHasName="true" placeFlagMove="false"><matrix hasRotate="false" hasScale="false" translateX="0" translateY="0"/></item>',
      ),
    );
    expect(tag).toMatchObject({ kind: 'place', depth: 199, characterId: 98, name: '_Size', move: false });
  });

  it('reads a move without character', () => {
    const tag = readControlTag(element('<item type="PlaceObject2Tag" depth="1" placeFlagMove="true" placeFlagHasRatio="true" ratio="9"/>'));
    expect(tag).toEqual({ kind: 'place', depth: 1, move: true, hasClipActions: false, ratio: 9 });
  });
});

describe('readSwfXml', () => {
  it('reads characters, exports and the root timeline', () => {
    const document = readSwfXml(
      element(
        '<swf _xmlExportMajor="4" _generator="FFDec" version="8" frameRate="25.0" frameCount="1"><displayRect Xmin="0" Ymin="0" Xmax="12800" Ymax="9600"/><tags>' +
          '<item type="DefineShapeTag" shapeId="1"><shapeBounds Xmin="0" Ymin="0" Xmax="200" Ymax="100"/></item>' +
          '<item type="DefineSpriteTag" spriteId="2" frameCount="1"><subTags><item type="PlaceObject2Tag" characterId="1" depth="1" placeFlagHasCharacter="true"/><item type="ShowFrameTag"/></subTags></item>' +
          '<item type="ExportAssetsTag"><tags><item>2</item></tags><names><item>Thing</item></names></item>' +
          '<item type="ShowFrameTag"/></tags></swf>',
      ),
    );
    expect(document.exports.get('Thing')).toBe(2);
    expect(document.characters.get(1)).toMatchObject({ kind: 'shape', bounds: { xMax: 200 } });
    expect(document.characters.get(2)).toMatchObject({ kind: 'sprite', frameCount: 1 });
    expect(document.root.tags).toEqual([{ kind: 'showFrame' }]);
  });

  it('rejects unknown FFDec XML versions', () => {
    expect(() => readSwfXml(element('<swf _xmlExportMajor="3"/>'))).toThrow(SwfXmlError);
  });

  it('strips escaped and literal NUL font name terminators', () => {
    expect(stripNulTerminator('Trebuchet MS\\u0000')).toBe('Trebuchet MS');
    expect(stripNulTerminator(`Calibri${String.fromCharCode(0)}`)).toBe('Calibri');
  });
});
