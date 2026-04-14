import { describe, it, expect } from 'vitest';
import { instrumentLabel, INSTRUMENT_TYPES, SKILL_COLOR } from '../pages/Profile';

describe('instrumentLabel', () => {
  it('returns a plain string as-is', () => {
    expect(instrumentLabel('Guitar')).toBe('Guitar');
    expect(instrumentLabel('Drums')).toBe('Drums');
  });

  it('returns type when no model', () => {
    expect(instrumentLabel({ type: 'Bass Guitar', skill: 'Intermediate' })).toBe('Bass Guitar');
  });

  it('returns type — model when model is present', () => {
    expect(instrumentLabel({ type: 'Electric Guitar', model: 'Fender Strat' })).toBe('Electric Guitar — Fender Strat');
  });

  it('falls back to name when type is missing', () => {
    expect(instrumentLabel({ name: 'Theremin' })).toBe('Theremin');
  });

  it('supports backend hardware objects with an instrument field', () => {
    expect(instrumentLabel({ instrument: 'Saxophone' })).toBe('Saxophone');
  });

  it('returns empty string when type, instrument, and name are absent', () => {
    expect(instrumentLabel({})).toBe('');
  });

  it('type takes priority over name', () => {
    expect(instrumentLabel({ type: 'Drums', name: 'Old Name' })).toBe('Drums');
  });
});

describe('INSTRUMENT_TYPES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(INSTRUMENT_TYPES)).toBe(true);
    expect(INSTRUMENT_TYPES.length).toBeGreaterThan(0);
  });

  it('contains common instruments', () => {
    expect(INSTRUMENT_TYPES).toContain('Vocals');
    expect(INSTRUMENT_TYPES).toContain('Drums');
    expect(INSTRUMENT_TYPES).toContain('Electric Guitar');
    expect(INSTRUMENT_TYPES).toContain('Bass Guitar');
    expect(INSTRUMENT_TYPES).toContain('Keyboard');
  });

  it('has no duplicate entries', () => {
    expect(new Set(INSTRUMENT_TYPES).size).toBe(INSTRUMENT_TYPES.length);
  });
});

describe('SKILL_COLOR', () => {
  it('defines all four skill levels', () => {
    expect(SKILL_COLOR).toHaveProperty('Beginner');
    expect(SKILL_COLOR).toHaveProperty('Intermediate');
    expect(SKILL_COLOR).toHaveProperty('Advanced');
    expect(SKILL_COLOR).toHaveProperty('Professional');
  });

  it('each skill colour is a non-empty string', () => {
    Object.values(SKILL_COLOR).forEach((cls) => {
      expect(typeof cls).toBe('string');
      expect(cls.length).toBeGreaterThan(0);
    });
  });
});
