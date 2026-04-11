import React, { useState } from 'react';

const JamList = ({ jams, onJamClick, onNavCreate, userId, participantsByJamId }) => {
  const [tab, setTab] = useState('upcoming');

  const isMyJam = (jam) => {
    if (jam.admins?.includes(userId)) return true;
    const parts = participantsByJamId?.[jam.id];
    if (parts) return parts.some(p => p.userId === userId);
    return false;
  };

  const displayed = tab === 'mine' ? jams.filter(isMyJam) : jams;

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('upcoming')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              tab === 'upcoming'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Upcoming Jams
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              tab === 'mine'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            My Jams
          </button>
        </div>
        <button
          onClick={onNavCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition"
        >
          + Create Jam
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayed.length === 0 ? (
          <p className="text-gray-400">
            {tab === 'mine' ? 'You have not joined any jams yet.' : 'No jams scheduled. Why not create one?'}
          </p>
        ) : (
          displayed.map(jam => (
            <div
              key={jam.id}
              onClick={() => onJamClick(jam.id)}
              className="bg-gray-800 p-6 rounded-lg shadow-lg cursor-pointer hover:shadow-xl hover:bg-gray-700 transition"
            >
              <h3 className="text-xl font-semibold mb-1">{jam.name}</h3>
              <p className="text-gray-400 text-sm mb-1">
                {new Date(jam.date).toLocaleString()}
              </p>
              {jam.location?.address && (
                <p className="text-gray-500 text-sm">📍 {jam.location.address}</p>
              )}
              {jam.state && jam.state !== 'initial' && (
                <span className="mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-yellow-400">
                  {jam.state}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default JamList;
