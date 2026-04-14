import { describe, it, expect } from 'vitest';
import { getDistanceKm, formatDistance } from '../utils/geo';

describe('getDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(getDistanceKm(51.5, -0.1, 51.5, -0.1)).toBeCloseTo(0, 5);
  });

  it('calculates distance between London and Paris (~340 km)', () => {
    const dist = getDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(330);
    expect(dist).toBeLessThan(350);
  });

  it('calculates NY to LA (~3940 km)', () => {
    const dist = getDistanceKm(40.7128, -74.006, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(3900);
    expect(dist).toBeLessThan(4000);
  });

  it('is symmetric — A→B equals B→A', () => {
    const d1 = getDistanceKm(40.7128, -74.006, 34.0522, -118.2437);
    const d2 = getDistanceKm(34.0522, -118.2437, 40.7128, -74.006);
    expect(d1).toBeCloseTo(d2, 3);
  });

  it('handles negative latitudes (southern hemisphere)', () => {
    // Sydney to Melbourne (~714 km)
    const dist = getDistanceKm(-33.8688, 151.2093, -37.8136, 144.9631);
    expect(dist).toBeGreaterThan(700);
    expect(dist).toBeLessThan(730);
  });

  it('handles crossing the antimeridian (lon wraps near ±180)', () => {
    // Two close points either side of 180° lon — should be small, not huge
    const dist = getDistanceKm(0, 179.9, 0, -179.9);
    expect(dist).toBeLessThan(30);
  });

  it('handles poles — both at north pole is 0', () => {
    expect(getDistanceKm(90, 0, 90, 0)).toBeCloseTo(0, 1);
  });

  it('returns a positive number for any distinct points', () => {
    expect(getDistanceKm(10, 20, 30, 40)).toBeGreaterThan(0);
  });
});

describe('formatDistance', () => {
  it('returns empty string for null', () => {
    expect(formatDistance(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDistance(undefined)).toBe('');
  });

  it('returns metres for 0 km', () => {
    expect(formatDistance(0)).toBe('0 m');
  });

  it('returns metres for distances under 1 km', () => {
    expect(formatDistance(0.3)).toBe('300 m');
    expect(formatDistance(0.999)).toBe('999 m');
    expect(formatDistance(0.5)).toBe('500 m');
  });

  it('rounds metres correctly', () => {
    expect(formatDistance(0.1234)).toBe('123 m');
  });

  it('returns km with one decimal for exactly 1 km', () => {
    expect(formatDistance(1)).toBe('1.0 km');
  });

  it('returns km for distances >= 1 km', () => {
    expect(formatDistance(5.678)).toBe('5.7 km');
    expect(formatDistance(100)).toBe('100.0 km');
    expect(formatDistance(1.05)).toBe('1.1 km');
  });

  it('rounds km to 1 decimal', () => {
    expect(formatDistance(2.44)).toBe('2.4 km');
    expect(formatDistance(2.45)).toBe('2.5 km');
  });
});
