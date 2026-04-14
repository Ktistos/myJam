import React, { useState, useMemo, useEffect, useRef } from 'react';

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
  const inviteCode = j.invite_code ?? j.inviteCode ?? null;
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
    inviteCode,
    invite_code: inviteCode,
    settings: {
      requireRoleApproval: j.require_role_approval ?? j.settings?.requireRoleApproval ?? false,
      requireSongApproval: j.require_song_approval ?? j.settings?.requireSongApproval ?? false,
      requireHardwareApproval: j.require_hardware_approval ?? j.settings?.requireHardwareApproval ?? false,
    },
    currentSongId: j.current_song_id ?? j.currentSongId ?? null,
    created_by: j.created_by ?? null,
    participantCount: j.participant_count ?? j.participantCount ?? null,
    isParticipant: j.is_participant ?? j.isParticipant ?? false,
  };
}

function normalizeSong(s) {
  return {
    id: String(s.id),
    jamId: String(s.jam_id ?? s.jamId ?? ''),
    title: s.title,
    artist: s.artist ?? '',
    status: s.status,
    submittedBy: s.submitted_by ?? s.submittedBy ?? null,
    submittedByName: s.submitted_by_name ?? s.submittedByName ?? '',
    createdAt: s.created_at ?? s.createdAt ?? null,
  };
}

function normalizeRole(r) {
  return {
    id: String(r.id),
    songId: String(r.song_id ?? r.songId ?? ''),
    song_id: String(r.song_id ?? r.songId ?? ''),
    instrument: r.instrument,
    ownerId: r.owner_id ?? r.ownerId ?? null,
    ownerName: r.owner_name ?? r.ownerName ?? null,
    joinedByUserId: r.joined_by ?? r.joinedByUserId ?? null,
    joinedByUserName: r.joined_by_name ?? r.joinedByUserName ?? null,
    pendingUserId: r.pending_user ?? r.pendingUserId ?? null,
    pendingUserName: r.pending_user_name ?? r.pendingUserName ?? null,
  };
}

export function createRolesFromParticipants(songId, participants) {
  const roles = [{
    id: uid(),
    songId,
    instrument: 'Vocals',
    ownerId: null,
    ownerName: null,
    joinedByUserId: null,
    joinedByUserName: null,
    pendingUserId: null,
    pendingUserName: null,
  }];
  const seenOwnedInstruments = new Set();

  participants.forEach((p) => {
    (p.instrumentObjects || []).forEach((inst) => {
      const instrument = instrumentLabel(inst);
      if (!instrument || instrument.toLowerCase() === 'vocals') return;

      const key = `${p.userId}|${instrument.toLowerCase()}`;
      if (seenOwnedInstruments.has(key)) return;
      seenOwnedInstruments.add(key);

      roles.push({
        id: uid(),
        songId,
        instrument,
        ownerId: p.userId,
        ownerName: p.name,
        joinedByUserId: null,
        joinedByUserName: null,
        pendingUserId: null,
        pendingUserName: null,
      });
    });
  });

  return roles;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // Auth state: null = loading, false = guest, firebase user object = logged in
  const [firebaseUser,  setFirebaseUser]  = useState(undefined); // undefined = still loading
  const [guestMode,     setGuestMode]     = useState(false);
  const [userLocation,  setUserLocation]  = useState(null);
  const [userName,          setUserName]          = useState('');
  const [userInstruments,   setUserInstruments]   = useState([]);
  const [userBio,            setUserBio]            = useState('');
  const [userRecordingLink,  setUserRecordingLink]  = useState('');
  const [userAvatarUrl,      setUserAvatarUrl]      = useState(null);
  const [spotifyStatus,      setSpotifyStatus]      = useState({ connected: false });

  const userId = firebaseUser?.uid ?? 'guest';

  // Listen for Firebase auth state — sync user profile + jams from backend
  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser ?? null);
      if (fbUser) {
        // Always set the Firebase display name immediately so the header never
        // shows "Guest" or "My Profile" while the backend round-trip is in flight.
        setUserName(fbUser.displayName ?? '');
        setUserAvatarUrl(fbUser.photoURL ?? '');

        try {
          // Create user in DB on first login, fetch profile otherwise
          let profile;
          try {
            profile = await api.getMe();
          } catch {
            profile = await api.createUser({
              name: fbUser.displayName ?? 'Musician',
              avatar_url: fbUser.photoURL ?? '',
            });
          }
          setUserName(profile.name);
          setUserBio(profile.bio ?? '');
          setUserRecordingLink(profile.recording_link ?? '');
          setUserAvatarUrl(profile.avatar_url ?? '');
          setUserInstruments((profile.instruments || []).map(normalizeInstrument));

          try {
            setSpotifyStatus(await api.getSpotifyStatus());
          } catch {
            setSpotifyStatus({ connected: false });
          }

          // Load public jams from backend
          const backendJams = await api.listJams();
          setJams(backendJams.map(normalizeJam));
        } catch {
          // Backend not reachable — Firebase name is already shown above
        }
      } else {
        setSpotifyStatus({ connected: false });
      }
    });
  }, []);

  // Load public jams for guest users (no Firebase auth)
  useEffect(() => {
    if (!guestMode) return;
    api.listJams().then((backendJams) => setJams(backendJams.map(normalizeJam))).catch(() => {});
  }, [guestMode]);

  // Navigation
  const [currentView,    setCurrentView]    = useState('jamList');
  const [selectedJamId,  setSelectedJamId]  = useState(null);
  const [selectedSongId, setSelectedSongId] = useState(null);

  // Data
  const [jams,                setJams]                = useState([]);
  const [songsByJamId,        setSongsByJamId]        = useState({});
  const [rolesBySongId,       setRolesBySongId]       = useState({});
  const [hardwareByJamId,     setHardwareByJamId]     = useState({});
  const [participantsByJamId, setParticipantsByJamId] = useState({});
  const [inviteCodesByJamId,  setInviteCodesByJamId]  = useState({});
  const selectedSongIdRef = useRef(selectedSongId);

  useEffect(() => {
    selectedSongIdRef.current = selectedSongId;
  }, [selectedSongId]);

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
    () => !!currentJam?.isParticipant || currentParticipants.some((p) => p.userId === userId),
    [currentJam, currentParticipants, userId]
  );

  // ── Real-time Events (SSE) ────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser || !selectedJamId || (!isCurrentJamAdmin && !isCurrentJamParticipant)) return;
    let closed = false;
    let eventSource;

    (async () => {
      try {
        const eventAuth = await api.createJamEventToken(selectedJamId);
        if (closed) return;

        const params = new URLSearchParams();
        if (eventAuth?.token) params.set('token', eventAuth.token);
        const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
        const url = `${base}/events/jam/${selectedJamId}${params.toString() ? `?${params.toString()}` : ''}`;

        eventSource = new EventSource(url);
        if (closed) {
          eventSource.close();
          return;
        }
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'jam_updated') {
              api.getJam(selectedJamId).then((jam) => {
                setJams((prev) => prev.map((j) => j.id === selectedJamId ? normalizeJam(jam) : j));
              }).catch(() => {});
            } else if (data.type === 'jam_deleted') {
              setJams((prev) => prev.filter((j) => j.id !== selectedJamId));
              setParticipantsByJamId((prev) => {
                const next = { ...prev };
                delete next[selectedJamId];
                return next;
              });
              setSongsByJamId((prev) => {
                const next = { ...prev };
                delete next[selectedJamId];
                return next;
              });
              setSelectedSongId(null);
              setSelectedJamId(null);
              setCurrentView('jamList');
            } else if (['song_added', 'song_updated', 'song_deleted'].includes(data.type)) {
              api.listSongs(selectedJamId).then((songs) => {
                setSongsByJamId((prev) => ({ ...prev, [selectedJamId]: songs.map(normalizeSong) }));
              }).catch(() => {});
            } else if (data.type === 'participant_joined' || data.type === 'participant_left') {
              api.listParticipants(selectedJamId).then((parts) => {
                const normalizedParts = parts.map(normalizeParticipant);
                setParticipantsByJamId((prev) => ({ ...prev, [selectedJamId]: normalizedParts }));
                setJams((prev) => prev.map((j) =>
                  j.id === selectedJamId
                    ? {
                        ...j,
                        participantCount: normalizedParts.length,
                        isParticipant: normalizedParts.some((p) => p.userId === userId),
                      }
                    : j
                ));
              }).catch(() => {});
            } else if (data.type === 'hardware_updated' || data.type === 'hardware_pending') {
              api.listHardware(selectedJamId).then((hw) => {
                setHardwareByJamId((prev) => ({ ...prev, [selectedJamId]: hw }));
              }).catch(() => {});
            } else if (data.type === 'role_updated' && selectedSongIdRef.current) {
              const activeSongId = selectedSongIdRef.current;
              api.listRoles(activeSongId).then((roles) => {
                setRolesBySongId((prev) => ({ ...prev, [activeSongId]: roles.map(normalizeRole) }));
              }).catch(() => {});
            }
          } catch (e) {
            console.error('Error parsing real-time event', e);
          }
        };

        eventSource.onerror = (err) => {
          console.error('EventSource failed:', err);
          eventSource.close();
        };
      } catch (e) {
        console.error('Could not open event stream', e);
      }
    })();

    return () => {
      closed = true;
      eventSource?.close();
    };
  }, [firebaseUser, selectedJamId, userId, isCurrentJamAdmin, isCurrentJamParticipant]);

  // UI
  const [modal,             setModal]             = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [joiningJamId,      setJoiningJamId]      = useState(null);
  const [viewingParticipant, setViewingParticipant] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyResult = params.get('spotify');
    if (!spotifyResult) return;

    if (spotifyResult === 'connected') {
      setModal({ title: 'Spotify Connected', message: 'Spotify playlist import is now connected.' });
      if (firebaseUser) {
        api.getSpotifyStatus()
          .then(setSpotifyStatus)
          .catch(() => setSpotifyStatus({ connected: false }));
      }
    } else {
      setModal({ title: 'Spotify Error', message: 'Could not connect Spotify. Check the app redirect URI and try again.' });
    }

    params.delete('spotify');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [firebaseUser]);

  // ── Profile ────────────────────────────────────────────────────────────────
  const handleConnectSpotify = async () => {
    try {
      const { url } = await api.createSpotifyLoginUrl();
      window.location.assign(url);
    } catch (e) {
      setModal({ title: 'Error', message: `Could not start Spotify login: ${e.message}` });
    }
  };

  const handleDisconnectSpotify = async () => {
    try {
      const status = await api.disconnectSpotify();
      setSpotifyStatus(status ?? { connected: false });
      setModal({ title: 'Spotify Disconnected', message: 'Spotify playlist import was disconnected.' });
    } catch (e) {
      setModal({ title: 'Error', message: `Could not disconnect Spotify: ${e.message}` });
    }
  };

  const handleUpdateProfile = async ({ name: newName, instruments: newInstruments, bio, recordingLink, avatarUrl, avatarFile }) => {
    if (!newName) return;
    let savedAvatarUrl = avatarUrl;

    if (firebaseUser) {
      try {
        if (avatarFile) {
          const upload = await api.uploadAvatar(avatarFile);
          savedAvatarUrl = upload.url;
        }
        await api.updateMe({
          name: newName,
          bio,
          recording_link: recordingLink,
          avatar_url: savedAvatarUrl ?? '',
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
    setUserAvatarUrl(savedAvatarUrl);
    // Sync participant record in all jams
    setParticipantsByJamId((prev) => {
      const updated = {};
      for (const [jamId, participants] of Object.entries(prev)) {
        updated[jamId] = participants.map((p) =>
          p.userId === userId
            ? { ...p, name: newName, bio, recordingLink, avatarUrl: savedAvatarUrl, instrumentObjects: newInstruments }
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
        inviteCode: visibility === 'private' ? Math.random().toString(36).substring(2, 8).toUpperCase() : null,
        settings: { requireRoleApproval: false, requireSongApproval: false },
        currentSongId: null,
        participantCount: 1,
        isParticipant: true,
      };
      newJam.invite_code = newJam.inviteCode;
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
      ? `Private jam created! Invite code: ${newJam.inviteCode}`
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
        if (patch.requireHardwareApproval !== undefined) backendPatch.require_hardware_approval = patch.requireHardwareApproval;
        
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

  const handleRegenerateInviteCode = async (jamId) => {
    if (firebaseUser) {
      try {
        const backendJam = await api.regenerateInviteCode(jamId);
        const jam = normalizeJam(backendJam);
        setJams((prev) => prev.map((j) => (j.id === jamId ? jam : j)));
        if (jam.inviteCode) {
          setInviteCodesByJamId((prev) => ({ ...prev, [jamId]: jam.inviteCode }));
        }
        setModal({ title: 'Invite Code Updated', message: `New invite code: ${jam.inviteCode}` });
      } catch (e) {
        setModal({ title: 'Error', message: `Could not regenerate invite code: ${e.message}` });
      }
      return;
    }

    const nextCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setJams((prev) =>
      prev.map((j) =>
        j.id === jamId ? { ...j, inviteCode: nextCode, invite_code: nextCode } : j
      )
    );
    setInviteCodesByJamId((prev) => ({ ...prev, [jamId]: nextCode }));
    setModal({ title: 'Invite Code Updated', message: `New invite code: ${nextCode}` });
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

  const removeJamFromLocalState = (jamId) => {
    const jamSongs = songsByJamId[jamId] || [];

    setParticipantsByJamId((prev) => {
      const next = { ...prev };
      delete next[jamId];
      return next;
    });
    setSongsByJamId((prev) => {
      const next = { ...prev };
      delete next[jamId];
      return next;
    });
    setRolesBySongId((prev) => {
      const next = { ...prev };
      jamSongs.forEach((song) => {
        delete next[song.id];
      });
      return next;
    });
    setHardwareByJamId((prev) => {
      const next = { ...prev };
      delete next[jamId];
      return next;
    });
    setInviteCodesByJamId((prev) => {
      const next = { ...prev };
      delete next[jamId];
      return next;
    });
    setJams((prev) => prev.filter((j) => j.id !== jamId));
  };

  const reconcileJamFromBackend = async (jamId) => {
    const [backendJam, parts, hardware] = await Promise.all([
      api.getJam(jamId),
      api.listParticipants(jamId),
      api.listHardware(jamId),
    ]);
    const normalizedParts = parts.map(normalizeParticipant);
    const refreshedJam = {
      ...normalizeJam(backendJam),
      participantCount: normalizedParts.length,
      isParticipant: normalizedParts.some((p) => p.userId === userId),
    };

    setParticipantsByJamId((prev) => ({ ...prev, [jamId]: normalizedParts }));
    setHardwareByJamId((prev) => ({ ...prev, [jamId]: hardware }));
    setJams((prev) =>
      prev.some((j) => j.id === jamId)
        ? prev.map((j) => (j.id === jamId ? refreshedJam : j))
        : [...prev, refreshedJam]
    );

    return refreshedJam;
  };

  const refreshRolesForSong = async (songId) => {
    const roles = await api.listRoles(songId);
    setRolesBySongId((prev) => ({ ...prev, [songId]: roles.map(normalizeRole) }));
    return roles;
  };

  // ── Join Jam ───────────────────────────────────────────────────────────────
  const handleJoinJam = (jamId) => {
    if (!firebaseUser) return;
    setJoiningJamId(jamId);
  };

  const handleConfirmJoin = async (jamId, selectedInstruments) => {
    if (firebaseUser) {
      let alreadyJoinedElsewhere = false;
      let hardwareError = null;
      try {
        await api.joinJam(jamId, inviteCodesByJamId[jamId]);

        // Add each instrument to the hardware set
        for (const inst of selectedInstruments) {
          try {
            await api.submitHardware(jamId, inst);
          } catch (e) {
            hardwareError = e;
            break;
          }
        }
      } catch (e) {
        if (e.status === 409) {
          alreadyJoinedElsewhere = true;
        } else {
          setModal({ title: 'Error', message: `Could not join jam: ${e.message}` });
          setJoiningJamId(null);
          return;
        }
      }

      try {
        await reconcileJamFromBackend(jamId);
        setInviteCodesByJamId((prev) => {
          const next = { ...prev };
          delete next[jamId];
          return next;
        });
      } catch (refreshError) {
        setModal({ title: 'Error', message: `Could not refresh jam: ${refreshError.message}` });
        setJoiningJamId(null);
        return;
      }

      setJoiningJamId(null);
      if (hardwareError) {
        setModal({
          title: 'Joined, but Incomplete',
          message: `You joined the jam, but your instruments could not be added: ${hardwareError.message}`,
        });
        return;
      }
      setModal({
        title: alreadyJoinedElsewhere ? 'Already Joined' : 'Joined!',
        message: alreadyJoinedElsewhere
          ? 'This account had already joined the jam from another browser.'
          : 'You are now a participant.',
      });
      return;
    }

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
    setJams((prev) =>
      prev.map((j) =>
        j.id === jamId
          ? {
              ...j,
              isParticipant: true,
              participantCount: (j.participantCount ?? 0) + 1,
            }
          : j
      )
    );
    setJoiningJamId(null);
    setModal({ title: 'Joined!', message: 'You are now a participant.' });
  };

  // ── Join by Invite Code ────────────────────────────────────────────────────
  const handleJoinByInviteCode = async (code) => {
    try {
      const normalizedCode = code.trim().toUpperCase();
      const backendJam = await api.getJamByCode(normalizedCode);
      const jam = normalizeJam(backendJam);
      
      // Add to local list if not there
      setJams(prev => prev.some(j => j.id === jam.id) ? prev : [...prev, jam]);
      setInviteCodesByJamId((prev) => ({ ...prev, [jam.id]: normalizedCode }));
      
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
    const jam = jams.find((j) => j.id === jamId);
    const isLastAdmin = !!jam?.admins.includes(userId) && jam.admins.length === 1;
    let result = { detail: 'Left', deleted_jam: false };

    if (firebaseUser) {
      try {
        result = await api.leaveJam(jamId);
      } catch (e) {
        if (e.status === 404) {
          try {
            await reconcileJamFromBackend(jamId);
          } catch (refreshError) {
            if (refreshError.status === 403 || refreshError.status === 404) {
              removeJamFromLocalState(jamId);
            } else {
              setModal({ title: 'Error', message: `Could not refresh jam: ${refreshError.message}` });
              return;
            }
          }
          goHome();
          return;
        }
        setModal({ title: 'Error', message: `Could not leave: ${e.message}` });
        return;
      }
    } else if (isLastAdmin) {
      result = { detail: 'Jam deleted', deleted_jam: true };
    }

    if (result.deleted_jam) {
      removeJamFromLocalState(jamId);
      setModal({ title: 'Jam Deleted', message: 'The last admin left the jam, so the jam was deleted.' });
      goHome();
      return;
    }

    if (firebaseUser) {
      try {
        await reconcileJamFromBackend(jamId);
      } catch (e) {
        if (e.status === 403 || e.status === 404) {
          removeJamFromLocalState(jamId);
        } else {
          setModal({ title: 'Error', message: `Could not refresh jam: ${e.message}` });
          return;
        }
      }
      goHome();
      return;
    }

    setParticipantsByJamId((prev) => ({
      ...prev,
      [jamId]: (prev[jamId] || []).filter((p) => p.userId !== userId),
    }));
    setJams((prev) => prev.flatMap((j) => {
      if (j.id !== jamId) return [j];
      const loadedCount = (participantsByJamId[jamId] || []).length;
      const nextCount = Math.max(0, loadedCount > 0 ? loadedCount - 1 : (j.participantCount ?? 1) - 1);
      if (j.visibility === 'private') return [];
      return [{
        ...j,
        admins: j.admins.filter((adminId) => adminId !== userId),
        isParticipant: false,
        participantCount: nextCount,
      }];
    }));
    goHome();
  };

  const refreshHardware = async (jamId) => {
    const hw = await api.listHardware(jamId);
    setHardwareByJamId((prev) => ({ ...prev, [jamId]: hw }));
  };

  const handleSubmitHardware = async (jamId, instrument) => {
    try {
      await api.submitHardware(jamId, instrument);
      await refreshHardware(jamId);
      // Re-fetch roles for the current song if any, since new roles may have been created
      if (selectedSongId) {
        const roles = await api.listRoles(selectedSongId);
        setRolesBySongId((prev) => ({ ...prev, [selectedSongId]: roles.map(normalizeRole) }));
      }
    } catch (e) {
      setModal({ title: 'Error', message: `Could not add hardware: ${e.message}` });
    }
  };

  const handleUpdateHardware = async (jamId, hardwareId, instrument) => {
    try {
      await api.updateHardware(jamId, hardwareId, { instrument });
      await refreshHardware(jamId);
      if (selectedSongId) {
        const roles = await api.listRoles(selectedSongId);
        setRolesBySongId((prev) => ({ ...prev, [selectedSongId]: roles.map(normalizeRole) }));
      }
    } catch (e) {
      setModal({ title: 'Error', message: `Could not update hardware: ${e.message}` });
    }
  };

  const handleRemoveHardware = async (jamId, hardwareId) => {
    try {
      await api.removeHardware(jamId, hardwareId);
      await refreshHardware(jamId);
      if (selectedSongId) {
        const roles = await api.listRoles(selectedSongId);
        setRolesBySongId((prev) => ({ ...prev, [selectedSongId]: roles.map(normalizeRole) }));
      }
    } catch (e) {
      setModal({ title: 'Error', message: `Could not remove hardware: ${e.message}` });
    }
  };

  const handleApproveHardware = async (jamId, hardwareId) => {
    try {
      await api.approveHardware(jamId, hardwareId);
      await refreshHardware(jamId);
    } catch (e) {
      setModal({ title: 'Error', message: `Could not approve hardware: ${e.message}` });
    }
  };

  const handleRejectHardware = async (jamId, hardwareId) => {
    try {
      await api.rejectHardware(jamId, hardwareId);
      await refreshHardware(jamId);
    } catch (e) {
      setModal({ title: 'Error', message: `Could not reject hardware: ${e.message}` });
    }
  };

  // ── Add Admin ──────────────────────────────────────────────────────────────
  const handleAddAdmin = async (jamId, targetUserId) => {
    if (firebaseUser) {
      try {
        await api.addAdmin(jamId, targetUserId);
        const jam = normalizeJam(await api.getJam(jamId));
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
        await api.removeAdmin(jamId, adminId);
        const jam = normalizeJam(await api.getJam(jamId));
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
        const newSong = normalizeSong(await api.submitSong(selectedJamId, { title, artist }));
        setSongsByJamId((prev) => ({
          ...prev,
          [selectedJamId]: [...(prev[selectedJamId] || []), newSong],
        }));
      } catch (e) {
        setModal({ title: 'Error', message: `Could not add song: ${e.message}` });
        return;
      }
    } else {
      const newSong = {
        id: uid(),
        title,
        artist,
        status: needsApproval ? 'pending' : 'approved',
        submittedBy: userId,
        submittedByName: userName,
      };
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

  const handleImportSongs = async (songs) => {
    if (!selectedJamId || songs.length === 0) return;
    const jam = jams.find((j) => j.id === selectedJamId);
    const needsApproval = jam?.settings?.requireSongApproval;

    if (firebaseUser) {
      const importedSongs = [];
      try {
        for (const song of songs) {
          const newSong = normalizeSong(
            await api.submitSong(selectedJamId, { title: song.title, artist: song.artist }),
          );
          importedSongs.push(newSong);
        }
      } catch (e) {
        if (importedSongs.length > 0) {
          setSongsByJamId((prev) => ({
            ...prev,
            [selectedJamId]: [...(prev[selectedJamId] || []), ...importedSongs],
          }));
        }
        setModal({
          title: 'Import Incomplete',
          message: `${importedSongs.length}/${songs.length} songs imported. Last error: ${e.message}`,
        });
        return;
      }

      setSongsByJamId((prev) => ({
        ...prev,
        [selectedJamId]: [...(prev[selectedJamId] || []), ...importedSongs],
      }));
    } else {
      const participants = participantsByJamId[selectedJamId] || [];
      const importedSongs = songs.map((song) => ({
        id: uid(),
        title: song.title,
        artist: song.artist,
        status: needsApproval ? 'pending' : 'approved',
        submittedBy: userId,
        submittedByName: userName,
      }));
      const importedRoles = {};
      importedSongs.forEach((song) => {
        importedRoles[song.id] = createRolesFromParticipants(song.id, participants);
      });

      setSongsByJamId((prev) => ({
        ...prev,
        [selectedJamId]: [...(prev[selectedJamId] || []), ...importedSongs],
      }));
      setRolesBySongId((prev) => ({ ...prev, ...importedRoles }));
    }

    setModal({
      title: needsApproval ? 'Submitted' : 'Imported',
      message: needsApproval
        ? `${songs.length} songs submitted — waiting for admin approval.`
        : `${songs.length} songs imported to the setlist.`,
    });
    setIsImportModalOpen(false);
  };

  // ── Approve / Reject Song ──────────────────────────────────────────────────
  const handleApproveSong = async (jamId, songId) => {
    if (firebaseUser) {
      try {
        const updatedSong = normalizeSong(await api.updateSong(songId, { status: 'approved' }));
        setSongsByJamId((prev) => ({
          ...prev,
          [jamId]: (prev[jamId] || []).map((s) => s.id === songId ? updatedSong : s),
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
    setJams((prev) => prev.map((j) =>
      j.id === jamId && j.currentSongId === songId ? { ...j, currentSongId: null } : j
    ));
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
    setJams((prev) => prev.map((j) =>
      j.id === jamId && j.currentSongId === songId ? { ...j, currentSongId: null } : j
    ));
  };

  const handleEditSong = async (jamId, songId, newTitle, newArtist) => {
    if (firebaseUser) {
      try {
        const updatedSong = normalizeSong(await api.updateSong(songId, { title: newTitle, artist: newArtist }));
        setSongsByJamId((prev) => ({
          ...prev,
          [jamId]: (prev[jamId] || []).map((s) =>
            s.id === songId ? updatedSong : s
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
        await refreshRolesForSong(selectedSongId);
      } catch (e) {
        if (e.status === 409) {
          try {
            await refreshRolesForSong(selectedSongId);
          } catch {}
          setModal({ title: 'Already Updated', message: 'This role changed in another browser.' });
          return;
        }
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
        await refreshRolesForSong(selectedSongId);
      } catch (e) {
        if (e.status === 409) {
          try {
            await refreshRolesForSong(selectedSongId);
          } catch {}
          setModal({ title: 'Already Updated', message: 'This role changed in another browser.' });
          return;
        }
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
        await refreshRolesForSong(songId);
      } catch (e) {
        if (e.status === 409) {
          try {
            await refreshRolesForSong(songId);
          } catch {}
          setModal({ title: 'Already Updated', message: 'This role was already reviewed in another browser.' });
          return;
        }
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
        await refreshRolesForSong(songId);
      } catch (e) {
        if (e.status === 409) {
          try {
            await refreshRolesForSong(songId);
          } catch {}
          setModal({ title: 'Already Updated', message: 'This role was already reviewed in another browser.' });
          return;
        }
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
    // Fetch participants and songs from backend if not already loaded.
    // Also prefetch role lists for visible songs so admin pending-role requests
    // are available as soon as the jam detail view opens.
    let songs = songsByJamId[jamId];

    const fetches = [];
    if (!participantsByJamId[jamId]) {
      fetches.push(
        api.listParticipants(jamId)
          .then((parts) => {
            const normalizedParts = parts.map(normalizeParticipant);
            setParticipantsByJamId((prev) => ({ ...prev, [jamId]: normalizedParts }));
            setJams((prev) => prev.map((j) =>
              j.id === jamId
                ? {
                    ...j,
                    participantCount: normalizedParts.length,
                    isParticipant: normalizedParts.some((p) => p.userId === userId),
                  }
                : j
            ));
          })
          .catch(() => {})
      );
    }
    if (!songs) {
      fetches.push(
        api.listSongs(jamId)
          .then((backendSongs) => {
            songs = backendSongs.map(normalizeSong);
            setSongsByJamId((prev) => ({ ...prev, [jamId]: songs }));
          })
          .catch(() => {})
      );
    }
    if (!hardwareByJamId[jamId]) {
      fetches.push(
        api.listHardware(jamId)
          .then((hw) => setHardwareByJamId((prev) => ({ ...prev, [jamId]: hw })))
          .catch(() => {})
      );
    }
    await Promise.all(fetches);

    const songsToPrefetch = (songs || []).filter((song) => rolesBySongId[song.id] === undefined);
    if (songsToPrefetch.length) {
      const roleEntries = await Promise.all(
        songsToPrefetch.map(async (song) => {
          try {
            const roles = await api.listRoles(song.id);
            return [song.id, roles.map(normalizeRole)];
          } catch {
            return null;
          }
        })
      );

      const nextRoles = Object.fromEntries(roleEntries.filter(Boolean));
      if (Object.keys(nextRoles).length > 0) {
        setRolesBySongId((prev) => ({ ...prev, ...nextRoles }));
      }
    }
  };
  const handleNavSong      = async (songId) => {
    setSelectedSongId(songId);
    setCurrentView('songDetail');
    try {
      const roles = await api.listRoles(songId);
      setRolesBySongId((prev) => ({ ...prev, [songId]: roles.map(normalizeRole) }));
    } catch {}
  };
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

  if (!firebaseUser && !guestMode) {
    return <Login onGuest={() => setGuestMode(true)} />;
  }

  const isGuest = !firebaseUser;

  const renderView = () => {
    switch (currentView) {
      case 'jamList':
        return (
          <JamList
            jams={jams}
            onJamClick={handleNavJam}
            onNavCreate={() => setCurrentView('createJam')}
            userLocation={userLocation}
            onRequestLocation={() => import('./utils/geo').then(m => m.getUserLocation()).then(setUserLocation).catch(() => {})}
            participantsByJamId={participantsByJamId}
            currentUserId={userId}
            onJoinByInviteCode={handleJoinByInviteCode}
            isGuest={isGuest}
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
            isGuest={isGuest}
            onJoinJam={handleJoinJam}
            onLeaveJam={handleLeaveJam}
            participants={currentParticipants}
            rolesBySongId={rolesBySongId}
            onAdvanceState={handleAdvanceJamState}
            onUpdateSettings={handleUpdateJamSettings}
            onRegenerateInviteCode={handleRegenerateInviteCode}
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
            hardware={hardwareByJamId[selectedJamId] || []}
            onSubmitHardware={handleSubmitHardware}
            onUpdateHardware={handleUpdateHardware}
            onRemoveHardware={handleRemoveHardware}
            onApproveHardware={handleApproveHardware}
            onRejectHardware={handleRejectHardware}
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
            spotifyStatus={spotifyStatus}
            onConnectSpotify={handleConnectSpotify}
            onDisconnectSpotify={handleDisconnectSpotify}
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
          onImportMany={handleImportSongs}
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
        userName={userName || ''}
        avatarUrl={userAvatarUrl}
        onNavProfile={isGuest ? () => setGuestMode(false) : handleNavProfile}
        onNavHome={goHome}
        onLogout={isGuest ? () => setGuestMode(false) : () => import('./services/firebase').then(m => m.logout())}
        isGuest={isGuest}
      />
      <main className="max-w-4xl mx-auto px-4">{renderView()}</main>
    </div>
  );
}
