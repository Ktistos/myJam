import React from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

const STATUS_CONFIG = {
  open:    { label: 'Open',             bg: 'bg-green-900',  text: 'text-green-400',  border: 'border-green-800' },
  pending: { label: 'Pending Approval', bg: 'bg-yellow-900', text: 'text-yellow-400', border: 'border-yellow-800' },
  taken:   { label: 'Taken',            bg: 'bg-red-900',    text: 'text-red-400',    border: 'border-red-800' },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.text.replace('text-', 'bg-')} opacity-80`} />
      {cfg.label}
    </span>
  );
};

const BackButton = ({ onClick, label = 'Back' }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-gray-400 text-gray-200 hover:text-white transition-all mb-5 px-4 py-2 rounded-lg group"
  >
    <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
    <span className="text-sm font-semibold">{label}</span>
  </button>
);

const SongDetail = ({ song, roles, onApplyForRole, onLeaveRole, onBack, currentUserId, isParticipant, requiresApproval, jamState }) => {
  if (!song) return <LoadingSpinner />;

  const isCompleted = jamState === 'completed';
  const openCount   = roles.filter((r) => !r.joinedByUserId && !r.pendingUserId).length;
  const takenCount  = roles.filter((r) => !!r.joinedByUserId).length;

  return (
    <div className="py-4">
      <BackButton onClick={onBack} label="Back to Jam" />

      {/* Song header */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl mb-6 overflow-hidden">
        <div className="h-1.5 bg-blue-600" />
        <div className="p-6">
          <h2 className="text-3xl font-bold text-white mb-1">{song.title}</h2>
          <p className="text-gray-300 text-lg">{song.artist}</p>
          {roles.length > 0 && (
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-gray-500">
                {takenCount}/{roles.length} roles filled
              </span>
              {openCount > 0 && !isCompleted && (
                <span className="text-xs text-green-400 font-medium">
                  {openCount} open slot{openCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 mb-4">
        <h3 className="text-lg font-bold text-gray-100">🎸 Instrument Roles</h3>
      </div>

      {roles.length > 0 && !isCompleted && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-4 flex items-start gap-2 text-xs text-gray-400">
          <span className="text-blue-400 shrink-0 mt-0.5">ℹ</span>
          <span>
            Any participant can claim an open role. <span className="text-blue-300 font-medium">Blue</span> border marks the instrument you own.
          </span>
        </div>
      )}

      {roles.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <p className="text-4xl mb-2">🎼</p>
          <p className="text-gray-400 text-sm">No roles yet.</p>
          <p className="text-gray-500 text-xs mt-1">Roles are generated from participants' instruments.</p>
        </div>
      )}

      <div className="space-y-3">
        {roles.map((role) => {
          const status      = role.joinedByUserId ? 'taken' : role.pendingUserId ? 'pending' : 'open';
          const isOwner     = role.ownerId === currentUserId;
          const isApplicant = role.pendingUserId === currentUserId;
          const isPlayer    = role.joinedByUserId === currentUserId;

          return (
            <div
              key={role.id}
              className={`bg-gray-800 border rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors ${
                isOwner ? 'border-blue-800' : 'border-gray-700'
              }`}
            >
              {/* Left */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <h4 className="text-base font-bold text-white">{role.instrument}</h4>
                  <StatusBadge status={status} />
                </div>

                <p className="text-gray-400 text-sm">
                  Owner:{' '}
                  <span className={`font-semibold ${isOwner ? 'text-blue-300' : 'text-gray-200'}`}>
                    {role.ownerName}{isOwner ? ' (you)' : ''}
                  </span>
                </p>

                {role.status === 'pending' && role.pendingUserName && (
                  <p className="text-yellow-400 text-xs mt-1">
                    Applied by: <span className="font-medium">{role.pendingUserName}</span>
                  </p>
                )}
                {role.status === 'taken' && (
                  <p className="text-gray-400 text-xs mt-1">
                    Playing: <span className="text-gray-200 font-medium">{role.joinedByUserName}</span>
                  </p>
                )}
              </div>

              {/* Right — action buttons */}
              {isParticipant && !isCompleted && (
                <div className="shrink-0">
                  {role.status === 'open' && (
                    <button
                      onClick={() => onApplyForRole(role.id)}
                      className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-5 rounded-lg transition shadow"
                    >
                      {requiresApproval ? '✋ Apply' : '✓ I\'ll Play'}
                    </button>
                  )}
                  {role.status === 'pending' && isApplicant && (
                    <button
                      onClick={() => onLeaveRole(role.id)}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-sm font-bold py-2 px-4 rounded-lg transition border border-gray-600"
                    >
                      Cancel Application
                    </button>
                  )}
                  {role.status === 'taken' && isPlayer && (
                    <button
                      onClick={() => onLeaveRole(role.id)}
                      className="bg-transparent border border-red-700 hover:bg-red-900 text-red-400 hover:text-red-300 text-sm font-bold py-2 px-4 rounded-lg transition"
                    >
                      Leave Role
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SongDetail;
