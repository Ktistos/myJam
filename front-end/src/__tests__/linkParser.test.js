import { describe, it, expect } from 'vitest';
import {
  detectPlaylistLinkService,
  detectSongLinkService,
  parsePlaylistLink,
  parsePlaylistText,
  parseSongLink,
} from '../helper_functions/linkParser';

describe('parseSongLink', () => {
  it('detects Spotify track links and delegates metadata lookup', async () => {
    const resolver = async () => ({
      title: 'Little Wing',
      artist: 'Jimi Hendrix',
      service: 'Spotify',
      original_url: 'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh',
    });
    const result = await parseSongLink('https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh', resolver);
    expect(result.title).toBe('Little Wing');
    expect(result.artist).toBe('Jimi Hendrix');
    expect(result.originalLink).toContain('spotify');
  });

  it('detects YouTube watch links', async () => {
    const result = await parseSongLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ', async () => ({
      title: 'Voodoo Child',
      artist: 'Jimi Hendrix',
      service: 'YouTube',
      original_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }));
    expect(result.title).toBe('Voodoo Child');
    expect(result.originalLink).toContain('youtube');
  });

  it('detects youtu.be short links', async () => {
    expect(detectSongLinkService('https://youtu.be/dQw4w9WgXcQ')).toBe('YouTube');
  });

  it('detects YouTube link with extra query params', async () => {
    expect(detectSongLinkService('https://www.youtube.com/watch?v=abc123&t=30')).toBe('YouTube');
  });

  it('throws for unrecognized links', async () => {
    await expect(parseSongLink('https://soundcloud.com/artist/track')).rejects.toThrow('Link not recognized');
  });

  it('throws for plain text (not a URL)', async () => {
    await expect(parseSongLink('not a link')).rejects.toThrow('Link not recognized');
  });

  it('throws for empty string', async () => {
    await expect(parseSongLink('')).rejects.toThrow('Link not recognized');
  });

  it('requires a metadata resolver after validating the URL', async () => {
    await expect(parseSongLink('https://open.spotify.com/track/abc123')).rejects.toThrow('metadata resolver');
  });

  it('preserves the original link in the result', async () => {
    const url = 'https://open.spotify.com/track/abc123';
    const result = await parseSongLink(url, async () => ({ title: 'Song', artist: 'Artist' }));
    expect(result.originalLink).toBe(url);
  });
});

describe('parsePlaylistLink', () => {
  it('detects Spotify playlist links and delegates metadata lookup', async () => {
    const url = 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd';
    const result = await parsePlaylistLink(url, async () => ({
      service: 'Spotify',
      original_url: url,
      songs: [
        { title: 'Use Me', artist: 'Bill Withers' },
        { title: '  ', artist: 'Ignored Artist' },
        { title: 'Valerie', artist: 'Amy Winehouse' },
      ],
    }));

    expect(result.service).toBe('Spotify');
    expect(result.originalLink).toBe(url);
    expect(result.songs).toEqual([
      { title: 'Use Me', artist: 'Bill Withers' },
      { title: 'Valerie', artist: 'Amy Winehouse' },
    ]);
  });

  it('detects YouTube playlist and watch-list links', async () => {
    expect(detectPlaylistLinkService('https://www.youtube.com/playlist?list=PL123')).toBe('YouTube');
    expect(detectPlaylistLinkService('https://music.youtube.com/watch?v=abc123&list=PL123')).toBe('YouTube');
  });

  it('rejects single song links for playlist import', async () => {
    await expect(parsePlaylistLink('https://open.spotify.com/track/abc123', async () => ({
      songs: [],
    }))).rejects.toThrow('playlist link');
  });

  it('requires a playlist resolver after validating the URL', async () => {
    await expect(parsePlaylistLink('https://open.spotify.com/playlist/abc123')).rejects.toThrow('Playlist metadata resolver');
  });
});

describe('parsePlaylistText', () => {
  it('parses numbered title-artist lines', () => {
    expect(parsePlaylistText('1. Little Wing - Jimi Hendrix\n2. Redbone - Childish Gambino')).toEqual([
      { title: 'Little Wing', artist: 'Jimi Hendrix' },
      { title: 'Redbone', artist: 'Childish Gambino' },
    ]);
  });

  it('parses pipe and by delimiters', () => {
    expect(parsePlaylistText('Use Me | Bill Withers\nValerie by Amy Winehouse')).toEqual([
      { title: 'Use Me', artist: 'Bill Withers' },
      { title: 'Valerie', artist: 'Amy Winehouse' },
    ]);
  });

  it('parses alternating title and artist lines', () => {
    expect(parsePlaylistText('Little Wing\nJimi Hendrix\nRedbone\nChildish Gambino')).toEqual([
      { title: 'Little Wing', artist: 'Jimi Hendrix' },
      { title: 'Redbone', artist: 'Childish Gambino' },
    ]);
  });

  it('deduplicates repeated songs and ignores links', () => {
    expect(parsePlaylistText('Little Wing - Jimi Hendrix\nhttps://spotify.com/playlist/123\nLittle Wing - Jimi Hendrix')).toEqual([
      { title: 'Little Wing', artist: 'Jimi Hendrix' },
    ]);
  });
});
