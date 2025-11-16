import React, { useState } from 'react';

/**
 * Form for adding a new song to a jam.
 */
const AddSongForm = ({ onAddSong }) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title || !artist) return;
    onAddSong(title, artist);
    setTitle('');
    setArtist('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-xl space-y-4 mt-6">
      <h3 className="text-xl font-bold mb-3">Add a Song to the Setlist</h3>
      <div>
        <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="song-title">
          Song Title
        </label>
        <input
          id="song-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., 'Sweet Home Chicago'"
        />
      </div>
      <div>
        <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="song-artist">
          Original Artist
        </label>
        <input
          id="song-artist"
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., 'Robert Johnson'"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition"
        >
          + Add Song
        </button>
      </div>
    </form>
  );
};

export default AddSongForm;