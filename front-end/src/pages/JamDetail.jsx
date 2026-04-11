import React, { useState } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import AddSongForm from '../components/AddSongForm';
import JamStateBadge from '../components/JamStateBadge';
import AdminPanel from '../components/AdminPanel';

const Avatar = ({ name, size = 'sm' }) => {
  const initial = name?.charAt(0).toUpperCase() || '?';
  const sz = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';
  return (
    <div className={`${sz} rounded-full bg-blue-700 flex items-center justify-center text-white font-bold shrink-0`}>
      {initial}
    </div>
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

const SectionHeader = ({ children }) => (
  <h3 className="text-lg font-bold text-gray-100 mb-3 flex items-center gap-2">
    {children}
  </h3>
);

const JamDetail = ({
  jam,
  songs,
  onSongClick,
  onAddSong,
  onBack,
  onOpenImportModal,
  isAdmin,
  isParticipant,
  onJoinJam,
  onLeaveJam,
  participants,
  rolesBySongId,
  onAdvanceState,
  onUpdateSettings,
  onSetCurrentSong,
  onApproveSong,
  onRejectSong,
  onApproveRole,
  onRejectRole,
  onAddAdmin,
  onDeleteJam,
  currentUserId,
}) => {
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!jam) return <LoadingSpinner />;

  const approvedSongs      = songs.filter((s) => s.status === 'approved');
  const mySentPendingSongs = songs.filter((s) => s.status === 'pending' && s.submittedBy === currentUserId);
  const currentSong        = jam.currentSongId ? approvedSongs.find((s) => s.id === jam.currentSongId) : null;
  const isCompleted        = jam.state === 'completed';
  const canModify          = isParticipant && !isCompleted;

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(jam.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const date = new Date(jam.date);
  const dateStr = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="py-4">
      <BackButton onClick={onBack} label="Back to Jams" />

      {/* ── Jam Header ── */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl mb-6 overflow-hidden">
        {/* State color bar */}
        <div className={`h-1.5 w-full ${
          jam.state === 'in-progress' ? 'bg-green-500' :
          jam.state === 'tuning'      ? 'bg-yellow-500' :
          jam.state === 'completed'   ? 'bg-blue-500' :
          'bg-gray-600'
        }`} />

        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <h2 className="text-3xl font-bold text-white leading-tight">{jam.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {jam.state !== 'initial' && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-900 text-yellow-300 border border-yellow-800">
                  {jam.state}
                </span>
              )}
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                jam.visibility === 'public'
                  ? 'bg-green-900 text-green-300 border border-green-800'
                  : 'bg-gray-700 text-gray-300 border border-gray-600'
              }`}>
                {jam.visibility === 'public' ? '🌐 Public' : '🔒 Private'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 mb-4">
            <p className="text-gray-300 flex items-center gap-2">
              <span className="text-gray-500">🗓</span>
              <span>{dateStr} at {timeStr}</span>
            </p>
            {jam.location?.address && (
              <p className="text-gray-400 flex items-center gap-2">
                <span className="text-gray-500">📍</span>
                <span>{jam.location.address}</span>
              </p>
            )}
            <p className="text-gray-500 text-sm flex items-center gap-2">
              <span>👥</span>
              <span>{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Join button */}
            {!isParticipant && jam.visibility === 'public' && !isCompleted && (
              <button
                onClick={() => onJoinJam(jam.id)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-lg transition shadow"
              >
                Join This Jam
              </button>
            )}

            {/* Leave button */}
            {isParticipant && !isAdmin && !isCompleted && (
              <button
                onClick={() => onLeaveJam(jam.id)}
                className="bg-transparent border border-red-700 hover:bg-red-900 text-red-400 hover:text-red-300 text-sm font-bold py-2 px-4 rounded-lg transition"
              >
                Leave Jam
              </button>
            )}

            {/* Invite code — private jam, admin only */}
            {jam.visibility === 'private' && isAdmin && jam.inviteCode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowInviteCode((v) => !v)}
                  className="text-sm bg-gray-700 hover:bg-gray-600 text-purple-300 hover:text-purple-200 font-semibold py-2 px-3 rounded-lg transition border border-gray-600"
                >
                  {showInviteCode ? '🔒 Hide Invite Code' : '🔑 Show Invite Code'}
                </button>
                {showInviteCode && (
                  <div className="flex items-center gap-2 bg-gray-900 border border-purple-800 rounded-lg px-3 py-1.5">
                    <code className="text-purple-300 font-mono tracking-widest text-sm font-bold">
                      {jam.inviteCode}
                    </code>
                    <button
                      onClick={handleCopyCode}
                      className="text-xs text-gray-400 hover:text-white transition-colors ml-1"
                    >
                      {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Completed Summary ── */}
      {isCompleted && (
        <div className="bg-gray-800 border border-blue-800 rounded-xl mb-6 overflow-hidden">
          <div className="h-1.5 bg-blue-500" />
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-900 border border-blue-700 flex items-center justify-center text-xl shrink-0">
                ✓
              </div>
              <div>
                <p className="text-blue-300 text-xs font-bold uppercase tracking-widest">Session Complete</p>
                <p className="text-white font-bold text-lg leading-tight">{jam.name}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-4 mb-4">
              <div className="bg-gray-700 rounded-lg px-4 py-2.5 text-center flex-1">
                <p className="text-2xl font-bold text-white">{approvedSongs.length}</p>
                <p className="text-gray-400 text-xs mt-0.5">songs in setlist</p>
              </div>
              <div className="bg-gray-700 rounded-lg px-4 py-2.5 text-center flex-1">
                <p className="text-2xl font-bold text-white">{participants.length}</p>
                <p className="text-gray-400 text-xs mt-0.5">participant{participants.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Participants who attended */}
            {participants.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-2">Who was there</p>
                <div className="flex flex-wrap gap-2">
                  {participants.map((p) => (
                    <span key={p.userId} className="flex items-center gap-1.5 bg-gray-700 text-gray-300 text-sm px-3 py-1 rounded-full">
                      <span className="w-5 h-5 rounded-full bg-blue-800 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {p.name?.charAt(0).toUpperCase()}
                      </span>
                      {p.name}
                      {jam.admins.includes(p.userId) && (
                        <span className="text-yellow-500 text-xs">★</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Admin Panel ── */}
      {isAdmin && (
        <AdminPanel
          jam={jam}
          songs={songs}
          rolesBySongId={rolesBySongId}
          participants={participants}
          onAdvanceState={onAdvanceState}
          onUpdateSettings={onUpdateSettings}
          onSetCurrentSong={onSetCurrentSong}
          onApproveSong={onApproveSong}
          onRejectSong={onRejectSong}
          onApproveRole={onApproveRole}
          onRejectRole={onRejectRole}
          onAddAdmin={onAddAdmin}
          onDeleteJam={onDeleteJam}
        />
      )}

      {/* ── Now Playing Banner ── */}
      {jam.state === 'in-progress' && currentSong && (
        <div className="bg-green-950 border border-green-700 p-4 rounded-xl mb-6 flex items-center gap-4 shadow-lg shadow-green-950/50">
          <div className="w-10 h-10 rounded-full bg-green-700 flex items-center justify-center text-xl shrink-0 animate-pulse">
            ♪
          </div>
          <div>
            <p className="text-xs font-bold text-green-400 uppercase tracking-widest mb-0.5">Now Playing</p>
            <p className="text-xl font-bold text-white">{currentSong.title}</p>
            <p className="text-green-300 text-sm">{currentSong.artist}</p>
          </div>
        </div>
      )}

      {/* ── Setlist ── */}
      <div className="mb-6">
        <SectionHeader>🎵 Setlist</SectionHeader>

        {approvedSongs.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
            <p className="text-4xl mb-2">📋</p>
            <p className="text-gray-400 text-sm">No songs in the setlist yet.</p>
            {canModify && <p className="text-gray-500 text-xs mt-1">Add the first song below!</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {approvedSongs.map((song, idx) => {
              const isCurrent = jam.currentSongId === song.id;
              return (
                <div
                  key={song.id}
                  onClick={() => onSongClick(song.id)}
                  className={`p-4 rounded-xl cursor-pointer transition-all flex items-center gap-4 border ${
                    isCurrent
                      ? 'bg-green-900 border-green-600 hover:bg-green-800 shadow-md shadow-green-950/50'
                      : 'bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-gray-500'
                  }`}
                >
                  <span className={`text-sm font-bold w-6 text-center shrink-0 ${
                    isCurrent ? 'text-green-400' : 'text-gray-600'
                  }`}>
                    {isCurrent ? '♪' : idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-white truncate">{song.title}</h4>
                    <p className="text-gray-400 text-sm truncate">{song.artist}</p>
                  </div>
                  {isCurrent && (
                    <span className="text-green-400 text-xs font-bold shrink-0 bg-green-800 px-2 py-0.5 rounded-full border border-green-600">
                      NOW PLAYING
                    </span>
                  )}
                  <span className="text-gray-600 text-sm shrink-0">›</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Pending song submissions */}
        {mySentPendingSongs.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-gray-500 text-xs uppercase font-semibold tracking-wider">Your pending submissions</p>
            {mySentPendingSongs.map((song) => (
              <div key={song.id} className="bg-gray-800 border border-yellow-900 p-3 rounded-lg flex items-center gap-3">
                <span className="text-yellow-400 text-lg">⏳</span>
                <div>
                  <p className="text-sm text-gray-200 font-medium">{song.title}</p>
                  <p className="text-xs text-gray-500">{song.artist} · Awaiting approval</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Song form */}
      {canModify && (
        <AddSongForm onAddSong={onAddSong} onOpenImportModal={onOpenImportModal} />
      )}

      {/* ── Participants ── */}
      <div className="mt-8">
        <SectionHeader>👥 Participants</SectionHeader>
        {participants.length === 0 ? (
          <p className="text-gray-500 text-sm bg-gray-800 border border-gray-700 rounded-xl p-4">
            No participants yet.
          </p>
        ) : (
          <div className="space-y-2">
            {participants.map((p) => (
              <div
                key={p.userId}
                className="bg-gray-800 border border-gray-700 p-3 rounded-xl flex flex-wrap items-center gap-3"
              >
                <Avatar name={p.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-100 font-semibold text-sm">{p.name}</span>
                    {jam.admins.includes(p.userId) && (
                      <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full font-semibold border border-yellow-800">
                        ★ Admin
                      </span>
                    )}
                    {p.userId === currentUserId && (
                      <span className="text-xs text-blue-400 font-medium">(you)</span>
                    )}
                  </div>
                  {(p.instrumentObjects || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(p.instrumentObjects || []).map((inst, i) => (
                        <span key={i} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full border border-gray-600">
                          {instrumentLabel(inst)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default JamDetail;
