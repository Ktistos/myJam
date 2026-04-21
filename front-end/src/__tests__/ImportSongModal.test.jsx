import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportSongModal from '../components/ImportSongModal';
import { parsePlaylistLink, parseSongLink } from '../helper_functions/linkParser';
import { createSpotifyLoginUrl } from '../services/api';

vi.mock('../helper_functions/linkParser', () => ({
  detectPlaylistLinkService: vi.fn((url) => {
    if (url.includes('spotify.com/playlist')) return 'Spotify';
    if (url.includes('youtube.com')) return 'YouTube';
    throw new Error('Link not recognized. Use a Spotify or YouTube playlist link.');
  }),
  parsePlaylistLink: vi.fn(),
  parseSongLink: vi.fn(),
}));

vi.mock('../services/api', () => ({
  importPlaylistMetadata: vi.fn(),
  importSongMetadata: vi.fn(),
  createSpotifyLoginUrl: vi.fn(),
}));

const setup = (overrides = {}) => {
  const props = {
    onClose: vi.fn(),
    onImport: vi.fn(),
    ...overrides,
  };
  render(<ImportSongModal {...props} />);
  return props;
};

describe('ImportSongModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onClose when cancel is clicked', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('does nothing when import is clicked with an empty input', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /import song/i }));
    expect(parseSongLink).not.toHaveBeenCalled();
    expect(props.onImport).not.toHaveBeenCalled();
  });

  it('imports parsed song data and closes the modal', async () => {
    parseSongLink.mockResolvedValue({ title: 'Little Wing', artist: 'Jimi Hendrix' });
    const props = setup();

    await userEvent.type(screen.getByPlaceholderText(/spotify|youtube/i), 'https://youtube.com/watch?v=123');
    await userEvent.click(screen.getByRole('button', { name: /import song/i }));

    expect(parseSongLink).toHaveBeenCalledWith('https://youtube.com/watch?v=123', expect.any(Function));
    expect(props.onImport).toHaveBeenCalledWith('Little Wing', 'Jimi Hendrix');
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('shows an error when parsing fails', async () => {
    parseSongLink.mockRejectedValue(new Error('Unsupported link'));
    setup();

    await userEvent.type(screen.getByPlaceholderText(/spotify|youtube/i), 'bad-link');
    await userEvent.click(screen.getByRole('button', { name: /import song/i }));

    expect(await screen.findByText('Unsupported link')).toBeInTheDocument();
  });

  it('shows the loading state while fetching metadata', async () => {
    let resolveImport;
    parseSongLink.mockImplementation(() => new Promise((resolve) => { resolveImport = resolve; }));
    setup();

    await userEvent.type(screen.getByPlaceholderText(/spotify|youtube/i), 'https://open.spotify.com/track/1');
    await userEvent.click(screen.getByRole('button', { name: /import song/i }));

    expect(screen.getByRole('button', { name: /importing/i })).toBeDisabled();
    resolveImport({ title: 'Song', artist: 'Artist' });
    expect(await screen.findByRole('button', { name: /import song/i })).toBeInTheDocument();
  });

  it('imports multiple manually entered songs from fixed title and artist rows', async () => {
    const props = setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /manual entry/i }));
    await userEvent.type(screen.getByLabelText(/manual song 1 title/i), 'Little Wing');
    await userEvent.type(screen.getByLabelText(/manual song 1 artist/i), 'Jimi Hendrix');
    await userEvent.type(screen.getByLabelText(/manual song 2 title/i), 'Redbone');
    await userEvent.type(screen.getByLabelText(/manual song 2 artist/i), 'Childish Gambino');

    await userEvent.click(screen.getByRole('button', { name: /import 2 songs/i }));

    expect(props.onImportMany).toHaveBeenCalledWith([
      { title: 'Little Wing', artist: 'Jimi Hendrix' },
      { title: 'Redbone', artist: 'Childish Gambino' },
    ]);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('previews a playlist link and imports selected songs', async () => {
    parsePlaylistLink.mockResolvedValue({
      service: 'Spotify',
      originalLink: 'https://open.spotify.com/playlist/mock-playlist-id',
      songs: [
        { title: 'Use Me', artist: 'Bill Withers' },
        { title: 'Valerie', artist: 'Amy Winehouse' },
      ],
    });
    const props = setup({ onImportMany: vi.fn(), spotifyStatus: { connected: true } });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/playlist/i),
      'https://open.spotify.com/playlist/mock-playlist-id',
    );
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

    expect(parsePlaylistLink).toHaveBeenCalledWith(
      'https://open.spotify.com/playlist/mock-playlist-id',
      expect.any(Function),
    );
    expect(await screen.findByDisplayValue('Use Me')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Valerie')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /import 2 songs/i }));

    expect(props.onImportMany).toHaveBeenCalledWith([
      { title: 'Use Me', artist: 'Bill Withers' },
      { title: 'Valerie', artist: 'Amy Winehouse' },
    ]);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('lets the user edit and remove previewed playlist songs before importing', async () => {
    parsePlaylistLink.mockResolvedValue({
      service: 'YouTube',
      originalLink: 'https://youtube.com/playlist?list=123',
      songs: [
        { title: 'Little Wing', artist: 'Jimi Hendrix' },
        { title: 'Redbone', artist: 'Childish Gambino' },
      ],
    });
    const props = setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    await userEvent.type(screen.getByPlaceholderText(/playlist/i), 'https://youtube.com/playlist?list=123');
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));
    await userEvent.clear(screen.getByLabelText(/song 1 title/i));
    await userEvent.type(screen.getByLabelText(/song 1 title/i), 'Little Wing (Live)');
    await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[1]);
    await userEvent.click(screen.getByRole('button', { name: /import 1 songs/i }));

    expect(props.onImportMany).toHaveBeenCalledWith([
      { title: 'Little Wing (Live)', artist: 'Jimi Hendrix' },
    ]);
  });

  it('offers Spotify connection before previewing an unconnected Spotify playlist', async () => {
    createSpotifyLoginUrl.mockResolvedValue({ url: 'https://accounts.spotify.com/authorize?x=1' });
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });

    try {
      setup({ onImportMany: vi.fn(), isAuthenticated: true });

      await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
      await userEvent.type(
        screen.getByPlaceholderText(/playlist/i),
        'https://open.spotify.com/playlist/private',
      );

      const connectButton = screen.getByRole('button', { name: /connect spotify/i });
      expect(screen.getByText(/private, collaborative, or full playlist/i)).toBeInTheDocument();
      await userEvent.click(connectButton);

      expect(createSpotifyLoginUrl).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(assignSpy).toHaveBeenCalledWith('https://accounts.spotify.com/authorize?x=1'));
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('continues without Spotify for a public Spotify playlist fallback', async () => {
    parsePlaylistLink.mockResolvedValue({
      service: 'Spotify',
      originalLink: 'https://open.spotify.com/playlist/public',
      songs: [{ title: 'Public Song', artist: 'Public Artist' }],
    });
    setup({ onImportMany: vi.fn(), isAuthenticated: true });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/playlist/i),
      'https://open.spotify.com/playlist/public',
    );
    await userEvent.click(screen.getByRole('button', { name: /continue without spotify/i }));

    expect(parsePlaylistLink).toHaveBeenCalledWith(
      'https://open.spotify.com/playlist/public',
      expect.any(Function),
    );
    expect(await screen.findByDisplayValue('Public Song')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Public Artist')).toBeInTheDocument();
  });

  it('shows a sign-in hint (no Connect button) when anonymous user hits private-playlist auth required', async () => {
    const err = new Error('Sign in prompt');
    err.status = 409;
    err.detail = {
      code: 'spotify_auth_required',
      authenticated: false,
      message: 'We couldn\'t read this Spotify playlist. If it\'s private, sign in and connect Spotify and try again. Otherwise, double-check the link.',
    };
    parsePlaylistLink.mockRejectedValue(err);
    setup({ onImportMany: vi.fn(), isAuthenticated: false });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/playlist/i),
      'https://open.spotify.com/playlist/private',
    );
    await userEvent.click(screen.getByRole('button', { name: /continue without spotify/i }));

    expect(await screen.findByText(/sign in to myJam to link your Spotify/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect spotify/i })).not.toBeInTheDocument();
  });

  it('clears the Spotify auth prompt when the user edits the playlist link', async () => {
    const err = new Error('Private');
    err.status = 409;
    err.detail = {
      code: 'spotify_auth_required',
      authenticated: true,
      message: 'Auth required',
    };
    parsePlaylistLink.mockRejectedValue(err);
    setup({ onImportMany: vi.fn(), isAuthenticated: true });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    const input = screen.getByPlaceholderText(/playlist/i);
    await userEvent.type(input, 'https://open.spotify.com/playlist/private');
    await userEvent.click(screen.getByRole('button', { name: /continue without spotify/i }));

    expect(await screen.findByText(/Auth required/)).toBeInTheDocument();
    await userEvent.type(input, '-updated');
    expect(screen.queryByText(/Auth required/)).not.toBeInTheDocument();
  });

  it('imports a youtu.be short link as a YouTube song without showing a Spotify prompt', async () => {
    parseSongLink.mockResolvedValue({ title: 'Redbone', artist: 'Childish Gambino' });
    const props = setup();

    await userEvent.type(screen.getByPlaceholderText(/spotify|youtube/i), 'https://youtu.be/abc123');
    await userEvent.click(screen.getByRole('button', { name: /import song/i }));

    expect(parseSongLink).toHaveBeenCalledWith('https://youtu.be/abc123', expect.any(Function));
    expect(props.onImport).toHaveBeenCalledWith('Redbone', 'Childish Gambino');
    expect(screen.queryByRole('button', { name: /connect spotify/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue without spotify/i })).not.toBeInTheDocument();
  });

  it('previews a YouTube playlist without requiring the Spotify confirmation step', async () => {
    parsePlaylistLink.mockResolvedValue({
      service: 'YouTube',
      originalLink: 'https://youtube.com/playlist?list=PL123',
      songs: [
        { title: 'Use Me', artist: 'Bill Withers' },
        { title: 'Valerie', artist: 'Amy Winehouse' },
      ],
    });
    const props = setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/playlist/i),
      'https://youtube.com/playlist?list=PL123',
    );

    expect(screen.queryByRole('button', { name: /continue without spotify/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect spotify/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

    expect(await screen.findByDisplayValue('Use Me')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Valerie')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /import 2 songs/i }));
    expect(props.onImportMany).toHaveBeenCalledWith([
      { title: 'Use Me', artist: 'Bill Withers' },
      { title: 'Valerie', artist: 'Amy Winehouse' },
    ]);
  });

  it('shows an error when a YouTube playlist link returns no songs', async () => {
    parsePlaylistLink.mockResolvedValue({
      service: 'YouTube',
      originalLink: 'https://youtube.com/playlist?list=empty',
      songs: [],
    });
    setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    await userEvent.type(screen.getByPlaceholderText(/playlist/i), 'https://youtube.com/playlist?list=empty');
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

    expect(await screen.findByText(/could not read any songs/i)).toBeInTheDocument();
  });

  it('surfaces the YouTube parse error message when preview fails', async () => {
    parsePlaylistLink.mockRejectedValue(new Error('Could not read songs from YouTube playlist'));
    setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/playlist/i),
      'https://youtube.com/playlist?list=broken',
    );
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

    expect(await screen.findByText(/Could not read songs from YouTube playlist/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect spotify/i })).not.toBeInTheDocument();
  });

  it('blocks manual import when a row is missing title or artist', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: /manual entry/i }));
    await userEvent.type(screen.getByLabelText(/manual song 1 title/i), 'Not Enough Data');

    expect(screen.getByText(/complete or remove rows/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import songs/i })).toBeDisabled();
  });
});
