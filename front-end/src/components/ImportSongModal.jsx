import React, { useState } from 'react';
import { parseSongLink } from '../helper_functions/linkParser';

const ImportSongModal = ({ onClose, onImport }) => {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleImport = async () => {
    if (!link) return;
    
    setLoading(true);
    setError(null);

    try {
      // Call our parser function
      const songData = await parseSongLink(link);
      // Pass the data back up to App.jsx
      onImport(songData.title, songData.artist);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-xl font-bold text-white mb-4">Import from Link</h3>
        
        <p className="text-gray-400 text-sm mb-4">
          Paste a Spotify or YouTube link to auto-fill the song details.
        </p>

        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://open.spotify.com/track/..."
          className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
        />

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex justify-end space-x-3 mt-4">
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white px-4 py-2"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={loading}
            className={`bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Fetching...' : 'Import Song'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportSongModal;