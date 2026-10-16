import { describe, expect, it } from 'vitest';
import { drawCategory, standings } from './draws';

describe('draw categories', () => {
  it('classifies IRCC draw names', () => {
    expect(drawCategory('Canadian Experience Class')).toBe('cec');
    expect(drawCategory('French language proficiency (2025-1)')).toBe('french');
    expect(drawCategory('Healthcare and social services occupations (2025-1)')).toBe('healthcare');
    expect(drawCategory('Provincial Nominee Program')).toBe('pnp');
    expect(drawCategory('No Program Specified')).toBe('general');
    expect(drawCategory('Trade occupations (2025-1)')).toBe('trades');
  });
  it('compares your score with the latest eligible draws', () => {
    const draws = [
      { number: 3, date: '2026-10-01', name: 'Canadian Experience Class', size: 2000, crs: 520 },
      { number: 2, date: '2026-09-01', name: 'Canadian Experience Class', size: 2000, crs: 510 },
      { number: 1, date: '2026-09-15', name: 'French language proficiency', size: 1000, crs: 430 },
      { number: 0, date: '2026-09-20', name: 'Healthcare and social services occupations', size: 500, crs: 470 },
    ];
    const s = standings(draws, new Set(['cec', 'french']), 500, '2026-10-16');
    expect(s.map((x) => [x.category, x.margin, x.count12m, x.min12m])).toEqual([
      ['french', 70, 1, 430],
      ['cec', -20, 2, 510],
    ]);
  });
});
