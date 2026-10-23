import { describe, expect, it } from 'vitest';
import { buildXsiDrawing, drawingBounds, indexSets, newestFirst, shadeFill } from '../../../src/adapters/render/xsi/framePlanes.ts';
import { buildStyleSheet, textureLinkage } from '../../../src/adapters/render/xsi/styleSheets.ts';
import { collectionFrames } from '../../../src/adapters/render/xsi/XsiFrameCache.ts';
import { CharacterStyle, DEFAULT_STYLE_SCALE, DEVIL_STYLE_SCALE } from '../../../src/domain/visuals.ts';
import { assetsMissing, assetXsi } from '../assets/support.ts';

describe('XSI polygon lists', () => {
  it('visit arrays newest first like AS2 for..in', () => {
    expect(newestFirst([1, 2, 3])).toEqual([3, 2, 1]);
    expect(newestFirst(undefined)).toEqual([]);
  });

  it('shade with white or black at half the brightness', () => {
    expect(shadeFill(0)).toBeUndefined();
    expect(shadeFill(0.4)).toEqual({ kind: 'color', color: 0xffffff, alpha: 0.2 });
    expect(shadeFill(-0.94)).toEqual({ kind: 'color', color: 0x000000, alpha: 0.47 });
  });
});

describe('style sheets against the real XSI data', () => {
  it.skipIf(assetsMissing)('SS_SWAT remaps the head and feet and hides the gun marker', () => {
    const sheet = buildStyleSheet(CharacterStyle.Swat, assetXsi(), DEFAULT_STYLE_SCALE);
    expect(sheet.groupRemap).toBe('Player_Alternate1');
    expect(sheet.models.Head).toEqual({ visible: true, groupRemap: 'Player_Alternate1' });
    expect(sheet.models.GunPosition_Right?.visible).toBe(false);
    expect(sheet.models.Weapon_Right?.visible).toBe(true);
    expect(sheet.materials.Bandana?.mColor).toBe(0x000033);
    expect(sheet.materials.Cloth).toBeUndefined();
  });

  it.skipIf(assetsMissing)('falls back to the master texture when a head linkage is not exported', () => {
    const xsi = assetXsi();
    const sheet = buildStyleSheet(CharacterStyle.Swat, xsi, DEFAULT_STYLE_SCALE);
    const head = sheet.materials.Head_Front;
    expect(head?.mcLinkID).toBe('Swat_Head_Front');
    expect(head && textureLinkage(xsi, 'Head_Front', head)).toBe('Head_Front_MC');
    const body = sheet.materials.Body_Side;
    expect(body && textureLinkage(xsi, 'Body_Side', body)).toBe('Swat_Body_Side');
  });

  it.skipIf(assetsMissing)('SS_DEVIL hides the weapon and uses the devil scale', () => {
    const sheet = buildStyleSheet(CharacterStyle.Devil, assetXsi(), DEVIL_STYLE_SCALE);
    expect(sheet.models.Weapon_Right?.visible).toBe(false);
    expect(sheet.scale).toBe(0.42);
    expect(sheet.materials.Foot?.mColor).toBe(0);
  });
});

describe('XSI frame drawings against the real data', () => {
  it.skipIf(assetsMissing)('a SWAT pistol walk frame takes the head from Player_Alternate1 through the render partner', () => {
    const xsi = assetXsi();
    const index = indexSets(xsi);
    const sheet = buildStyleSheet(CharacterStyle.Swat, xsi, DEFAULT_STYLE_SCALE);
    const drawing = buildXsiDrawing(xsi, index, sheet, 'Player_Handgun_Walk', 0, 0);
    expect(drawing).toBeDefined();
    const names = drawing?.planes.map((plane) => plane.model) ?? [];
    expect(names).not.toContain('GunPosition_Right');
    expect(names).not.toContain('Body_Front');
    expect(names.at(-1)).toBe('Head');
    const alternateHead = xsi.sets.Player_Alternate1_Walk?.directions[0]?.[0]?.Models.Head?.Shape_vList ?? [];
    const head = drawing?.planes.at(-1);
    expect(head?.polygons.map((polygon) => polygon.points)).toEqual(newestFirst(alternateHead));
    const body = drawing?.planes.find((plane) => plane.model === 'Body');
    expect(body?.polygons.length).toBeGreaterThan(0);
    expect(body?.polygons.some((polygon) => polygon.fill.kind === 'texture')).toBe(true);
    expect(drawing?.shadows.length).toBeGreaterThan(0);
    expect(drawing?.edgeStyle).toEqual({ thickness: 2, color: 0, alpha: 1 });
    expect(drawing && drawingBounds(drawing)).not.toBeNull();
  });

  it.skipIf(assetsMissing)('draws the models of a frame bottom to top in reverse literal order, so the first listed model ends on top', () => {
    const xsi = assetXsi();
    const sheet = buildStyleSheet(CharacterStyle.Zombie, xsi, DEFAULT_STYLE_SCALE);
    const drawing = buildXsiDrawing(xsi, indexSets(xsi), sheet, 'Zombie_Zombie_Walk', 0, 0);
    const listed = Object.keys(xsi.sets.Zombie_Zombie_Walk?.directions[0]?.[0]?.Models ?? {}).filter((name) => sheet.models[name]?.visible !== false);
    expect(drawing?.planes.map((plane) => plane.model)).toEqual(listed.reverse());
  });

  it.skipIf(assetsMissing)('a zombie frame hides the weapon and remaps the head to the Zombie group', () => {
    const xsi = assetXsi();
    const sheet = buildStyleSheet(CharacterStyle.Zombie, xsi, DEFAULT_STYLE_SCALE);
    const drawing = buildXsiDrawing(xsi, indexSets(xsi), sheet, 'Player_Dying', 1, 2);
    const head = drawing?.planes.find((plane) => plane.model === 'Head');
    const zombieHead = xsi.sets.Zombie_Dying?.directions[1]?.[2]?.Models.Head?.Shape_vList ?? [];
    expect(head?.polygons.map((polygon) => polygon.points)).toEqual(newestFirst(zombieHead));
  });

  it.skipIf(assetsMissing)('lists every direction and source frame of a collection once', () => {
    const keys = collectionFrames(assetXsi(), { style: CharacterStyle.Zombie, styleScale: DEFAULT_STYLE_SCALE, setIds: ['Zombie_Zombie_Walk', 'Zombie_Zombie_Walk'] });
    expect(keys).toHaveLength(8 * 5);
  });
});
