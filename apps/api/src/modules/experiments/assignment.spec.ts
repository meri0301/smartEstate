import type { ExperimentArm } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import { assign, subjectOf } from './assignment.js';

const arm = (name: string, weight = 1): ExperimentArm => ({
  name,
  strategy: 'MCDA',
  method: name === 'A' ? 'WEIGHTED_SUM' : 'TOPSIS',
  weight,
});

const AB = [arm('A'), arm('B')];

describe('subjectOf', () => {
  it('prefers a signed-in user to a browser', () => {
    expect(subjectOf('user-1', 'anon-1')).toBe('user:user-1');
  });

  it('falls back to the anonymous browser', () => {
    expect(subjectOf(undefined, 'anon-1')).toBe('anon:anon-1');
  });

  it('refuses to invent a subject', () => {
    // A random assignment would be an experiment on nobody.
    expect(subjectOf(undefined, undefined)).toBeUndefined();
    expect(subjectOf(undefined, '   ')).toBeUndefined();
  });

  it('keeps users and browsers in separate namespaces', () => {
    expect(subjectOf('x', undefined)).not.toBe(subjectOf(undefined, 'x'));
  });
});

describe('assign', () => {
  it('is sticky: the same subject always gets the same arm', () => {
    const first = assign('ranking-method', 'user:1', AB);
    for (let i = 0; i < 20; i += 1) {
      expect(assign('ranking-method', 'user:1', AB)).toBe(first);
    }
  });

  it('is independent across experiments', () => {
    // Being in A here must not put a subject in A everywhere, or every
    // experiment would be measuring the same split of people.
    const subjects = Array.from({ length: 200 }, (_u, i) => `user:${String(i)}`);
    const agree = subjects.filter(
      (subject) => assign('one', subject, AB).name === assign('two', subject, AB).name,
    ).length;

    expect(agree).toBeGreaterThan(60);
    expect(agree).toBeLessThan(140);
  });

  it('splits an equal allocation roughly in half', () => {
    const subjects = Array.from({ length: 2000 }, (_u, i) => `anon:${String(i)}`);
    const inA = subjects.filter((subject) => assign('k', subject, AB).name === 'A').length;

    expect(inA).toBeGreaterThan(900);
    expect(inA).toBeLessThan(1100);
  });

  it('honours unequal weights', () => {
    const skewed = [arm('A', 3), arm('B', 1)];
    const subjects = Array.from({ length: 2000 }, (_u, i) => `anon:${String(i)}`);
    const inA = subjects.filter((subject) => assign('k', subject, skewed).name === 'A').length;

    expect(inA).toBeGreaterThan(1400);
    expect(inA).toBeLessThan(1600);
  });

  it('assigns every subject to some arm', () => {
    const three = [arm('A'), arm('B'), { ...arm('C'), method: 'TOPSIS' as const }];
    for (let i = 0; i < 500; i += 1) {
      expect(['A', 'B', 'C']).toContain(assign('k', `s${String(i)}`, three).name);
    }
  });

  it('refuses an experiment with no arms', () => {
    expect(() => assign('k', 'user:1', [])).toThrow(/no arms/);
  });
});
