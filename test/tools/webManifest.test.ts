import { describe, expect, it } from 'vitest';
import en from '../../src/text/locales/en.json' with { type: 'json' };
import { webManifest } from '../../tools/build/webManifest.ts';

describe('web app manifest', () => {
  it('opens the game full screen in landscape with the names from en.json', () => {
    expect(webManifest(en)).toMatchObject({ name: 'Boxhead: 2Play Rooms', short_name: 'Boxhead 2Play', display: 'fullscreen', orientation: 'landscape', start_url: './' });
  });
});
