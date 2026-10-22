import { describe, expect, it } from 'vitest';
import { ExtractConfigError, parseExtractConfig } from './config.ts';

describe('parseExtractConfig', () => {
  it('applies defaults relative to the working directory', () => {
    expect(parseExtractConfig({}, '/repo')).toEqual({
      swfPath: '/repo/boxhead2play.swf',
      ffdecJar: '/repo/scripts/local/ffdec/ffdec.jar',
      outDir: '/repo/public/assets',
    });
  });

  it('accepts overrides', () => {
    expect(parseExtractConfig({ SWF_PATH: '/data/game.swf', ASSET_OUT_DIR: 'out' }, '/repo')).toMatchObject({
      swfPath: '/data/game.swf',
      outDir: '/repo/out',
    });
  });

  it('rejects blank values', () => {
    expect(() => parseExtractConfig({ FFDEC_JAR: '  ' }, '/repo')).toThrow(ExtractConfigError);
  });
});
