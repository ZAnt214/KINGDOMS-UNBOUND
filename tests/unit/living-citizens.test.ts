import { describe, expect, it } from 'vitest';
import { CITIZENS, citizenFrame, roleLabel } from '../../client/src/livingCitizens';

describe('citizens — ambiente medieval', () => {
  it('defines eight unique medieval roles and ids', () => {
    expect(CITIZENS).toHaveLength(8);
    expect(new Set(CITIZENS.map((n) => n.id)).size).toBe(8);
    expect(new Set(CITIZENS.map((n) => n.role)).size).toBe(8);
    expect(CITIZENS.every((n) => Boolean(roleLabel[n.role]))).toBe(true);
  });

  it('returns finite positions and a stable animation state', () => {
    for (const npc of CITIZENS) {
      for (const t of [0, 33, 500, 7000, 120000, 300000]) {
        const frame = citizenFrame(npc, t);
        expect(Number.isFinite(frame.tx)).toBe(true);
        expect(Number.isFinite(frame.ty)).toBe(true);
        expect(frame.facing === 1 || frame.facing === -1).toBe(true);
        expect(frame.tx).toBeGreaterThanOrEqual(0);
        expect(frame.ty).toBeGreaterThanOrEqual(0);
        expect(frame.tx).toBeLessThanOrEqual(14);
        expect(frame.ty).toBeLessThanOrEqual(14);
      }
    }
  });

  it('does not mutate the path and is deterministic for the same time', () => {
    for (const npc of CITIZENS) {
      const before = JSON.stringify(npc.path);
      expect(citizenFrame(npc, 12345)).toEqual(citizenFrame(npc, 12345));
      expect(JSON.stringify(npc.path)).toBe(before);
    }
  });

  it('has both working and moving states for every resident', () => {
    for (const npc of CITIZENS) {
      const frames = Array.from({ length: 1200 }, (_, i) => citizenFrame(npc, i * 250));
      expect(frames.some((f) => f.moving), npc.name).toBe(true);
      expect(frames.some((f) => !f.moving), npc.name).toBe(true);
    }
  });
});
