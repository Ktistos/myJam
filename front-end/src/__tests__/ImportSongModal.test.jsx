import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportSongModal from '../components/ImportSongModal';
import { parsePlaylistLink, parsePlaylistText, parseSongLink } from '../helper_functions/linkParser';
import { createSpotifyLoginUrl } from '../services/api';

vi.mock('../helper_functions/linkParser', () => ({
  parsePlaylistLink: vi.fn(),
  parsePlaylistText: vi.fn(),
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

  it('previews playlist text and imports multiple selected songs', async () => {
    parsePlaylistText.mockReturnValue([
      { title: 'Little Wing', artist: 'Jimi Hendrix' },
      { title: 'Redbone', artist: 'Childish Gambino' },
    ]);
    const props = setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /playlist text/i }));
    await userEvent.type(screen.getByLabelText(/^playlist$/i), 'Little Wing - Jimi Hendrix');
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

    expect(parsePlaylistText).toHaveBeenCalledWith('Little Wing - Jimi Hendrix');
    expect(screen.getByDisplayValue('Little Wing')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Redbone')).toBeInTheDocument();

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
    const props = setup({ onImportMany: vi.fn() });

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
    parsePlaylistText.mockReturnValue([
      { title: 'Little Wing', artist: 'Jimi Hendrix' },
      { title: 'Redbone', artist: 'Childish Gambino' },
    ]);
    const props = setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /playlist text/i }));
    await userEvent.type(screen.getByLabelText(/^playlist$/i), 'playlist');
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));
    await userEvent.clear(screen.getByLabelText(/song 1 title/i));
    await userEvent.type(screen.getByLabelText(/song 1 title/i), 'Little Wing (Live)');
    await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[1]);
    await userEvent.click(screen.getByRole('button', { name: /import 1 songs/i }));

    expect(props.onImportMany).toHaveBeenCalledWith([
      { title: 'Little Wing (Live)', artist: 'Jimi Hendrix' },
    ]);
  });

  it('shows a Connect Spotify prompt when the backend signals private-playlist auth required', async () => {
    const err = new Error('We couldn\'t read this Spotify playlist.');
    err.status = 409;
    err.detail = {
      code: 'spotify_auth_required',
      authenticated: true,
      message: 'We couldn\'t read this Spotify playlist. If it\'s private, connect your Spotify account and try again. Otherwise, double-check the link.',
    };
    parsePlaylistLink.mockRejectedValue(err);
    createSpotifyLoginUrl.mockResolvedValue({ url: 'https://accounts.spotify.com/authorize?x=1' });
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });

    try {
      setup({ onImportMany: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
      await userEvent.type(
        screen.getByPlaceholderText(/playlist/i),
        'https://open.spotify.com/playlist/private',
      );
      await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

      const connectButton = await screen.findByRole('button', { name: /connect spotify/i });
      expect(screen.getByText(/connect your Spotify account/i)).toBeInTheDocument();
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

  it('shows a sign-in hint (no Connect button) when anonymous user hits private-playlist auth required', async () => {
    const err = new Error('Sign in prompt');
    err.status = 409;
    err.detail = {
      code: 'spotify_auth_required',
      authenticated: false,
      message: 'We couldn\'t read this Spotify playlist. If it\'s private, sign in and connect Spotify and try again. Otherwise, double-check the link.',
    };
    parsePlaylistLink.mockRejectedValue(err);
    setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/playlist/i),
      'https://open.spotify.com/playlist/private',
    );
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

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
    setup({ onImportMany: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /playlist link/i }));
    const input = screen.getByPlaceholderText(/playlist/i);
    await userEvent.type(input, 'https://open.spotify.com/playlist/private');
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

    expect(await screen.findByText(/Auth required/)).toBeInTheDocument();
    await userEvent.type(input, '-updated');
    expect(screen.queryByText(/Auth required/)).not.toBeInTheDocument();
  });

  it('shows an error when playlist text has no parseable songs', async () => {
    parsePlaylistText.mockReturnValue([]);
    setup();

    await userEvent.click(screen.getByRole('button', { name: /playlist text/i }));
    await userEvent.type(screen.getByLabelText(/^playlist$/i), 'not enough data');
    await userEvent.click(screen.getByRole('button', { name: /preview playlist/i }));

    expect(screen.getByText(/paste at least one song/i)).toBeInTheDocument();
  });
});
