import React, { useState } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import AddSongForm from '../components/AddSongForm';
import JamStateBadge from '../components/JamStateBadge';
import AdminPanel from '../components/AdminPanel';
import UserProfileModal from '../components/UserProfileModal';
import { INSTRUMENT_TYPES, instrumentLabel } from './Profile';

const HARDWARE_INSTRUMENT_TYPES = INSTRUMENT_TYPES.filter((type) => type !== 'Vocals');

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
  isGuest,
  isParticipant,
  onJoinJam,
  onLeaveJam,
  participants,
  rolesBySongId,
  onAdvanceState,
  onUpdateSettings,
  onRegenerateInviteCode,
  onSetCurrentSong,
  onApproveSong,
  onRejectSong,
  onApproveRole,
  onRejectRole,
  onAddAdmin,
  onRemoveAdmin,
  onDeleteJam,
  onDeleteSong,
  onEditSong,
  onReschedule,
  hardware,
  onSubmitHardware,
  onUpdateHardware,
  onRemoveHardware,
  onApproveHardware,
  onRejectHardware,
  currentUserId,
}) => {
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newInstrumentType, setNewInstrumentType] = useState('');
  const [newInstrumentModel, setNewInstrumentModel] = useState('');
  const [editingHardwareId, setEditingHardwareId] = useState(null);
  const [editInstrument, setEditInstrument] = useState('');

  // Profile modal state
  const [viewingParticipant, setViewingParticipant] = useState(null);

  // Inline song editing state
  const [editingSongId, setEditingSongId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');

  if (!jam) return <LoadingSpinner />;

  const approvedSongs      = songs.filter((s) => s.status === 'approved');
  const mySentPendingSongs = songs.filter((s) => s.status === 'pending' && s.submittedBy === currentUserId);
  const currentSong        = jam.currentSongId ? approvedSongs.find((s) => s.id === jam.currentSongId) : null;
  const isCompleted        = jam.state === 'completed';
  const canModify          = isParticipant && !isCompleted;
  const leavingDeletesJam  = isAdmin && jam.admins.length === 1;

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(jam.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const date = new Date(jam.date);
  const dateStr = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const startEditSong = (song, e) => {
    e.stopPropagation();
    setEditingSongId(song.id);
    setEditTitle(song.title);
    setEditArtist(song.artist);
  };

  const cancelEdit = () => {
    setEditingSongId(null);
    setEditTitle('');
    setEditArtist('');
  };

  const saveEdit = (songId) => {
    if (editTitle.trim()) {
      onEditSong(jam.id, songId, editTitle.trim(), editArtist.trim());
    }
    cancelEdit();
  };

  const startEditHardware = (hardwareItem) => {
    setEditingHardwareId(hardwareItem.id);
    setEditInstrument(hardwareItem.instrument);
  };

  const cancelEditHardware = () => {
    setEditingHardwareId(null);
    setEditInstrument('');
  };

  const saveEditHardware = () => {
    if (!editingHardwareId || !editInstrument.trim()) return;
    onUpdateHardware(jam.id, editingHardwareId, editInstrument.trim());
    cancelEditHardware();
  };

  const newHardwareInstrument = newInstrumentType
    ? instrumentLabel({ type: newInstrumentType, model: newInstrumentModel.trim() })
    : '';

  const resetNewHardwareForm = () => {
    setNewInstrumentType('');
    setNewInstrumentModel('');
  };

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
              <JamStateBadge state={jam.state} />
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
            {/* Join button — only for authenticated users */}
            {!isGuest && !isParticipant && jam.visibility === 'public' && !isCompleted && (
              <button
                onClick={() => onJoinJam(jam.id)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-lg transition shadow"
              >
                Join This Jam
              </button>
            )}
            {isGuest && !isCompleted && (
              <p className="text-sm text-gray-500 italic">Sign in to join this jam</p>
            )}

            {/* Leave button */}
            {isParticipant && (
              <button
                onClick={() => onLeaveJam(jam.id)}
                className={`text-sm font-bold py-2 px-4 rounded-lg transition ${
                  leavingDeletesJam
                    ? 'bg-red-900 border border-red-700 text-red-200 hover:bg-red-800'
                    : 'bg-transparent border border-red-700 hover:bg-red-900 text-red-400 hover:text-red-300'
                }`}
              >
                {leavingDeletesJam ? 'Leave and Delete Jam' : 'Leave Jam'}
              </button>
            )}

            {/* Invite code — private jam, admin only */}
            {jam.visibility === 'private' && isAdmin && jam.inviteCode && (
              <div className="flex flex-wrap items-center gap-2">
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
                {onRegenerateInviteCode && (
                  <button
                    onClick={() => {
                      const confirmed = window.confirm(
                        'Regenerate this invite code? The current code will stop working.'
                      );
                      if (!confirmed) return;
                      setShowInviteCode(true);
                      onRegenerateInviteCode(jam.id);
                    }}
                    className="text-sm bg-purple-900 hover:bg-purple-800 text-purple-200 font-semibold py-2 px-3 rounded-lg transition border border-purple-700"
                  >
                    Regenerate Code
                  </button>
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
          hardware={hardware}
          onAdvanceState={onAdvanceState}
          onUpdateSettings={onUpdateSettings}
          onSetCurrentSong={onSetCurrentSong}
          onApproveSong={onApproveSong}
          onRejectSong={onRejectSong}
          onApproveRole={onApproveRole}
          onRejectRole={onRejectRole}
          onApproveHardware={onApproveHardware}
          onRejectHardware={onRejectHardware}
          onAddAdmin={onAddAdmin}
          onRemoveAdmin={onRemoveAdmin}
          onDeleteJam={onDeleteJam}
          onReschedule={onReschedule}
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
              const canEditDelete = isAdmin || song.submittedBy === currentUserId;
              const isEditing = editingSongId === song.id;

              if (isEditing) {
                return (
                  <div
                    key={song.id}
                    className="p-4 rounded-xl border bg-gray-800 border-yellow-700"
                  >
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Song title"
                        className="w-full bg-gray-700 text-white p-2 text-sm rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(song.id); if (e.key === 'Escape') cancelEdit(); }}
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editArtist}
                        onChange={(e) => setEditArtist(e.target.value)}
                        placeholder="Artist"
                        className="w-full bg-gray-700 text-white p-2 text-sm rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(song.id); if (e.key === 'Escape') cancelEdit(); }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(song.id)}
                          disabled={!editTitle.trim()}
                          className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-1.5 rounded-lg transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={song.id}
                  className={`p-4 rounded-xl transition-all flex items-center gap-4 border ${
                    isCurrent
                      ? 'bg-green-900 border-green-600 hover:bg-green-800 shadow-md shadow-green-950/50'
                      : 'bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-gray-500'
                  }`}
                >
                  {/* Clicking the song content navigates to song detail */}
                  <div
                    className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
                    onClick={() => onSongClick(song.id)}
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

                  {/* Edit/Delete actions */}
                  {canEditDelete && (
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <button
                        onClick={(e) => startEditSong(song, e)}
                        className="text-gray-500 hover:text-yellow-400 transition-colors p-1 rounded hover:bg-gray-700"
                        title="Edit song"
                      >
                        ✏
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteSong(jam.id, song.id); }}
                        className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-gray-700"
                        title="Delete song"
                      >
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pending song submissions — also show delete for submitter */}
        {mySentPendingSongs.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-gray-500 text-xs uppercase font-semibold tracking-wider">Your pending submissions</p>
            {mySentPendingSongs.map((song) => (
              <div key={song.id} className="bg-gray-800 border border-yellow-900 p-3 rounded-lg flex items-center gap-3">
                <span className="text-yellow-400 text-lg">⏳</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 font-medium">{song.title}</p>
                  <p className="text-xs text-gray-500">{song.artist} · Awaiting approval</p>
                </div>
                <button
                  onClick={() => onDeleteSong(jam.id, song.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-gray-700 shrink-0"
                  title="Withdraw submission"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Song form */}
      {canModify && (
        <AddSongForm onAddSong={onAddSong} onOpenImportModal={onOpenImportModal} />
      )}

      {/* ── Hardware ── */}
      <div className="mt-8">
        <SectionHeader>🎸 Available Hardware</SectionHeader>
        <p className="text-gray-500 text-xs mb-3">
          Keep the jam&apos;s available instruments current. These entries generate the playable roles on songs.
        </p>

        {(() => {
          const hwItems = hardware || [];
          const approvedHw = hwItems.filter((h) => h.status === 'approved');
          const pendingHw  = hwItems.filter((h) => h.status === 'pending');
          const myPendingHw = pendingHw.filter((h) => h.owner_id === currentUserId);
          const grouped = {};
          approvedHw.forEach((h) => {
            if (!grouped[h.instrument]) grouped[h.instrument] = [];
            grouped[h.instrument].push(h);
          });

          return (
            <>
              {Object.keys(grouped).length === 0 && pendingHw.length === 0 ? (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
                  <p className="text-4xl mb-2">🎹</p>
                  <p className="text-gray-400 text-sm">No hardware added yet.</p>
                  {canModify && <p className="text-gray-500 text-xs mt-1">Add an instrument you&apos;re bringing!</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(grouped).map(([instrument, items]) => (
                    <div key={instrument} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-gray-200 mb-2">{instrumentLabel({ instrument })}</h4>
                      <div className="flex flex-wrap gap-2">
                        {items.map((h) => {
                          const canManageHardware = h.owner_id === currentUserId || isAdmin;
                          const isEditingHardware = editingHardwareId === h.id;

                          if (isEditingHardware) {
                            return (
                              <form
                                key={h.id}
                                className="flex items-center gap-1.5 bg-gray-900 border border-blue-700 rounded-full px-2 py-1"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  saveEditHardware();
                                }}
                              >
                                <input
                                  aria-label="Edit hardware instrument"
                                  value={editInstrument}
                                  onChange={(e) => setEditInstrument(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') cancelEditHardware();
                                  }}
                                  className="w-36 bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  autoFocus
                                />
                                <button
                                  type="submit"
                                  disabled={!editInstrument.trim()}
                                  className="text-xs text-green-300 hover:text-green-200 font-bold disabled:opacity-40"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditHardware}
                                  className="text-xs text-gray-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </form>
                            );
                          }

                          return (
                            <div key={h.id} className="flex items-center gap-2 bg-gray-700 text-gray-300 text-sm px-3 py-1.5 rounded-full">
                              <span className="font-semibold text-gray-100">{instrumentLabel(h)}</span>
                              <span className="text-gray-500">from</span>
                              <span>{h.owner_name}</span>
                              {canManageHardware && (
                                <>
                                  <button
                                    onClick={() => startEditHardware(h)}
                                    className="text-gray-500 hover:text-blue-300 transition-colors ml-1 text-xs"
                                    title="Edit hardware"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => onRemoveHardware(jam.id, h.id)}
                                    className="text-gray-500 hover:text-red-400 transition-colors text-xs"
                                    title="Remove hardware"
                                  >
                                    &times;
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending hardware for current user */}
              {myPendingHw.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-gray-500 text-xs uppercase font-semibold tracking-wider">Your pending hardware</p>
                  {myPendingHw.map((h) => (
                    <div key={h.id} className="bg-gray-800 border border-yellow-900 p-3 rounded-lg flex items-center gap-3">
                      <span className="text-yellow-400 text-lg">⏳</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 font-medium">{instrumentLabel({ instrument: h.instrument })}</p>
                        <p className="text-xs text-gray-500">Awaiting admin approval</p>
                      </div>
                      <button
                        onClick={() => onRemoveHardware(jam.id, h.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-gray-700 shrink-0"
                        title="Withdraw hardware"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add hardware form */}
              {canModify && (
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newHardwareInstrument) return;
                    onSubmitHardware(jam.id, newHardwareInstrument);
                    resetNewHardwareForm();
                  }}
                >
                  <select
                    aria-label="Hardware instrument"
                    value={newInstrumentType}
                    onChange={(e) => {
                      setNewInstrumentType(e.target.value);
                      setNewInstrumentModel('');
                    }}
                    className="bg-gray-800 text-white text-sm p-2.5 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select an instrument…</option>
                    {HARDWARE_INSTRUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newInstrumentModel}
                    onChange={(e) => setNewInstrumentModel(e.target.value)}
                    disabled={!newInstrumentType || newInstrumentType === 'Vocals'}
                    placeholder={newInstrumentType && newInstrumentType !== 'Vocals' ? 'Model (optional)' : 'No model needed'}
                    className="bg-gray-800 text-white text-sm p-2.5 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <button
                    type="submit"
                    disabled={!newHardwareInstrument}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2 px-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    Add
                  </button>
                </form>
              )}
            </>
          );
        })()}
      </div>

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
                onClick={() => setViewingParticipant(p)}
                className="bg-gray-800 border border-gray-700 p-3 rounded-xl flex flex-wrap items-center gap-3 cursor-pointer hover:bg-gray-750 hover:border-gray-500 transition-colors"
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

      {/* ── User Profile Modal ── */}
      {viewingParticipant && (
        <UserProfileModal
          participant={viewingParticipant}
          onClose={() => setViewingParticipant(null)}
        />
      )}
    </div>
  );
};

export default JamDetail;
