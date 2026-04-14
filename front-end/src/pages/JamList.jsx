import React, { useState } from 'react';
import JamStateBadge from '../components/JamStateBadge';
import { getDistanceKm, formatDistance } from '../utils/geo';

const RADIUS_OPTIONS = [
  { label: 'Any distance', value: null },
  { label: '10 km',  value: 10 },
  { label: '25 km',  value: 25 },
  { label: '50 km',  value: 50 },
  { label: '100 km', value: 100 },
];

const normalizeInviteCodeInput = (value) =>
  value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);

const JamCard = ({ jam, participants, currentUserId, distanceTo, showDistance }) => {
  const dist     = showDistance ? distanceTo(jam) : null;
  const isJoined = jam.isParticipant || participants.some((p) => p.userId === currentUserId);
  // Use the server-supplied count when the full participants array hasn't loaded yet
  const displayCount = participants.length > 0 ? participants.length : (jam.participantCount ?? 0);

  const date = new Date(jam.date);
  const dateStr = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-gray-800 rounded-xl shadow-lg cursor-pointer hover:bg-gray-750 hover:shadow-xl transition-all duration-150 border border-gray-700 hover:border-gray-500 flex flex-col overflow-hidden group">
      <div className={`h-1 w-full ${
        jam.state === 'in-progress' ? 'bg-green-500' :
        jam.state === 'tuning'      ? 'bg-yellow-500' :
        jam.state === 'completed'   ? 'bg-blue-500' :
        'bg-gray-600'
      }`} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex justify-between items-start gap-2">
          <h3 className="text-base font-bold leading-snug text-white group-hover:text-blue-300 transition-colors">
            {jam.name}
          </h3>
          {['tuning', 'in-progress'].includes(jam.state) && (
            <JamStateBadge state={jam.state} />
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-400 text-sm">
            <span className="text-gray-500">🗓</span>
            <span>{dateStr}</span>
            <span className="text-gray-600">·</span>
            <span>{timeStr}</span>
          </div>
          {jam.location?.address && (
            <div className="flex items-center gap-1.5 text-gray-500 text-sm">
              <span>📍</span>
              <span className="truncate">{jam.location.address}</span>
            </div>
          )}
          {dist !== null && (
            <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium">
              <span>↔</span>
              <span>{formatDistance(dist)} away</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-700">
          <span className="text-gray-500 text-xs flex items-center gap-1">
            <span>👥</span>
            {displayCount} participant{displayCount !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            {jam.visibility === 'private' && (
              <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">🔒 Private</span>
            )}
            {isJoined && (
              <span className="text-xs bg-green-900 text-green-400 font-semibold px-2 py-0.5 rounded-full border border-green-800">
                ✓ Joined
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const JamList = ({
  jams,
  onJamClick,
  onNavCreate,
  userLocation,
  onRequestLocation,
  participantsByJamId,
  currentUserId,
  onJoinByInviteCode,
  isGuest,
}) => {
  const [tab,            setTab]            = useState('discover');
  const [radiusKm,       setRadiusKm]       = useState(null);
  const [inviteCode,     setInviteCode]     = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);

  const distanceTo = (jam) => {
    if (!userLocation || !jam.location?.lat) return null;
    return getDistanceKm(userLocation.lat, userLocation.lng, jam.location.lat, jam.location.lng);
  };

  const handleInviteSubmit = (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    onJoinByInviteCode(inviteCode);
    setInviteCode('');
    setShowInviteForm(false);
  };

  const publicJams = jams.filter((j) => j.visibility === 'public');
  const discoverJams = publicJams.filter((jam) => {
    if (!radiusKm || !userLocation || !jam.location?.lat) return true;
    return distanceTo(jam) <= radiusKm;
  });

  const myJams = jams.filter((j) =>
    j.isParticipant ||
    j.created_by === currentUserId ||
    (j.admins || []).includes(currentUserId) ||
    (participantsByJamId[j.id] || []).some((p) => p.userId === currentUserId)
  );

  return (
    <div className="py-4">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1 border border-gray-700">
          {[
            { key: 'discover', label: '🎵 Discover' },
            ...(!isGuest ? [{ key: 'mine', label: `🎸 My Jams${myJams.length ? ` (${myJams.length})` : ''}` }] : []),
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                tab === key
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {!isGuest && (
            <button
              onClick={() => setShowInviteForm((v) => !v)}
              className={`text-sm font-bold py-2 px-3 rounded-lg transition border ${
                showInviteForm
                  ? 'bg-purple-700 border-purple-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              🔗 Enter Invite Code
            </button>
          )}
          {!isGuest && (
            <button
              onClick={onNavCreate}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition shadow"
            >
              + New Jam
            </button>
          )}
        </div>
      </div>

      {/* ── Invite code form ── */}
      {showInviteForm && (
        <div className="bg-gray-800 border border-purple-700 rounded-xl p-4 mb-5">
          <p className="text-sm text-gray-400 mb-3">Enter a private jam invite code to join:</p>
          <form onSubmit={handleInviteSubmit} className="flex gap-2">
            <input
              aria-label="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(normalizeInviteCodeInput(e.target.value))}
              placeholder="e.g. ROCK42"
              maxLength={6}
              className="flex-1 bg-gray-700 text-white p-2.5 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase tracking-widest text-center font-mono text-lg"
            />
            <button
              type="submit"
              disabled={!inviteCode.trim()}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Join
            </button>
          </form>
        </div>
      )}

      {/* ── Discover tab ── */}
      {tab === 'discover' && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-5 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5">
            {!userLocation ? (
              <button
                onClick={onRequestLocation}
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors"
              >
                <span>📍</span>
                <span className="underline underline-offset-2">Enable location for radius filter</span>
              </button>
            ) : (
              <span className="text-sm text-green-400 flex items-center gap-1.5">
                <span>📍</span> Location active
              </span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-sm text-gray-400">Radius:</label>
              <select
                value={radiusKm ?? ''}
                onChange={(e) => setRadiusKm(e.target.value ? Number(e.target.value) : null)}
                disabled={!userLocation}
                className="bg-gray-700 text-white text-sm p-1.5 rounded-lg border border-gray-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {RADIUS_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? ''}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {discoverJams.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-4">🎸</p>
              <p className="text-gray-300 font-semibold text-lg mb-1">No public jams found</p>
              <p className="text-gray-500 text-sm mb-5">
                {radiusKm ? `No jams within ${radiusKm} km of your location.` : 'Be the first to create one!'}
              </p>
              <button onClick={onNavCreate} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-5 rounded-lg transition">
                + Create a Jam
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {discoverJams.map((jam) => (
                <div key={jam.id} onClick={() => onJamClick(jam.id)}>
                  <JamCard
                    jam={jam}
                    participants={participantsByJamId[jam.id] || []}
                    currentUserId={currentUserId}
                    distanceTo={distanceTo}
                    showDistance={!!userLocation}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── My Jams tab ── */}
      {tab === 'mine' && (
        myJams.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">🎵</p>
            <p className="text-gray-300 font-semibold text-lg mb-1">You haven't joined any jams yet</p>
            <p className="text-gray-500 text-sm mb-5">Discover public jams or create your own.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setTab('discover')} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition">
                Browse Jams
              </button>
              <button onClick={onNavCreate} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition">
                + Create a Jam
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myJams.map((jam) => (
              <div key={jam.id} onClick={() => onJamClick(jam.id)}>
                <JamCard
                  jam={jam}
                  participants={participantsByJamId[jam.id] || []}
                  currentUserId={currentUserId}
                  distanceTo={distanceTo}
                  showDistance={false}
                />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default JamList;
