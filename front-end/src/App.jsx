import React, { useState, useMemo, useEffect } from 'react';

import Modal from './components/Modal';
import Header from './components/Header';
import ImportSongModal from './components/ImportSongModal';
import JoinJamModal from './components/JoinJamModal';
import UserProfileModal from './components/UserProfileModal';

import Login from './pages/Login';
import Profile from './pages/Profile';
import JamList from './pages/JamList';
import CreateJamForm from './pages/CreateJamForm';
import JamDetail from './pages/JamDetail';
import SongDetail from './pages/SongDetail';

import { instrumentLabel } from './pages/Profile';
import { auth, onAuthStateChanged } from './services/firebase';
import * as api from './services/api';

// ─── Mock User ────────────────────────────────────────────────────────────────
const MOCK_USER = {
  id: 'user-1',
  name: 'Alex Rivera',
  bio: 'Guitarist & occasional vocalist. Love blues and jazz.',
  recordingLink: '',
  avatarUrl: null,
  instruments: [
    { name: 'guitar', skillLevel: 'advanced' },
    { name: 'bass',   skillLevel: 'beginner' },
  ],
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const INITIAL_JAMS = [
  {
    id: 'jam-1',
    name: 'Thursday Blues Night',
    date: '2025-04-17T20:00',
    location: { address: 'The Rusty Nail, 12 Main St', lat: 37.7749, lng: -122.4194 },
    visibility: 'public',
    state: 'initial',
    admins: ['user-1'],
    invite_code: null,
    settings: { requireRoleApproval: false, requireSongApproval: false },
    currentSongId: null,
  },
  {
    id: 'jam-2',
    name: 'Weekend Rock Session',
    date: '2025-04-19T18:00',
    location: { address: 'Studio B, 45 Oak Ave', lat: 37.785, lng: -122.4 },
    visibility: 'public',
    state: 'tuning',
    admins: ['user-2'],
    invite_code: null,
    settings: { requireRoleApproval: true, requireSongApproval: false },
    currentSongId: null,
  },
  {
    id: 'jam-3',
    name: 'Private Jazz Jam',
    date: '2025-04-20T19:00',
    location: { address: 'Hidden Gem Bar, 7 Elm St', lat: 37.77, lng: -122.42 },
    visibility: 'private',
    state: 'initial',
    admins: ['user-1'],
    invite_code: 'JAZZ42',
    settings: { requireRoleApproval: false, requireSongApproval: true },
    currentSongId: null,
  },
];

const INITIAL_SONGS = {
  'jam-1': [
    { id: 'song-1', title: 'Stormy Monday', artist: 'T-Bone Walker', status: 'approved', submittedBy: 'user-1' },
    { id: 'song-2', title: 'The Thrill Is Gone', artist: 'B.B. King', status: 'approved', submittedBy: 'user-2' },
  ],
  'jam-2': [
    { id: 'song-3', title: 'Whole Lotta Love', artist: 'Led Zeppelin', status: 'approved', submittedBy: 'user-2' },
  ],
  'jam-3': [],
};

const INITIAL_ROLES = {
  'song-1': [
    { id: 'role-1', instrument: 'guitar',  ownerId: 'user-1', joinedByUserId: null, pendingUserId: null },
    { id: 'role-2', instrument: 'bass',    ownerId: 'user-2', joinedByUserId: null, pendingUserId: null },
    { id: 'role-3', instrument: 'drums',   ownerId: 'user-3', joinedByUserId: null, pendingUserId: null },
    { id: 'role-4', instrument: 'vocals',  ownerId: null,     joinedByUserId: null, pendingUserId: null },
  ],
  'song-2': [
    { id: 'role-5', instrument: 'guitar',  ownerId: 'user-1', joinedByUserId: null, pendingUserId: null },
    { id: 'role-6', instrument: 'piano',   ownerId: 'user-4', joinedByUserId: null, pendingUserId: null },
  ],
  'song-3': [
    { id: 'role-7', instrument: 'guitar',  ownerId: 'user-2', joinedByUserId: null, pendingUserId: null },
    { id: 'role-8', instrument: 'bass',    ownerId: 'user-3', joinedByUserId: null, pendingUserId: null },
    { id: 'role-9', instrument: 'drums',   ownerId: 'user-1', joinedByUserId: null, pendingUserId: null },
  ],
};

const INITIAL_PARTICIPANTS = {
  'jam-1': [
    { userId: 'user-1', name: 'Alex Rivera',   bio: 'Guitarist & occasional vocalist.', recordingLink: '', avatarUrl: null, instrumentObjects: [{ name: 'guitar', skillLevel: 'advanced' }, { name: 'bass', skillLevel: 'beginner' }] },
    { userId: 'user-2', name: 'Jordan Lee',    bio: 'Bass player, 10+ years.',          recordingLink: '', avatarUrl: null, instrumentObjects: [{ name: 'bass',   skillLevel: 'intermediate' }] },
    { userId: 'user-3', name: 'Sam Torres',    bio: 'Drummer and percussionist.',        recordingLink: '', avatarUrl: null, instrumentObjects: [{ name: 'drums',  skillLevel: 'advanced' }] },
  ],
  'jam-2': [
    { userId: 'user-2', name: 'Jordan Lee',    bio: 'Bass player, 10+ years.',          recordingLink: '', avatarUrl: null, instrumentObjects: [{ name: 'bass',   skillLevel: 'intermediate' }] },
    { userId: 'user-4', name: 'Morgan Davis',  bio: 'Keys and synths.',                 recordingLink: '', avatarUrl: null, instrumentObjects: [{ name: 'piano',  skillLevel: 'advanced' }] },
  ],
  'jam-3': [
    { userId: 'user-1', name: 'Alex Rivera',   bio: 'Guitarist & occasional vocalist.', recordingLink: '', avatarUrl: null, instrumentObjects: [{ name: 'guitar', skillLevel: 'advanced' }] },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
let nextId = 100;
const uid = () => `id-${++nextId}`;

// Normalises a raw instrument record (any source) to the Profile shape { type, model, skill }
function normalizeInstrument(inst) {
  if (typeof inst === 'string') return { type: inst, model: '', skill: 'Intermediate' };
  return {
    type:  inst.instrument ?? inst.type  ?? inst.name  ?? '',
    model: inst.model ?? '',
    skill: inst.skill_level ?? inst.skill ?? inst.skillLevel ?? 'Intermediate',
  };
}

// Converts a backend ParticipantOut to the frontend participant shape
function normalizeParticipant(p) {
  const user = p.user ?? p;
  return {
    userId: user.id,
    name: user.name,
    bio: user.bio ?? '',
    recordingLink: user.recording_link ?? '',
    avatarUrl: user.avatar_url ?? null,
    instrumentObjects: (user.instruments || []).map(normalizeInstrument),
  };
}

// Converts a backend-shaped JamOut to the frontend shape used throughout the app
function normalizeJam(j) {
  return {
    id: String(j.id),
    name: j.name,
    date: j.date,
    location: {
      address: j.address ?? j.location?.address ?? '',
      lat:     j.lat     ?? j.location?.lat     ?? null,
      lng:     j.lng     ?? j.location?.lng      ?? null,
    },
    visibility: j.visibility,
    state:      j.state,
    admins:     j.admin_ids ?? j.admins ?? [],
    invite_code: j.invite_code ?? null,
    settings: {
      requireRoleApproval: j.require_role_approval ?? j.settings?.requireRoleApproval ?? false,
      requireSongApproval: j.require_song_approval ?? j.settings?.requireSongApproval ?? false,
    },
    currentSongId: j.current_song_id ?? j.currentSongId ?? null,
    created_by: j.created_by ?? null,
  };
}

function normalizeRole(r) {
  return {
    id: String(r.id),
    song_id: r.song_id,
    instrument: r.instrument,
    ownerId: r.owner_id ?? r.ownerId ?? null,
    joinedByUserId: r.joined_by ?? r.joinedByUserId ?? null,
    joinedByUserName: r.joined_by_name ?? r.joinedByUserName ?? null,
    pendingUserId: r.pending_user ?? r.pendingUserId ?? null,
    pendingUserName: r.pending_user_name ?? r.pendingUserName ?? null,
  };
}

function createRolesFromParticipants(songId, participants) {
  return participants.flatMap((p) =>
    (p.instrumentObjects || []).map((inst) => ({
      id: uid(),
      // Handle both { type } (Profile shape) and { name } (legacy mock shape)
      instrument: inst.type ?? inst.name ?? String(inst),
      ownerId: p.userId,
      joinedByUserId: null,
      pendingUserId: null,
    }))
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // Auth state: null = loading, false = guest, firebase user object = logged in
  const [firebaseUser,  setFirebaseUser]  = useState(undefined); // undefined = still loading
  const [userName,          setUserName]          = useState('');
  const [userInstruments,   setUserInstruments]   = useState([]);
  const [userBio,            setUserBio]            = useState('');
  const [userRecordingLink,  setUserRecordingLink]  = useState('');
  const [userAvatarUrl,      setUserAvatarUrl]      = useState(null);

  const userId = firebaseUser?.uid ?? 'guest';

  // Listen for Firebase auth state — sync user profile + jams from backend
  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser ?? null);
      if (fbUser) {
        try {
          // Create user in DB on first login, fetch profile otherwise
          let profile;
          try {
            profile = await api.getMe();
          } catch {
            profile = await api.createUser({
              id: fbUser.uid,
              name: fbUser.displayName ?? 'Musician',
              avatar_url: fbUser.photoURL ?? '',
            });
          }
          setUserName(profile.name);
          setUserBio(profile.bio ?? '');
          setUserRecordingLink(profile.recording_link ?? '');
          setUserAvatarUrl(profile.avatar_url ?? '');
          setUserInstruments((profile.instruments || []).map(normalizeInstrument));

          // Load public jams from backend
          const backendJams = await api.listJams();
          setJams(backendJams.map(normalizeJam));
        } catch {
          // Backend not reachable — keep mock data
        }
      }
    });
  }, []);

  // Navigation
  const [currentView,    setCurrentView]    = useState('jamList');
  const [selectedJamId,  setSelectedJamId]  = useState(null);
  const [selectedSongId, setSelectedSongId] = useState(null);

  // Data
  const [jams,                setJams]                = useState([]);
  const [songsByJamId,        setSongsByJamId]        = useState({});
  const [rolesBySongId,       setRolesBySongId]       = useState({});
  const [participantsByJamId, setParticipantsByJamId] = useState({});

  // ── Real-time Events (SSE) ────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser || !selectedJamId) return;

    const eventSource = new EventSource(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/events/jam/${selectedJamId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Real-time event:", data);

        if (data.type === 'jam_updated') {
          setJams(prev => prev.map(j => j.id === data.jam.id ? normalizeJam(data.jam) : j));
        } else if (data.type === 'song_added' || data.type === 'song_updated') {
          // Re-fetch songs for the jam
          api.listSongs(selectedJamId).then(songs => {
            setSongsByJamId(prev => ({ ...prev, [selectedJamId]: songs.map(s => ({ ...s, id: String(s.id) })) }));
          });
        } else if (data.type === 'participant_joined' || data.type === 'participant_left') {
          // Re-fetch participants
          api.listParticipants(selectedJamId).then(parts => {
            setParticipantsByJamId(prev => ({ ...prev, [selectedJamId]: parts.map(normalizeParticipant) }));
          });
        } else if (data.type === 'role_updated') {
          // Re-fetch roles if a song is selected
          if (selectedSongId) {
            api.listRoles(selectedSongId).then(roles => {
              setRolesBySongId(prev => ({ ...prev, [selectedSongId]: roles }));
            });
          }
        }
      } catch (e) {
        console.error("Error parsing real-time event", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [firebaseUser, selectedJamId, selectedSongId]);

  // UI
  const [modal,             setModal]             = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [joiningJamId,      setJoiningJamId]      = useState(null);
  const [viewingParticipant, setViewingParticipant] = useState(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentJam = useMemo(
    () => jams.find((j) => j.id === selectedJamId) || null,
    [jams, selectedJamId]
  );
  const currentSongs = useMemo(
    () => songsByJamId[selectedJamId] || [],
    [songsByJamId, selectedJamId]
  );
  const currentSong = useMemo(
    () => (songsByJamId[selectedJamId] || []).find((s) => s.id === selectedSongId) || null,
    [songsByJamId, selectedJamId, selectedSongId]
  );
  const currentRoles = useMemo(
    () => rolesBySongId[selectedSongId] || [],
    [rolesBySongId, selectedSongId]
  );
  const currentParticipants = useMemo(
    () => participantsByJamId[selectedJamId] || [],
    [participantsByJamId, selectedJamId]
  );
  const isCurrentJamAdmin = useMemo(
    () => !!currentJam?.admins.includes(userId),
    [currentJam, userId]
  );
  const isCurrentJamParticipant = useMemo(
    () => currentParticipants.some((p) => p.userId === userId),
    [currentParticipants, userId]
  );

  // ── Profile ────────────────────────────────────────────────────────────────
  const handleUpdateProfile = async ({ name: newName, instruments: newInstruments, bio, recordingLink, avatarUrl }) => {
    if (!newName) return;

    if (firebaseUser) {
      try {
        await api.updateMe({
          name: newName,
          bio,
          recording_link: recordingLink,
          avatar_url: avatarUrl,
          // Convert Profile shape { type, model, skill } → backend shape { instrument, skill_level }
          instruments: newInstruments.map((inst) => ({
            instrument: inst.model
              ? `${inst.type} — ${inst.model}`
              : (inst.type ?? inst.name ?? ''),
            skill_level: (inst.skill ?? inst.skillLevel ?? '').toLowerCase(),
          })),
        });
      } catch (e) {
        setModal({ title: 'Error', message: `Could not save profile: ${e.message}` });
        return;
      }
    }

    setUserName(newName);
    setUserInstruments(newInstruments);
    setUserBio(bio);
    setUserRecordingLink(recordingLink);
    setUserAvatarUrl(avatarUrl);
    // Sync participant record in all jams
    setParticipantsByJamId((prev) => {
      const updated = {};
      for (const [jamId, participants] of Object.entries(prev)) {
        updated[jamId] = participants.map((p) =>
          p.userId === userId
            ? { ...p, name: newName, bio, recordingLink, avatarUrl, instrumentObjects: newInstruments }
            : p
        );
      }
      return updated;
    });
    setModal({ title: 'Saved', message: 'Profile updated.' });
    setCurrentView('jamList');
  };

  // ── Create Jam ─────────────────────────────────────────────────────────────
  const handleCreateJam = async (name, date, locationData, visibility) => {
    let newJam;

    if (firebaseUser) {
      try {
        const backendJam = await api.createJam({
          name,
          date,
          visibility,
          address: locationData.address,
          lat: locationData.lat,
          lng: locationData.lng,
        });
        newJam = normalizeJam(backendJam);
      } catch (e) {
        setModal({ title: 'Error', message: `Could not create jam: ${e.message}` });
        return;
      }
    } else {
      // Guest / offline fallback — local state only
      newJam = {
        id: uid(),
        name,
        date,
        location: locationData,
        visibility,
        state: 'initial',
        admins: [userId],
        invite_code: visibility === 'private' ? Math.random().toString(36).substring(2, 8).toUpperCase() : null,
        settings: { requireRoleApproval: false, requireSongApproval: false },
        currentSongId: null,
      };
    }

    setJams((prev) => [...prev, newJam]);
    setParticipantsByJamId((prev) => ({
      ...prev,
      [newJam.id]: [{
        userId,
        name: userName,
        bio: userBio,
        recordingLink: userRecordingLink,
        avatarUrl: userAvatarUrl,
        instrumentObjects: userInstruments,
      }],
    }));
    setSongsByJamId((prev) => ({ ...prev, [newJam.id]: [] }));
    const msg = visibility === 'private'
      ? `Private jam created! Invite code: ${newJam.invite_code}`
      : 'Jam created!';
    setModal({ title: 'Success', message: msg });
    setCurrentView('jamList');
  };

  // ── Jam State ──────────────────────────────────────────────────────────────
  const handleAdvanceJamState = async (jamId, newState) => {
    if (firebaseUser) {
      try {
        const backendJam = await api.updateJam(jamId, { state: newState });
        const jam = normalizeJam(backendJam);
        setJams((prev) => prev.map((j) => j.id === jamId ? jam : j));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not update state: ${e.message}` });
      }
    } else {
      setJams((prev) => prev.map((j) => j.id === jamId ? { ...j, state: newState } : j));
    }
  };

  // ── Jam Settings ───────────────────────────────────────────────────────────
  const handleUpdateJamSettings = async (jamId, patch) => {
    if (firebaseUser) {
      try {
        // Map patch keys to backend snake_case if needed
        const backendPatch = {};
        if (patch.requireRoleApproval !== undefined) backendPatch.require_role_approval = patch.requireRoleApproval;
        if (patch.requireSongApproval !== undefined) backendPatch.require_song_approval = patch.requireSongApproval;
        
        const backendJam = await api.updateJam(jamId, backendPatch);
        const jam = normalizeJam(backendJam);
        setJams((prev) => prev.map((j) => j.id === jamId ? jam : j));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not update settings: ${e.message}` });
      }
    } else {
      setJams((prev) =>
        prev.map((j) => j.id === jamId ? { ...j, settings: { ...j.settings, ...patch } } : j)
      );
    }
  };

  // ── Current Song ───────────────────────────────────────────────────────────
  const handleSetCurrentSong = async (jamId, songId) => {
    if (firebaseUser) {
      try {
        const backendJam = await api.updateJam(jamId, { current_song_id: songId });
        const jam = normalizeJam(backendJam);
        setJams((prev) => prev.map((j) => j.id === jamId ? jam : j));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not set current song: ${e.message}` });
      }
    } else {
      setJams((prev) => prev.map((j) => j.id === jamId ? { ...j, currentSongId: songId } : j));
    }
  };

  // ── Join Jam ───────────────────────────────────────────────────────────────
  const handleJoinJam = (jamId) => {
    setJoiningJamId(jamId);
  };

  const handleConfirmJoin = async (jamId, selectedInstruments) => {
    if (firebaseUser) {
      try {
        await api.joinJam(jamId);
        
        // Add each instrument to the hardware set
        for (const inst of selectedInstruments) {
          await api.addHardware(jamId, inst);
        }

        const parts = await api.listParticipants(jamId);
        setParticipantsByJamId((prev) => ({
          ...prev,
          [jamId]: parts.map(normalizeParticipant),
        }));
        
        // Update jam locally to show new hardware
        const updatedJam = await api.getJam(jamId);
        setJams(prev => prev.map(j => j.id === jamId ? normalizeJam(updatedJam) : j));

      } catch (e) {
        setModal({ title: 'Error', message: `Could not join jam: ${e.message}` });
        setJoiningJamId(null);
        return;
      }
    } else {
      // Guest fallback (unchanged for now or simplified)
      setParticipantsByJamId((prev) => {
        const existing = prev[jamId] || [];
        if (existing.some((p) => p.userId === userId)) return prev;
        return {
          ...prev,
          [jamId]: [...existing, {
            userId,
            name: userName,
            bio: userBio,
            recordingLink: userRecordingLink,
            avatarUrl: userAvatarUrl,
            instrumentObjects: userInstruments,
          }],
        };
      });
    }
    setJoiningJamId(null);
    setModal({ title: 'Joined!', message: 'You are now a participant.' });
  };

  // ── Join by Invite Code ────────────────────────────────────────────────────
  const handleJoinByInviteCode = async (code) => {
    try {
      const backendJam = await api.getJamByCode(code.trim().toUpperCase());
      const jam = normalizeJam(backendJam);
      
      // Add to local list if not there
      setJams(prev => prev.some(j => j.id === jam.id) ? prev : [...prev, jam]);
      
      handleJoinJam(jam.id);
    } catch (e) {
      setModal({ title: 'Invalid Code', message: 'No jam found with that invite code.' });
    }
  };

  // ── Delete Jam ─────────────────────────────────────────────────────────────
  const handleDeleteJam = async (jamId) => {
    if (firebaseUser) {
      try {
        await api.deleteJam(jamId);
      } catch (e) {
        setModal({ title: 'Error', message: `Could not delete: ${e.message}` });
        return;
      }
    }
    setJams((prev) => prev.filter((j) => j.id !== jamId));
    goHome();
  };

  // ── Leave Jam ──────────────────────────────────────────────────────────────
  const handleLeaveJam = async (jamId) => {
    if (firebaseUser) {
      try {
        await api.leaveJam(jamId);
      } catch (e) {
        setModal({ title: 'Error', message: `Could not leave: ${e.message}` });
        return;
      }
    }
    setParticipantsByJamId((prev) => ({
      ...prev,
      [jamId]: (prev[jamId] || []).filter((p) => p.userId !== userId),
    }));
    goHome();
  };

  const handleAddHardware = async (jamId, instrument) => {
    try {
      const backendJam = await api.addHardware(jamId, instrument);
      setJams(prev => prev.map(j => j.id === jamId ? normalizeJam(backendJam) : j));
      // Re-fetch roles for the current song if any, since new roles were created in backend
      if (selectedSongId) {
        const roles = await api.listRoles(selectedSongId);
        setRolesBySongId(prev => ({ ...prev, [selectedSongId]: roles }));
      }
    } catch (e) {
      setModal({ title: 'Error', message: `Could not add hardware: ${e.message}` });
    }
  };

  // ── Add Admin ──────────────────────────────────────────────────────────────
  const handleAddAdmin = async (jamId, targetUserId) => {
    if (firebaseUser) {
      try {
        const backendJam = await api.addAdmin(jamId, targetUserId);
        const jam = normalizeJam(backendJam);
        setJams((prev) => prev.map((j) => j.id === jamId ? jam : j));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not add admin: ${e.message}` });
      }
    } else {
      setJams((prev) =>
        prev.map((j) =>
          j.id === jamId && !j.admins.includes(targetUserId)
            ? { ...j, admins: [...j.admins, targetUserId] }
            : j
        )
      );
    }
  };

  // ── Remove Admin ───────────────────────────────────────────────────────────
  const handleRemoveAdmin = async (jamId, adminId) => {
    if (firebaseUser) {
      try {
        const backendJam = await api.removeAdmin(jamId, adminId);
        const jam = normalizeJam(backendJam);
        setJams((prev) => prev.map((j) => j.id === jamId ? jam : j));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not remove admin: ${e.message}` });
      }
    } else {
      setJams((prev) =>
        prev.map((j) =>
          j.id === jamId && j.admins.length > 1
            ? { ...j, admins: j.admins.filter((a) => a !== adminId) }
            : j
        )
      );
    }
  };

  // ── Add Song ───────────────────────────────────────────────────────────────
  const handleAddSong = async (title, artist) => {
    if (!selectedJamId) return;
    const jam = jams.find((j) => j.id === selectedJamId);
    const needsApproval = jam?.settings?.requireSongApproval;

    if (firebaseUser) {
      try {
        const backendSong = await api.submitSong(selectedJamId, { title, artist });
        const newSong = { ...backendSong, id: String(backendSong.id) };
        setSongsByJamId((prev) => ({
          ...prev,
          [selectedJamId]: [...(prev[selectedJamId] || []), newSong],
        }));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not add song: ${e.message}` });
        return;
      }
    } else {
      const newSong = { id: uid(), title, artist, status: needsApproval ? 'pending' : 'approved', submittedBy: userId };
      const participants = participantsByJamId[selectedJamId] || [];
      const newRoles = createRolesFromParticipants(newSong.id, participants);
      setSongsByJamId((prev) => ({
        ...prev,
        [selectedJamId]: [...(prev[selectedJamId] || []), newSong],
      }));
      setRolesBySongId((prev) => ({ ...prev, [newSong.id]: newRoles }));
    }

    setModal({
      title: needsApproval ? 'Submitted' : 'Added',
      message: needsApproval ? 'Song submitted — waiting for admin approval.' : 'Song added to setlist!',
    });
    setIsImportModalOpen(false);
  };

  // ── Approve / Reject Song ──────────────────────────────────────────────────
  const handleApproveSong = async (jamId, songId) => {
    if (firebaseUser) {
      try {
        await api.updateSong(songId, { status: 'approved' });
        // Local update for responsiveness
        setSongsByJamId((prev) => ({
          ...prev,
          [jamId]: (prev[jamId] || []).map((s) => s.id === songId ? { ...s, status: 'approved' } : s),
        }));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not approve song: ${e.message}` });
      }
    } else {
      setSongsByJamId((prev) => ({
        ...prev,
        [jamId]: (prev[jamId] || []).map((s) => s.id === songId ? { ...s, status: 'approved' } : s),
      }));
    }
  };

  const handleRejectSong = async (jamId, songId) => {
    if (firebaseUser) {
      try {
        await api.deleteSong(songId);
      } catch (e) {
        setModal({ title: 'Error', message: `Could not reject: ${e.message}` });
        return;
      }
    }
    setSongsByJamId((prev) => ({
      ...prev,
      [jamId]: (prev[jamId] || []).filter((s) => s.id !== songId),
    }));
  };

  // ── Delete / Edit Song ─────────────────────────────────────────────────────
  const handleDeleteSong = async (jamId, songId) => {
    if (firebaseUser) {
      try {
        await api.deleteSong(songId);
      } catch (e) {
        setModal({ title: 'Error', message: `Could not delete: ${e.message}` });
        return;
      }
    }
    setSongsByJamId((prev) => ({
      ...prev,
      [jamId]: (prev[jamId] || []).filter((s) => s.id !== songId),
    }));
  };

  const handleEditSong = async (jamId, songId, newTitle, newArtist) => {
    if (firebaseUser) {
      try {
        await api.updateSong(songId, { title: newTitle, artist: newArtist });
        setSongsByJamId((prev) => ({
          ...prev,
          [jamId]: (prev[jamId] || []).map((s) =>
            s.id === songId ? { ...s, title: newTitle, artist: newArtist } : s
          ),
        }));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not edit: ${e.message}` });
      }
    } else {
      setSongsByJamId((prev) => ({
        ...prev,
        [jamId]: (prev[jamId] || []).map((s) =>
          s.id === songId ? { ...s, title: newTitle, artist: newArtist } : s
        ),
      }));
    }
  };

  // ── Apply / Leave Role ─────────────────────────────────────────────────────
  const handleApplyForRole = async (roleId) => {
    if (!selectedSongId) return;

    if (firebaseUser) {
      try {
        await api.claimRole(roleId);
        const roles = await api.listRoles(selectedSongId);
        setRolesBySongId((prev) => ({ ...prev, [selectedSongId]: roles }));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not claim role: ${e.message}` });
      }
    } else {
      const jam = jams.find((j) => j.id === selectedJamId);
      const needsApproval = jam?.settings?.requireRoleApproval;
      setRolesBySongId((prev) => ({
        ...prev,
        [selectedSongId]: (prev[selectedSongId] || []).map((r) => {
          if (r.id !== roleId) return r;
          if (needsApproval) return { ...r, pendingUserId: userId };
          return { ...r, joinedByUserId: userId };
        }),
      }));
    }
  };

  const handleLeaveRole = async (roleId) => {
    if (!selectedSongId) return;

    if (firebaseUser) {
      try {
        await api.leaveRole(roleId);
        const roles = await api.listRoles(selectedSongId);
        setRolesBySongId((prev) => ({ ...prev, [selectedSongId]: roles }));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not leave role: ${e.message}` });
      }
    } else {
      setRolesBySongId((prev) => ({
        ...prev,
        [selectedSongId]: (prev[selectedSongId] || []).map((r) =>
          r.id === roleId ? { ...r, joinedByUserId: null, pendingUserId: null } : r
        ),
      }));
    }
  };

  // ── Approve / Reject Role ──────────────────────────────────────────────────
  const handleApproveRole = async (songId, roleId) => {
    if (firebaseUser) {
      try {
        await api.approveRole(roleId);
        const roles = await api.listRoles(songId);
        setRolesBySongId((prev) => ({ ...prev, [songId]: roles }));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not approve: ${e.message}` });
      }
    } else {
      setRolesBySongId((prev) => ({
        ...prev,
        [songId]: (prev[songId] || []).map((r) =>
          r.id === roleId ? { ...r, joinedByUserId: r.pendingUserId, pendingUserId: null } : r
        ),
      }));
    }
  };

  const handleRejectRole = async (songId, roleId) => {
    if (firebaseUser) {
      try {
        await api.rejectRole(roleId);
        const roles = await api.listRoles(songId);
        setRolesBySongId((prev) => ({ ...prev, [songId]: roles }));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not reject: ${e.message}` });
      }
    } else {
      setRolesBySongId((prev) => ({
        ...prev,
        [songId]: (prev[songId] || []).map((r) =>
          r.id === roleId ? { ...r, pendingUserId: null } : r
        ),
      }));
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goHome           = () => { setCurrentView('jamList');  setSelectedJamId(null); setSelectedSongId(null); };
  const handleNavProfile = () => setCurrentView('profile');
  const handleNavJam     = async (jamId) => {
    setSelectedJamId(jamId);
    setSelectedSongId(null);
    setCurrentView('jamDetail');
    // Fetch participants from backend if we don't have them locally yet
    if (firebaseUser && !participantsByJamId[jamId]) {
      try {
        const backendParticipants = await api.listParticipants(jamId);
        setParticipantsByJamId((prev) => ({
          ...prev,
          [jamId]: backendParticipants.map(normalizeParticipant),
        }));
      } catch {
        // ignore — will show empty list
      }
    }
  };
  const handleNavSong      = (songId) => { setSelectedSongId(songId); setCurrentView('songDetail'); };
  const handleNavBackToJam = () => { setSelectedSongId(null); setCurrentView('jamDetail'); };

  // ── Render ──────────────────────────────────────────────────────────────────

  // Still resolving auth state
  if (firebaseUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!firebaseUser) {
    return <Login />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'jamList':
        return (
          <JamList
            jams={jams}
            onJamClick={handleNavJam}
            onNavCreate={() => setCurrentView('createJam')}
            userId={userId}
            participantsByJamId={participantsByJamId}
          />
        );

      case 'createJam':
        return <CreateJamForm onCreateJam={handleCreateJam} onCancel={goHome} />;

      case 'jamDetail':
        return (
          <JamDetail
            jam={currentJam}
            songs={currentSongs}
            onSongClick={handleNavSong}
            onAddSong={handleAddSong}
            onBack={goHome}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            isAdmin={isCurrentJamAdmin}
            isParticipant={isCurrentJamParticipant}
            onJoinJam={handleJoinJam}
            onLeaveJam={handleLeaveJam}
            participants={currentParticipants}
            rolesBySongId={rolesBySongId}
            onAdvanceState={handleAdvanceJamState}
            onUpdateSettings={handleUpdateJamSettings}
            onSetCurrentSong={handleSetCurrentSong}
            onApproveSong={handleApproveSong}
            onRejectSong={handleRejectSong}
            onApproveRole={handleApproveRole}
            onRejectRole={handleRejectRole}
            onAddAdmin={handleAddAdmin}
            onRemoveAdmin={handleRemoveAdmin}
            onDeleteJam={handleDeleteJam}
            onDeleteSong={handleDeleteSong}
            onEditSong={handleEditSong}
            onAddHardware={handleAddHardware}
            onViewParticipant={setViewingParticipant}
            currentUserId={userId}
          />
        );

      case 'songDetail':
        return (
          <SongDetail
            song={currentSong}
            roles={currentRoles}
            onApplyForRole={handleApplyForRole}
            onLeaveRole={handleLeaveRole}
            onBack={handleNavBackToJam}
            currentUserId={userId}
            isParticipant={isCurrentJamParticipant}
            requiresApproval={currentJam?.settings.requireRoleApproval ?? false}
            jamState={currentJam?.state}
          />
        );

      case 'profile':
        return (
          <Profile
            initialUserName={userName}
            initialInstruments={userInstruments}
            initialBio={userBio}
            initialRecordingLink={userRecordingLink}
            initialAvatarUrl={userAvatarUrl}
            onSave={handleUpdateProfile}
            onBack={goHome}
            userId={userId}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      {modal && <Modal title={modal.title} message={modal.message} onClose={() => setModal(null)} />}

      {isImportModalOpen && (
        <ImportSongModal
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleAddSong}
        />
      )}

      {joiningJamId && (
        <JoinJamModal
          jam={jams.find(j => j.id === joiningJamId)}
          userInstruments={userInstruments}
          onConfirm={(selected) => handleConfirmJoin(joiningJamId, selected)}
          onCancel={() => setJoiningJamId(null)}
        />
      )}

      {viewingParticipant && (
        <UserProfileModal
          participant={viewingParticipant}
          onClose={() => setViewingParticipant(null)}
        />
      )}

      <Header
        userId={userId}
        userName={userName || 'Guest'}
        avatarUrl={userAvatarUrl}
        onNavProfile={firebaseUser ? handleNavProfile : null}
        onNavHome={goHome}
        onLogout={firebaseUser ? () => import('./services/firebase').then(m => m.logout()) : null}
      />
      <main className="max-w-4xl mx-auto px-4">{renderView()}</main>
    </div>
  );
}
