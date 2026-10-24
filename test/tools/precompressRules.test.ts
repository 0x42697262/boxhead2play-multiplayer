import { describe, expect, it } from 'vitest';
import { isCompressible, worthKeeping } from '../../tools/build/precompressRules.ts';

describe('precompress rules', () => {
  it('compresses text formats above the size floor only', () => {
    expect(isCompressible('dist/assets/characters/xsi.json', 3_656_836)).toBe(true);
    expect(isCompressible('dist/assets/library/shapes/1.svg', 4096)).toBe(true);
    expect(isCompressible('dist/assets/library/shapes/2.svg', 300)).toBe(false);
    expect(isCompressible('dist/assets/sounds/Weapon.Pistol.Fire.mp3', 20_000)).toBe(false);
    expect(isCompressible('dist/assets/fonts/2.woff', 20_000)).toBe(false);
    expect(isCompressible('dist/assets/characters/xsi.json.br', 400_000)).toBe(false);
  });

  it('keeps a variant only when it saves at least 10%', () => {
    expect(worthKeeping(1000, 900)).toBe(true);
    expect(worthKeeping(1000, 950)).toBe(false);
  });
});
