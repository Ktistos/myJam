import React, { useState, useRef, useEffect } from 'react';

const JAM_STATE_ORDER = ['initial', 'tuning', 'in-progress', 'completed'];

const AdminPanel = ({
  jam,
  songs,
  rolesBySongId,
  participants,
  onAdvanceState,
  onUpdateSettings,
  onSetCurrentSong,
  onApproveSong,
  onRejectSong,
  onApproveRole,
  onRejectRole,
  onAddAdmin,
  onRemoveAdmin,
  onDeleteJam,
}) => {
  const [open, setOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Searchable promote picker state
  const [promoteSearch, setPromoteSearch] = useState('');
  const [promoteOpen,   setPromoteOpen]   = useState(false);
  const [selectedPromote, setSelectedPromote] = useState(null); // { userId, userName }
  const promoteRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (promoteRef.current && !promoteRef.current.contains(e.target)) setPromoteOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const stateIndex = JAM_STATE_ORDER.indexOf(jam.state);
  const prevState  = JAM_STATE_ORDER[stateIndex - 1] ?? null;
  const nextState  = JAM_STATE_ORDER[stateIndex + 1] ?? null;

  const stateLabel = (s) =>
    s === 'initial' ? 'Start' : s.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Pending song submissions
  const pendingSongs = songs.filter((s) => s.status === 'pending');

  // Pending role applications across all approved songs
  const pendingRoles = [];
  songs
    .filter((s) => s.status === 'approved')
    .forEach((song) => {
      (rolesBySongId[song.id] || []).forEach((role) => {
        if (role.pendingUserId && !role.joinedByUserId) {
          pendingRoles.push({ ...role, songId: song.id, songTitle: song.title });
        }
      });
    });

  const totalPending = pendingSongs.length + pendingRoles.length;

  // Non-admin participants available for promotion
  const nonAdminParticipants = participants.filter((p) => !jam.admins.includes(p.userId));

  const Toggle = ({ value, onChange }) => (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${value ? 'bg-yellow-500' : 'bg-gray-600'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );

  return (
    <div className="bg-gray-800 border border-yellow-700 rounded-lg mb-6">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 font-bold text-sm uppercase tracking-wide">Admin Panel</span>
          {totalPending > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {totalPending}
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-700 px-4 pb-5 space-y-6 pt-4">

          {/* ── State Control ── */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Jam State</h4>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-yellow-300 capitalize">{jam.state}</span>
              {prevState && (
                <button
                  onClick={() => onAdvanceState(jam.id, prevState)}
                  className="bg-gray-600 hover:bg-gray-500 text-white text-sm font-bold py-1.5 px-4 rounded-lg transition"
                >
                  ← {stateLabel(prevState)}
                </button>
              )}
              {nextState ? (
                <button
                  onClick={() => onAdvanceState(jam.id, nextState)}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold py-1.5 px-4 rounded-lg transition"
                >
                  → {stateLabel(nextState)}
                </button>
              ) : (
                <span className="text-gray-500 text-sm">Jam is complete.</span>
              )}
            </div>
          </section>

          {/* ── Settings ── */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Settings</h4>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <Toggle
                  value={jam.settings.requireRoleApproval}
                  onChange={() => onUpdateSettings(jam.id, { requireRoleApproval: !jam.settings.requireRoleApproval })}
                />
                <span className="text-sm text-gray-200">Require admin approval for role assignments</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Toggle
                  value={jam.settings.requireSongApproval}
                  onChange={() => onUpdateSettings(jam.id, { requireSongApproval: !jam.settings.requireSongApproval })}
                />
                <span className="text-sm text-gray-200">Require admin approval for song submissions</span>
              </label>
            </div>
          </section>

          {/* ── Current Song (in-progress only) ── */}
          {jam.state === 'in-progress' && (() => {
            const approved     = songs.filter((s) => s.status === 'approved');
            const currentIndex = approved.findIndex((s) => s.id === jam.currentSongId);
            const isPlaying    = currentIndex !== -1;
            const currentSong  = approved[currentIndex] ?? null;
            const isFirst      = currentIndex === 0;
            const isLast       = currentIndex === approved.length - 1;

            const play  = (song) => onSetCurrentSong(jam.id, song.id);
            const prev  = ()     => play(approved[currentIndex - 1]);
            const next  = ()     => isPlaying ? play(approved[currentIndex + 1]) : play(approved[0]);

            return (
              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Current Song</h4>

                {/* Song info */}
                <div className="bg-gray-700 rounded-lg px-4 py-3 mb-3 min-h-[56px] flex flex-col justify-center">
                  {isPlaying ? (
                    <>
                      <p className="text-white font-semibold text-sm">{currentSong.title}</p>
                      <p className="text-gray-400 text-xs">{currentSong.artist}</p>
                    </>
                  ) : (
                    <p className="text-gray-500 text-sm">No song playing</p>
                  )}
                </div>

                {/* Transport controls */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={prev}
                    disabled={!isPlaying || isFirst}
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition
                      bg-gray-700 hover:bg-gray-600 text-white
                      disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-700"
                  >
                    ««
                  </button>

                  <button
                    onClick={next}
                    disabled={isPlaying && isLast}
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition
                      bg-gray-700 hover:bg-gray-600 text-white
                      disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-700"
                  >
                    »»
                  </button>
                </div>
              </section>
            );
          })()}

          {/* ── Pending Requests ── */}
          {totalPending > 0 && (
            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Pending Requests{' '}
                <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full ml-1">{totalPending}</span>
              </h4>
              <div className="space-y-2">
                {pendingSongs.map((song) => (
                  <div key={song.id} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">Song submission</p>
                      <p className="text-xs text-gray-400 truncate">
                        <span className="text-gray-200">{song.submittedByName}</span> wants to add &ldquo;{song.title}&rdquo; by {song.artist}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => onApproveSong(jam.id, song.id)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-2.5 rounded transition">✓</button>
                      <button onClick={() => onRejectSong(jam.id, song.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-2.5 rounded transition">✗</button>
                    </div>
                  </div>
                ))}
                {pendingRoles.map((role) => (
                  <div key={role.id} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">Role application</p>
                      <p className="text-xs text-gray-400 truncate">
                        <span className="text-gray-200">{role.pendingUserName}</span> wants to play{' '}
                        <span className="text-gray-200">{role.instrument}</span> on &ldquo;{role.songTitle}&rdquo;
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => onApproveRole(role.songId, role.id)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-2.5 rounded transition">✓</button>
                      <button onClick={() => onRejectRole(role.songId, role.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-2.5 rounded transition">✗</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Admin Management ── */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Admins</h4>
            <div className="space-y-1 mb-3">
              {jam.admins.map((adminId) => {
                const p = participants.find((x) => x.userId === adminId);
                const canRemove = jam.admins.length > 1;
                return (
                  <div key={adminId} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block shrink-0" />
                      <span className="text-gray-200 truncate">{p?.name || adminId}</span>
                    </div>
                    {canRemove && (
                      <button
                        onClick={() => onRemoveAdmin(jam.id, adminId)}
                        className="text-gray-500 hover:text-red-400 transition-colors text-base font-bold shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700"
                        title="Remove admin"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {nonAdminParticipants.length > 0 ? (
              <div className="flex gap-2" ref={promoteRef}>
                {/* Searchable picker */}
                <div className="flex-1 relative">
                  <button
                    type="button"
                    onClick={() => { setPromoteOpen((v) => !v); setPromoteSearch(''); }}
                    className="w-full flex items-center justify-between bg-gray-700 text-sm rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 px-2.5 py-2"
                  >
                    <span className={selectedPromote ? 'text-white' : 'text-gray-400'}>
                      {selectedPromote ? selectedPromote.name : 'Select participant to promote…'}
                    </span>
                    <span className="text-gray-500 text-xs ml-2">{promoteOpen ? '▲' : '▼'}</span>
                  </button>

                  {promoteOpen && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
                      {/* Search input */}
                      <div className="p-2 border-b border-gray-700">
                        <input
                          autoFocus
                          type="text"
                          value={promoteSearch}
                          onChange={(e) => setPromoteSearch(e.target.value)}
                          placeholder="Search participants…"
                          className="w-full bg-gray-700 text-white text-sm p-1.5 rounded border border-gray-600 focus:outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-500"
                        />
                      </div>
                      {/* Filtered list */}
                      <ul className="max-h-48 overflow-y-auto">
                        {nonAdminParticipants
                          .filter((p) => p.name.toLowerCase().includes(promoteSearch.toLowerCase()))
                          .map((p) => (
                            <li key={p.userId}>
                              <button
                                type="button"
                                onClick={() => { setSelectedPromote(p); setPromoteOpen(false); setPromoteSearch(''); }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                  selectedPromote?.userId === p.userId
                                    ? 'bg-yellow-800 text-yellow-200'
                                    : 'text-gray-200 hover:bg-gray-700'
                                }`}
                              >
                                {p.name}
                              </button>
                            </li>
                          ))}
                        {nonAdminParticipants.filter((p) => p.name.toLowerCase().includes(promoteSearch.toLowerCase())).length === 0 && (
                          <li className="px-3 py-2 text-xs text-gray-500 italic">No matches</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (selectedPromote) {
                      onAddAdmin(jam.id, selectedPromote.userId);
                      setSelectedPromote(null);
                    }
                  }}
                  disabled={!selectedPromote}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold py-2 px-3 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  Add
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No other participants to promote.</p>
            )}
          </section>

          {/* ── Danger Zone ── */}
          <section className="border-t border-red-900 pt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full bg-transparent border border-red-700 hover:bg-red-900 text-red-400 hover:text-red-300 text-sm font-bold py-2 px-4 rounded-lg transition"
              >
                Delete Jam
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-red-400 text-sm text-center">This will permanently delete the jam. Are you sure?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-2 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onDeleteJam(jam.id)}
                    className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm font-bold py-2 rounded-lg transition"
                  >
                    Yes, Delete
                  </button>
                </div>
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  );
};

export default AdminPanel;
