import React, { useEffect, useState, useRef } from 'react';

export const INSTRUMENT_TYPES = [
  'Vocals',
  'Electric Guitar',
  'Acoustic Guitar',
  'Bass Guitar',
  'Drums',
  'Keyboard',
  'Piano',
  'Saxophone',
  'Trumpet',
  'Trombone',
  'Violin',
  'Cello',
  'Harmonica',
  'Flute',
  'Ukulele',
  'Banjo',
  'Mandolin',
  'Percussion',
  'DJ / Turntables',
];

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Professional'];

export const SKILL_COLOR = {
  Beginner:     'bg-gray-600 text-gray-200',
  Intermediate: 'bg-blue-800 text-blue-200',
  Advanced:     'bg-purple-800 text-purple-200',
  Professional: 'bg-yellow-700 text-yellow-200',
};

/** { type, model?, skill } or { name } → display string used everywhere */
export const instrumentLabel = (inst) =>
  typeof inst === 'string'
    ? inst
    : inst.model
      ? `${inst.type} — ${inst.model}`
      : (inst.type ?? inst.instrument ?? inst.name ?? '');

const Profile = ({
  initialUserName,
  initialInstruments,
  initialBio,
  initialRecordingLink,
  initialAvatarUrl,
  onSave,
  onBack,
  onResetData,
  allowDangerousReset = false,
  userId,
}) => {
  const [name,            setName]            = useState(initialUserName);
  const [instruments,     setInstruments]     = useState(initialInstruments || []);
  const [bio,             setBio]             = useState(initialBio || '');
  const [recordingLink,   setRecordingLink]   = useState(initialRecordingLink || '');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [avatarFile,      setAvatarFile]      = useState(null);
  const [avatarRemoved,   setAvatarRemoved]   = useState(false);
  const [avatarFailed,    setAvatarFailed]    = useState(false);

  // Instrument add form state
  const [selType,  setSelType]  = useState('');
  const [selModel, setSelModel] = useState('');
  const [selSkill, setSelSkill] = useState('Intermediate');

  const fileInputRef = useRef(null);
  const displayAvatarUrl = avatarRemoved ? null : (avatarPreviewUrl || initialAvatarUrl || null);

  useEffect(() => {
    setAvatarFailed(false);
  }, [displayAvatarUrl]);

  useEffect(() => {
    setAvatarPreviewUrl(null);
    setAvatarFile(null);
    setAvatarRemoved(false);
    setAvatarFailed(false);
  }, [userId]);

  // ── Avatar ──────────────────────────────────────────────────────────────────
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarRemoved(false);
    setAvatarFailed(false);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreviewUrl(ev.target.result);
    reader.readAsDataURL(file);
  };

  // ── Instruments ─────────────────────────────────────────────────────────────
  const handleAddInstrument = (e) => {
    e.preventDefault();
    if (!selType) return;
    const newInst = { type: selType, model: selModel.trim(), skill: selSkill };
    // prevent exact duplicates
    if (instruments.some((i) => instrumentLabel(i) === instrumentLabel(newInst))) return;
    setInstruments([...instruments, newInst]);
    setSelType(''); setSelModel(''); setSelSkill('Intermediate');
  };

  const removeInstrument = (idx) => setInstruments(instruments.filter((_, i) => i !== idx));

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!name) return;
    onSave({ name, instruments, bio, recordingLink, avatarUrl: displayAvatarUrl, avatarFile });
  };

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    if (!allowDangerousReset || typeof onResetData !== 'function') return;
    const confirmation = window.prompt('Type RESET to delete all app data in this development environment.');
    if (confirmation === 'RESET') {
      onResetData();
    }
  };

  const initials = name?.charAt(0).toUpperCase() || '?';

  return (
    <div className="py-4 space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
        <span className="text-sm font-medium">Back to Jams</span>
      </button>

      <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl shadow-xl space-y-7">
        <h2 className="text-2xl font-bold">Your Profile</h2>

        {/* ... (rest of profile content) ... */}
        {/* I will use a separate replace for the bottom button to keep things clean */}

        {/* ── Avatar ── */}
        <div className="flex items-center gap-5">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="relative w-20 h-20 rounded-full cursor-pointer shrink-0 group"
          >
            {displayAvatarUrl && !avatarFailed ? (
              <img
                src={displayAvatarUrl}
                alt="avatar"
                onError={() => setAvatarFailed(true)}
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-blue-700 flex items-center justify-center text-white text-3xl font-bold">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-40 transition flex items-center justify-center">
              <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100">Change</span>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-400">Profile picture</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-400 hover:text-blue-300 text-sm underline mt-1"
            >
              Upload image
            </button>
            {displayAvatarUrl && (
              <button
                onClick={() => {
                  setAvatarPreviewUrl(null);
                  setAvatarFile(null);
                  setAvatarRemoved(true);
                  setAvatarFailed(false);
                }}
                className="ml-3 text-gray-500 hover:text-red-400 text-sm"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef} type="file" accept="image/*"
            onChange={handleAvatarChange} className="hidden"
          />
        </div>

        {/* ── User ID ── */}
        <div>
          <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="userId">
            User ID
          </label>
          <input
            id="userId" type="text" readOnly value={userId}
            className="w-full bg-gray-700 text-gray-300 p-2 rounded-md cursor-not-allowed text-sm"
          />
        </div>

        {/* ── Display Name ── */}
        <div>
          <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="username">
            Display Name
          </label>
          <input
            id="username" type="text" value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 'GrooveMaster'"
          />
        </div>

        {/* ── Bio (optional) ── */}
        <div>
          <label className="block text-gray-400 text-sm font-bold mb-2">
            Bio <span className="text-gray-600 font-normal">(optional)</span>
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Tell other musicians about yourself…"
            className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
          />
        </div>

        {/* ── Recording link (optional) ── */}
        <div>
          <label className="block text-gray-400 text-sm font-bold mb-2">
            Recording Link <span className="text-gray-600 font-normal">(optional)</span>
          </label>
          <input
            type="url" value={recordingLink}
            onChange={(e) => setRecordingLink(e.target.value)}
            placeholder="https://soundcloud.com/you or YouTube link…"
            className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* ── Instruments ── */}
        <div>
          <label className="block text-gray-400 text-sm font-bold mb-3">Instruments</label>

          {/* Current instrument tags */}
          {instruments.length === 0 ? (
            <p className="text-gray-500 text-sm mb-4">No instruments added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-4">
              {instruments.map((inst, i) => {
                const label = instrumentLabel(inst);
                const skill = typeof inst === 'object' ? inst.skill : null;
                return (
                  <span key={i} className="flex items-center gap-1.5 bg-blue-900 text-blue-200 text-sm font-medium pl-3 pr-2 py-1 rounded-full">
                    <span>{label}</span>
                    {skill && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${SKILL_COLOR[skill] || 'bg-gray-600 text-gray-200'}`}>
                        {skill}
                      </span>
                    )}
                    <button
                      onClick={() => removeInstrument(i)}
                      className="text-blue-400 hover:text-white font-bold leading-none ml-0.5"
                    >
                      &times;
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Add instrument form */}
          <form onSubmit={handleAddInstrument} className="space-y-3">
            <select
              aria-label="Profile instrument"
              value={selType}
              onChange={(e) => { setSelType(e.target.value); setSelModel(''); }}
              className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Select an instrument…</option>
              {INSTRUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            {selType && selType !== 'Vocals' && (
              <input
                type="text" value={selModel}
                onChange={(e) => setSelModel(e.target.value)}
                placeholder={`Model (optional) — e.g. "Les Paul"`}
                className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            )}

            {selType && (
              <select
                aria-label="Profile instrument skill"
                value={selSkill}
                onChange={(e) => setSelSkill(e.target.value)}
                className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {SKILL_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}

            <button
              type="submit" disabled={!selType}
              className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-3 rounded-lg transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Instrument
            </button>
          </form>
        </div>

        <button
          onClick={handleSave}
          disabled={!name}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition shadow disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save Profile →
        </button>

        {allowDangerousReset && typeof onResetData === 'function' && (
          <div className="pt-6 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-3">DEVELOPMENT DANGER ZONE</p>
            <button
              onClick={handleReset}
              className="w-full bg-transparent border border-red-900 hover:bg-red-950 text-red-500 text-xs font-bold py-2 px-4 rounded-lg transition"
            >
              Reset All App Data
            </button>
            <p className="mt-2 text-xs text-gray-500">
              Requires typing RESET before anything is deleted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
