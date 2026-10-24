import { describe, expect, it } from 'vitest';
import { ROOM_INVITE, ROOM_MEMBER_LINES, ROOM_MEMBERS } from '../../../src/ui/screens/online/tuning.ts';

const STAGE_WIDTH_PX = 640;
const STAGE_HEIGHT_PX = 480;
const TITLE_TOP_PX = 40;

describe('lobby room layout', () => {
  it('puts the copy-link line in the top-right corner, clear of the player list', () => {
    expect(ROOM_INVITE.align).toBe('right');
    expect(ROOM_INVITE.anchorX).toBeGreaterThan(STAGE_WIDTH_PX / 2);
    expect(ROOM_INVITE.anchorX).toBeLessThanOrEqual(STAGE_WIDTH_PX);
    expect(ROOM_INVITE.top).toBeLessThan(TITLE_TOP_PX);
    expect(ROOM_INVITE.top).toBeLessThan(ROOM_MEMBERS.top);
  });

  it('gives the player list 12 member lines below its heading, all on the stage', () => {
    expect(ROOM_MEMBER_LINES).toBe(12);
    expect(ROOM_MEMBERS.top + (ROOM_MEMBER_LINES + 1) * ROOM_MEMBERS.lineHeight).toBeLessThanOrEqual(STAGE_HEIGHT_PX);
  });
});
