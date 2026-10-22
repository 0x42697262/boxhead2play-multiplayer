import { describe, expect, it } from 'vitest';
import {
  cleanScript,
  frameIndexFromDirectory,
  isSelfHiding,
  parseRegisteredClasses,
  parseSoundRegistrations,
  parseStaticNumber,
  parseStaticNumberArray,
  parseStyleSheetTextureLinks,
  spriteIdFromDirectory,
} from './actionScript.ts';

describe('ActionScript parsing', () => {
  it('reads Object.registerClass calls in both forms', () => {
    const classes = parseRegisteredClasses([
      'var §\\x01§ = 807;\nObject.registerClass("World_Init_Wall",eval("World.Init.CWorld_Init_Wall"));',
      'Object.registerClass("Main", CMain);',
    ]);
    expect(Object.fromEntries(classes)).toEqual({ World_Init_Wall: 'World.Init.CWorld_Init_Wall', Main: 'CMain' });
  });

  it('removes deobfuscator noise lines and detects self-hiding clips', () => {
    const cleaned = cleanScript('var §\\x01§ = 66;\nvar §\\x0f§ = 1;\n_visible = false;\n');
    expect(cleaned).toBe('_visible = false;');
    expect(isSelfHiding(cleaned)).toBe(true);
    expect(isSelfHiding('   this._visible = false;')).toBe(false);
  });

  it('parses FFDec script directory names', () => {
    expect(spriteIdFromDirectory('DefineSprite_359_Screen_SelectWorld')).toBe(359);
    expect(spriteIdFromDirectory('DefineButton2_5')).toBeUndefined();
    expect(frameIndexFromDirectory('frame_21')).toBe(20);
  });

  it('reads static fields', () => {
    const source = 'static var Single_Exclusives = [0,0,1];\nstatic var mGlobalScale = 0.35;';
    expect(parseStaticNumberArray(source, 'Single_Exclusives')).toEqual([0, 0, 1]);
    expect(parseStaticNumber(source, 'mGlobalScale')).toBe(0.35);
  });

  it('reads CSound registrations', () => {
    const registrations = parseSoundRegistrations(
      'mSamples.Weapon_Pistol_Fire_wav = this.RegisterSound("sfx","Weapon.Pistol.Fire.wav",1,this.PlaySound_Positional,this.StopSound_Normal);',
    );
    expect(registrations).toEqual([
      { table: 'mSamples', key: 'Weapon_Pistol_Fire_wav', type: 'sfx', linkage: 'Weapon.Pistol.Fire.wav', volume: 1, playback: 'positional' },
    ]);
  });

  it('attributes style sheet texture links to their functions', () => {
    const links = parseStyleSheetTextureLinks(
      'static function SS_BAMBO()\n{\n_loc1_.mMaterials.Body_Back.mcLinkID = "Bambo_Body_Back";\n}\nstatic function SS_BOND()\n{\n_loc1_.mMaterials.Body_Back.mcLinkID = "Bond_Body_Back";\n}',
    );
    expect(Object.fromEntries(links)).toEqual({ Bambo_Body_Back: ['SS_BAMBO'], Bond_Body_Back: ['SS_BOND'] });
  });
});
