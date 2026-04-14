import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteJam, getJamByCode, importPlaylistMetadata } from '../services/api';

vi.mock('../services/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(() => Promise.resolve('token-123')),
    },
  },
}));

describe('api request wrapper', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not try to parse JSON for successful 204 responses', async () => {
    const json = vi.fn();
    fetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: vi.fn(() => null) },
      json,
    });

    await expect(deleteJam('jam-1')).resolves.toBeNull();
    expect(json).not.toHaveBeenCalled();
  });

  it('unwraps object-valued detail into err.message and preserves err.detail', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 409,
      headers: { get: vi.fn(() => 'application/json') },
      json: vi.fn(() => Promise.resolve({
        detail: {
          code: 'spotify_auth_required',
          authenticated: true,
          message: 'Private playlist — connect Spotify.',
        },
      })),
    });

    await expect(importPlaylistMetadata('https://open.spotify.com/playlist/x'))
      .rejects.toMatchObject({
        message: 'Private playlist — connect Spotify.',
        status: 409,
        detail: { code: 'spotify_auth_required', authenticated: true },
      });
  });

  it('falls back to JSON.stringify when object detail has no message field', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 418,
      headers: { get: vi.fn(() => 'application/json') },
      json: vi.fn(() => Promise.resolve({ detail: { code: 'teapot' } })),
    });

    await expect(importPlaylistMetadata('https://open.spotify.com/playlist/x'))
      .rejects.toMatchObject({ message: '{"code":"teapot"}', status: 418 });
  });

  it('encodes invite codes before putting them in the URL path', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn(() => 'application/json') },
      json: vi.fn(() => Promise.resolve({ id: 'jam-1' })),
    });

    await getJamByCode('ab cd/12');

    expect(fetch.mock.calls[0][0]).toBe('http://localhost:8000/jams/invite/ab%20cd%2F12');
  });
});
