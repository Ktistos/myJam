import React from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * Details view for a single song.
 * Shows roles and allows users to join/leave.
 */
const SongDetail = ({ song, roles, onJoinRole, onLeaveRole, onBack, currentUserId }) => {
  if (!song) return <LoadingSpinner />;

  return (
    <div className="p-4">
      <button onClick={onBack} className="text-blue-400 hover:text-blue-300 mb-4">&larr; Back to Jam</button>
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl mb-6">
        <h2 className="text-3xl font-bold mb-1">{song.title}</h2>
        <p className="text-gray-300 text-lg">{song.artist}</p>
      </div>

      <h3 className="text-2xl font-bold mb-4">Song Roles</h3>
      <div className="space-y-4">
        {roles.length === 0 ? (
          <p className="text-gray-400">No roles found for this song.</p>
        ) : (
          roles.map(role => (
            <div key={role.id} className="bg-gray-700 p-4 rounded-lg shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div>
                <h4 className="text-lg font-semibold">{role.instrument}</h4>
                {role.status === 'open' ? (
                  <p className="text-green-400 font-semibold">Open</p>
                ) : (
                  <p className="text-red-400">
                    Taken by: <span className="font-semibold text-gray-200">{role.joinedByUserName || '...'}</span>
                  </p>
                )}
              </div>
              <div className="mt-3 sm:mt-0">
                {role.status === 'open' && (
                  <button
                    onClick={() => onJoinRole(role.id)}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition"
                  >
                    Join Role
                  </button>
                )}
                {role.status === 'taken' && role.joinedByUserId === currentUserId && (
                  <button
                    onClick={() => onLeaveRole(role.id)}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition"
                  >
                    Leave Role
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SongDetail;