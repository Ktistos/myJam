import React from 'react';

/**
 * Displays the list of available jam sessions.
 */
const JamList = ({ jams, onJamClick, onNavCreate }) => (
  <div className="p-4">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-bold">Upcoming Jams</h2>
      <button
        onClick={onNavCreate}
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition"
      >
        + Create Jam
      </button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {jams.length === 0 ? (
        <p className="text-gray-400">No jams scheduled. Why not create one?</p>
      ) : (
        jams.map(jam => (
          <div
            key={jam.id}
            onClick={() => onJamClick(jam.id)}
            className="bg-gray-800 p-6 rounded-lg shadow-lg cursor-pointer hover:shadow-xl hover:bg-gray-700 transition"
          >
            <h3 className="text-xl font-semibold mb-2">{jam.name}</h3>
            <p className="text-gray-400">{new Date(jam.date).toLocaleString()}</p>
            <p className="text-gray-400 text-sm">{jam.location}</p>
          </div>
        ))
      )}
    </div>
  </div>
);

export default JamList;