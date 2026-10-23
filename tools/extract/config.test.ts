import { describe, expect, it } from 'vitest';
import { ExtractConfigError, parseExtractConfig } from './config.ts';

describe('parseExtractConfig', () => {
  it('applies defaults relative to the working directory', () => {
    expect(parseExtractConfig({}, '/repo')).toEqual({
      swfPath: '/repo/boxhead2play.swf',
      ffdecJar: undefined,
      outDir: '/repo/public/assets',
    });
  });

  it('accepts overrides', () => {
    expect(parseExtractConfig({ SWF_PATH: '/data/game.swf', ASSET_OUT_DIR: 'out' }, '/repo')).toMatchObject({
      swfPath: '/data/game.swf',
      outDir: '/repo/out',
    });
  });

  it('resolves an explicit FFDec jar', () => {
    expect(parseExtractConfig({ FFDEC_JAR: 'tools/ffdec.jar' }, '/repo').ffdecJar).toBe('/repo/tools/ffdec.jar');
  });

  it('rejects blank values', () => {
    expect(() => parseExtractConfig({ FFDEC_JAR: '  ' }, '/repo')).toThrow(ExtractConfigError);
  });
});
