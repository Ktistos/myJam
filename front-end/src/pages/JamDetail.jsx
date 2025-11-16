import React from 'react'; // <-- No longer need useState
import LoadingSpinner from '../components/LoadingSpinner';
import AddSongForm from '../components/AddSongForm';
// <-- No longer need to import ImportSongModal here

/**
 * Details view for a single jam.
 * Shows jam info and the list of songs.
 */
const JamDetail = ({
  jam,
  songs,
  onSongClick,
  onAddSong,
  onBack,
  onOpenImportModal, // <-- Accept the new prop from App.jsx
}) => {
  // <-- The isImportModalOpen state is removed from here

  if (!jam) return <LoadingSpinner />;

  return (
    <div className="p-4">
      {/* <-- The modal render is removed from here */}

      <button onClick={onBack} className="text-blue-400 hover:text-blue-300 mb-4">
        &larr; Back to Jams
      </button>
      
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl mb-6">
        <h2 className="text-3xl font-bold mb-2">{jam.name}</h2>
        <p className="text-gray-300 text-lg mb-1">
          {new Date(jam.date).toLocaleString()}
        </p>
        <p className="text-gray-400">{jam.location}</p>
      </div>

      <div className="flex justify-between items-end mb-4">
        <h3 className="text-2xl font-bold">Setlist</h3>
        {/* <-- The "Import via Link" button is removed from here */}
      </div>

      <div className="space-y-3">
        {songs.length === 0 ? (
          <p className="text-gray-400">No songs added to this jam yet.</p>
        ) : (
          songs.map((song) => (
            <div
              key={song.id}
              onClick={() => onSongClick(song.id)}
              className="bg-gray-700 p-4 rounded-lg shadow-md cursor-pointer hover:bg-gray-600 transition"
            >
              <h4 className="text-lg font-semibold">{song.title}</h4>
              <p className="text-gray-400 text-sm">{song.artist}</p>
            </div>
          ))
        )}
      </div>

      <AddSongForm 
        onAddSong={onAddSong} 
        onOpenImportModal={onOpenImportModal} // <-- Pass the prop down
      />
    </div>
  );
};

export default JamDetail;