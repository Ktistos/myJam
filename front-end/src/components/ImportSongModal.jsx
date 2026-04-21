import React, { useMemo, useState } from 'react';
import {
  detectPlaylistLinkService,
  parsePlaylistLink,
  parseSongLink,
} from '../helper_functions/linkParser';
import { createSpotifyLoginUrl, importPlaylistMetadata, importSongMetadata } from '../services/api';

const emptyManualSongsMessage = 'Add at least one complete song with title and artist.';
const emptyPlaylistLinkMessage = 'Could not read any songs from that playlist link.';
const createManualSong = (id) => ({ id: `manual-${id}`, title: '', artist: '' });

const isSpotifyAuthRequired = (err) =>
  err && typeof err.detail === 'object' && err.detail?.code === 'spotify_auth_required';

const ImportSongModal = ({ onClose, onImport, onImportMany, isAuthenticated = false, spotifyStatus = { connected: false } }) => {
  const [mode, setMode] = useState('link');
  const [link, setLink] = useState('');
  const [playlistLink, setPlaylistLink] = useState('');
  const [manualSongs, setManualSongs] = useState([
    createManualSong(0),
    createManualSong(1),
    createManualSong(2),
  ]);
  const [manualSongSeq, setManualSongSeq] = useState(3);
  const [playlistSongs, setPlaylistSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [spotifyAuthPrompt, setSpotifyAuthPrompt] = useState(null);
  const [connectingSpotify, setConnectingSpotify] = useState(false);
  const [spotifyPublicFallbackConfirmed, setSpotifyPublicFallbackConfirmed] = useState(false);

  const selectedPreviewSongs = useMemo(
    () => playlistSongs.filter((song) => song.selected && song.title.trim() && song.artist.trim()),
    [playlistSongs],
  );
  const completeManualSongs = useMemo(
    () => manualSongs
      .map((song) => ({ ...song, title: song.title.trim(), artist: song.artist.trim() }))
      .filter((song) => song.title && song.artist),
    [manualSongs],
  );
  const hasIncompleteManualSongs = useMemo(
    () => manualSongs.some((song) => {
      const hasTitle = Boolean(song.title.trim());
      const hasArtist = Boolean(song.artist.trim());
      return hasTitle !== hasArtist;
    }),
    [manualSongs],
  );
  const playlistService = useMemo(() => {
    if (!playlistLink.trim()) return null;
    try {
      return detectPlaylistLinkService(playlistLink);
    } catch {
      return null;
    }
  }, [playlistLink]);
  const isSpotifyPlaylist = playlistService === 'Spotify';
  const spotifyConnected = Boolean(spotifyStatus?.connected);
  const needsSpotifyChoice = (
    mode === 'playlistLink'
    && isSpotifyPlaylist
    && !spotifyConnected
    && !spotifyPublicFallbackConfirmed
  );

  const handleImportLink = async () => {
    if (!link) return;

    setLoading(true);
    setError(null);
    setSpotifyAuthPrompt(null);

    try {
      const songData = await parseSongLink(link, importSongMetadata);
      await onImport(songData.title, songData.artist);
      onClose();
    } catch (err) {
      if (isSpotifyAuthRequired(err)) {
        setSpotifyAuthPrompt({
          message: err.detail.message,
          authenticated: Boolean(err.detail.authenticated),
        });
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const previewPlaylistLink = async ({ allowPublicSpotify = false } = {}) => {
    if (!playlistLink.trim()) return [];
    if (isSpotifyPlaylist && !spotifyConnected && !spotifyPublicFallbackConfirmed && !allowPublicSpotify) {
      setError('Choose how to import this Spotify playlist.');
      return [];
    }

    setLoading(true);
    setError(null);
    setSpotifyAuthPrompt(null);
    setPlaylistSongs([]);

    try {
      const playlistData = await parsePlaylistLink(playlistLink, importPlaylistMetadata);
      const songs = playlistData.songs.map((song, index) => ({
        ...song,
        id: `${song.title}-${song.artist}-${index}`,
        selected: true,
      }));
      setPlaylistSongs(songs);
      if (songs.length === 0) {
        setError(emptyPlaylistLinkMessage);
      }
      return songs;
    } catch (err) {
      if (isSpotifyAuthRequired(err)) {
        setSpotifyAuthPrompt({
          message: err.detail.message,
          authenticated: Boolean(err.detail.authenticated),
        });
      } else {
        setError(err.message || emptyPlaylistLinkMessage);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleConnectSpotify = async () => {
    setConnectingSpotify(true);
    setError(null);
    try {
      const { url } = await createSpotifyLoginUrl();
      window.location.assign(url);
    } catch (err) {
      setError(err.message || 'Could not start Spotify sign-in.');
      setConnectingSpotify(false);
    }
  };

  const handleContinueWithoutSpotify = async () => {
    setSpotifyPublicFallbackConfirmed(true);
    await previewPlaylistLink({ allowPublicSpotify: true });
  };

  const updatePlaylistSong = (id, patch) => {
    setPlaylistSongs((prev) =>
      prev.map((song) => (song.id === id ? { ...song, ...patch } : song)),
    );
  };

  const removePlaylistSong = (id) => {
    setPlaylistSongs((prev) => prev.filter((song) => song.id !== id));
  };

  const updateManualSong = (id, patch) => {
    setManualSongs((prev) =>
      prev.map((song) => (song.id === id ? { ...song, ...patch } : song)),
    );
    setError(null);
  };

  const addManualSong = () => {
    setManualSongs((prev) => [...prev, createManualSong(manualSongSeq)]);
    setManualSongSeq((prev) => prev + 1);
  };

  const removeManualSong = (id) => {
    setManualSongs((prev) => prev.filter((song) => song.id !== id));
    setError(null);
  };

  const handleImportPlaylist = async () => {
    let selected;

    if (mode === 'playlistLink') {
      const songs = playlistSongs.length > 0 ? playlistSongs : await previewPlaylistLink();
      if (!songs) return;
      selected = songs.filter((song) => song.selected && song.title.trim() && song.artist.trim());
      if (selected.length === 0) {
        setError(emptyPlaylistLinkMessage);
        return;
      }
    } else {
      if (hasIncompleteManualSongs) {
        setError('Complete or remove rows missing a title or artist.');
        return;
      }
      selected = completeManualSongs;
      if (selected.length === 0) {
        setError(emptyManualSongsMessage);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSpotifyAuthPrompt(null);

    try {
      if (onImportMany) {
        await onImportMany(selected.map(({ title, artist }) => ({ title, artist })));
      } else {
        for (const song of selected) {
          await onImport(song.title, song.artist);
        }
      }
      onClose();
    } catch (err) {
      if (isSpotifyAuthRequired(err)) {
        setSpotifyAuthPrompt({
          message: err.detail.message,
          authenticated: Boolean(err.detail.authenticated),
        });
      } else {
        setError(err.message || 'Could not import playlist.');
      }
    } finally {
      setLoading(false);
    }
  };

  const TabButton = ({ value, children }) => (
    <button
      type="button"
      onClick={() => {
        if (value !== mode) {
          setPlaylistSongs([]);
        }
        setMode(value);
        setError(null);
        setSpotifyAuthPrompt(null);
        setSpotifyPublicFallbackConfirmed(false);
      }}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${
        mode === value
          ? 'bg-blue-600 text-white'
          : 'bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );

  const importDisabled = loading || (
    mode === 'link'
      ? !link.trim()
      : mode === 'playlistLink'
        ? (!playlistLink.trim() && playlistSongs.length === 0) || needsSpotifyChoice
        : completeManualSongs.length === 0 || hasIncompleteManualSongs
  );
  const importCount = mode === 'manual'
    ? (completeManualSongs.length || '')
    : selectedPreviewSongs.length || playlistSongs.length || '';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-white mb-2">Import Songs</h3>
        <p className="text-gray-400 text-sm mb-4">
          Import one song, import a playlist link, or add multiple songs with fixed title/artist rows.
        </p>

        <div className="flex gap-2 bg-gray-900 rounded-xl p-1 mb-5 border border-gray-700">
          <TabButton value="link">Single Link</TabButton>
          <TabButton value="playlistLink">Playlist Link</TabButton>
          <TabButton value="manual">Manual Entry</TabButton>
        </div>

        {mode === 'link' ? (
          <>
            <p className="text-gray-400 text-sm mb-3">
              Paste a Spotify or YouTube link to auto-fill one song.
            </p>
            <input
              type="text"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setSpotifyAuthPrompt(null);
              }}
              placeholder="https://open.spotify.com/track/... or https://youtube.com/watch?v=..."
              className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
          </>
        ) : mode === 'playlistLink' ? (
          <>
            <p className="text-gray-400 text-sm mb-3">
              Paste a Spotify or YouTube playlist link to preview and import its songs.
            </p>
            <input
              type="text"
              value={playlistLink}
              onChange={(e) => {
                setPlaylistLink(e.target.value);
                setPlaylistSongs([]);
                setSpotifyAuthPrompt(null);
                setSpotifyPublicFallbackConfirmed(false);
              }}
              placeholder="https://open.spotify.com/playlist/... or https://youtube.com/playlist?list=..."
              className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <p className="text-gray-500 text-xs mt-2">
              Private Spotify playlists need Spotify connection. Public playlists can continue without it.
            </p>

            {needsSpotifyChoice ? (
              <div className="mt-4 bg-gray-900 border border-green-700/50 rounded-lg p-4">
                <p className="text-gray-100 text-sm font-bold">Spotify playlist access</p>
                <p className="text-gray-400 text-sm mt-1">
                  Connect Spotify for private, collaborative, or full playlist import. Continue without Spotify for a public playlist fallback.
                </p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  {isAuthenticated ? (
                    <button
                      type="button"
                      onClick={handleConnectSpotify}
                      disabled={connectingSpotify}
                      className="bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 px-3 rounded-md transition disabled:opacity-50"
                    >
                      {connectingSpotify ? 'Opening Spotify…' : 'Connect Spotify'}
                    </button>
                  ) : (
                    <p className="text-gray-400 text-xs self-center">
                      Sign in to myJam to connect Spotify for private playlists.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleContinueWithoutSpotify}
                    disabled={!playlistLink.trim() || loading}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-bold py-2 px-3 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Reading Playlist...' : 'Continue without Spotify'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => previewPlaylistLink()}
                disabled={!playlistLink.trim() || loading}
                className="mt-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold py-2 px-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? 'Reading Playlist...' : 'Preview Playlist'}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-gray-400 text-sm mb-3">
              Add songs in a fixed format. Each complete row needs a title and an artist.
            </p>
            <div className="space-y-2">
              {manualSongs.map((song, index) => (
                <div
                  key={song.id}
                  className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-center bg-gray-900 border border-gray-700 rounded-lg p-2"
                >
                  <input
                    aria-label={`Manual song ${index + 1} title`}
                    type="text"
                    value={song.title}
                    onChange={(e) => updateManualSong(song.id, { title: e.target.value })}
                    placeholder="Song title"
                    className="bg-gray-800 text-white text-sm p-2 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    aria-label={`Manual song ${index + 1} artist`}
                    type="text"
                    value={song.artist}
                    onChange={(e) => updateManualSong(song.id, { artist: e.target.value })}
                    placeholder="Artist"
                    className="bg-gray-800 text-white text-sm p-2 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeManualSong(song.id)}
                    disabled={manualSongs.length === 1}
                    className="text-gray-500 hover:text-red-400 text-sm font-bold px-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addManualSong}
              className="mt-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold py-2 px-4 rounded-lg transition"
            >
              + Add Song Row
            </button>
            {hasIncompleteManualSongs && (
              <p className="text-yellow-300 text-xs mt-2">
                Complete or remove rows missing a title or artist.
              </p>
            )}
          </>
        )}

        {playlistSongs.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-gray-200">
                Preview {selectedPreviewSongs.length}/{playlistSongs.length} selected
              </p>
              <button
                type="button"
                onClick={() => setPlaylistSongs((prev) => prev.map((song) => ({ ...song, selected: true })))}
                className="text-xs text-blue-300 hover:text-blue-200"
              >
                Select all
              </button>
            </div>
            <div className="space-y-2">
              {playlistSongs.map((song, index) => (
                <div
                  key={song.id}
                  className={`grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto] items-center bg-gray-900 border rounded-lg p-2 ${
                    song.selected ? 'border-gray-700' : 'border-gray-800 opacity-60'
                  }`}
                >
                  <input
                    aria-label={`Select ${song.title}`}
                    type="checkbox"
                    checked={song.selected}
                    onChange={(e) => updatePlaylistSong(song.id, { selected: e.target.checked })}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <input
                    aria-label={`Song ${index + 1} title`}
                    value={song.title}
                    onChange={(e) => updatePlaylistSong(song.id, { title: e.target.value })}
                    className="bg-gray-800 text-white text-sm p-2 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    aria-label={`Song ${index + 1} artist`}
                    value={song.artist}
                    onChange={(e) => updatePlaylistSong(song.id, { artist: e.target.value })}
                    className="bg-gray-800 text-white text-sm p-2 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removePlaylistSong(song.id)}
                    className="text-gray-500 hover:text-red-400 text-sm font-bold px-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

        {spotifyAuthPrompt && (
          <div className="mt-4 bg-gray-900 border border-yellow-700/60 rounded-lg p-3">
            <p className="text-yellow-200 text-sm">{spotifyAuthPrompt.message}</p>
            {spotifyAuthPrompt.authenticated ? (
              <button
                type="button"
                onClick={handleConnectSpotify}
                disabled={connectingSpotify}
                className="mt-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-1.5 px-3 rounded-md transition disabled:opacity-50"
              >
                {connectingSpotify ? 'Opening Spotify…' : 'Connect Spotify'}
              </button>
            ) : (
              <p className="text-gray-400 text-xs mt-2">
                Sign in to myJam to link your Spotify account.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white px-4 py-2"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={mode === 'link' ? handleImportLink : handleImportPlaylist}
            disabled={importDisabled}
            className={`bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center disabled:opacity-40 disabled:cursor-not-allowed ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading
              ? 'Importing...'
              : mode === 'link'
                ? 'Import Song'
                : `Import ${importCount} Songs`.replace('  ', ' ')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportSongModal;
