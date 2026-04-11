import React, { useState } from 'react';

const AddSongForm = ({ onAddSong, onOpenImportModal }) => {
  const [title,  setTitle]  = useState('');
  const [artist, setArtist] = useState('');
  const [open,   setOpen]   = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title || !artist) return;
    onAddSong(title, artist);
    setTitle('');
    setArtist('');
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 hover:border-gray-400 text-gray-400 hover:text-white font-semibold py-3 px-4 rounded-xl transition-all"
        >
          <span className="text-xl">+</span>
          <span>Add a Song to the Setlist</span>
        </button>
        <button
          onClick={onOpenImportModal}
          className="bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-gray-400 text-purple-400 hover:text-purple-300 font-semibold py-3 px-4 rounded-xl transition-all text-sm"
          title="Import via link"
        >
          🔗 Import
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl mt-4 overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 bg-gray-900">
        <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wide">Add Song to Setlist</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-500 hover:text-gray-300 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide" htmlFor="song-title">
            Song Title
          </label>
          <input
            id="song-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className="w-full bg-gray-700 text-white p-2.5 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
            placeholder="e.g., Sweet Home Chicago"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide" htmlFor="song-artist">
            Original Artist
          </label>
          <input
            id="song-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            className="w-full bg-gray-700 text-white p-2.5 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
            placeholder="e.g., Robert Johnson"
          />
        </div>
      </div>

      <div className="px-5 py-3 bg-gray-900 border-t border-gray-700 flex justify-between gap-2">
        <button
          type="button"
          onClick={onOpenImportModal}
          className="text-sm bg-transparent border border-purple-700 hover:bg-purple-900 text-purple-400 hover:text-purple-300 font-bold py-2 px-3 rounded-lg transition"
        >
          🔗 Import via Link
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="bg-transparent hover:bg-gray-700 text-gray-400 hover:text-white text-sm font-bold py-2 px-4 rounded-lg transition border border-gray-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !artist.trim()}
            className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition shadow disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add Song
          </button>
        </div>
      </div>
    </form>
  );
};

export default AddSongForm;
