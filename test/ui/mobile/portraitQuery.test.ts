import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PORTRAIT_TOUCH_QUERY } from '../../../src/ui/mobile/tuning.ts';

const MOBILE_CSS = 'src/ui/mobile/mobile.css';
const MEDIA_RULE = '@media';

describe('portrait query', () => {
  it('is the media query that shows the rotate screen in mobile.css', () => {
    expect(readFileSync(MOBILE_CSS, 'utf8')).toContain(`${MEDIA_RULE} ${PORTRAIT_TOUCH_QUERY} {`);
  });
});
