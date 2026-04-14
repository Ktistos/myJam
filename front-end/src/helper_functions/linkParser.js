export const detectSongLinkService = (url) => {
  const trimmed = url.trim();
  const spotifyRegex = /^https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/;
  if (spotifyRegex.test(trimmed)) return 'Spotify';

  const youtubeRegex = /^https?:\/\/(?:(?:www\.|music\.)?youtube\.com\/watch\?[^#]*\bv=|youtu\.be\/|(?:www\.)?youtube\.com\/(?:shorts|embed)\/)/;
  if (youtubeRegex.test(trimmed)) return 'YouTube';

  throw new Error('Link not recognized. Use a Spotify track link or YouTube video link.');
};

export const detectPlaylistLinkService = (url) => {
  const trimmed = url.trim();
  const spotifyRegex = /^https?:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/;
  if (spotifyRegex.test(trimmed)) return 'Spotify';

  const youtubeRegex = /^https?:\/\/(?:(?:www\.|music\.)?youtube\.com\/(?:playlist\?[^#]*\blist=|watch\?[^#]*\blist=))/;
  if (youtubeRegex.test(trimmed)) return 'YouTube';

  throw new Error('Link not recognized. Use a Spotify or YouTube playlist link.');
};

/**
 * Validates a Spotify/YouTube song link and delegates real metadata lookup.
 * The resolver is injected so tests can stay deterministic and the UI can use
 * the backend to avoid browser CORS issues.
 */
export const parseSongLink = async (url, metadataResolver) => {
  const service = detectSongLinkService(url);
  if (!metadataResolver) {
    throw new Error('Song metadata resolver is not configured.');
  }

  const songData = await metadataResolver(url.trim());
  return {
    title: songData.title,
    artist: songData.artist,
    service: songData.service ?? service,
    originalLink: songData.original_url ?? songData.originalLink ?? url.trim(),
  };
};

export const parsePlaylistLink = async (url, playlistResolver) => {
  const service = detectPlaylistLinkService(url);
  if (!playlistResolver) {
    throw new Error('Playlist metadata resolver is not configured.');
  }

  const playlistData = await playlistResolver(url.trim());
  const songs = (playlistData.songs || [])
    .map((song) => ({
      title: (song.title || '').trim(),
      artist: (song.artist || '').trim(),
    }))
    .filter((song) => song.title && song.artist);

  return {
    service: playlistData.service ?? service,
    originalLink: playlistData.original_url ?? playlistData.originalLink ?? url.trim(),
    songs,
  };
};

const stripPlaylistLineNoise = (line) =>
  line
    .trim()
    .replace(/^\s*(?:\d+[.)-]?|[-*\u2022])\s*/, '')
    .replace(/\s*(?:\[[0-9:]+\]|\([0-9:]+\))\s*$/, '')
    .trim();

const splitPlaylistLine = (line) => {
  const delimiters = [
    /\s+\u2014\s+/, // em dash
    /\s+\u2013\s+/, // en dash
    /\s+-\s+/,
    /\s+\|\s+/,
    /\s+by\s+/i,
  ];

  for (const delimiter of delimiters) {
    const parts = line.split(delimiter).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        title: parts[0],
        artist: parts.slice(1).join(' - '),
      };
    }
  }

  return null;
};

const looksLikeUrl = (line) => /^https?:\/\//i.test(line);

/**
 * Parses a pasted playlist/track list into song records.
 * Supported formats:
 *   1. Little Wing - Jimi Hendrix
 *   Little Wing | Jimi Hendrix
 *   Little Wing by Jimi Hendrix
 *   Little Wing
 *   Jimi Hendrix
 */
export const parsePlaylistText = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map(stripPlaylistLineNoise)
    .filter(Boolean);

  const songs = [];
  const seen = new Set();

  const addSong = (title, artist) => {
    const normalizedTitle = title.trim();
    const normalizedArtist = artist.trim();
    if (!normalizedTitle || !normalizedArtist) return;
    const key = `${normalizedTitle.toLowerCase()}|${normalizedArtist.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    songs.push({ title: normalizedTitle, artist: normalizedArtist });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (looksLikeUrl(line)) continue;

    const split = splitPlaylistLine(line);
    if (split) {
      addSong(split.title, split.artist);
      continue;
    }

    const nextLine = lines[i + 1];
    if (nextLine && !looksLikeUrl(nextLine) && !splitPlaylistLine(nextLine)) {
      addSong(line, nextLine);
      i += 1;
    }
  }

  return songs;
};
