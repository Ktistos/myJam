import type { BrowserContext, Page, Route } from '@playwright/test';

type InstrumentRecord = {
  instrument: string;
  skill_level: string;
};

type Jam = {
  id: string;
  name: string;
  date: string;
  state: string;
  visibility: string;
  invite_code: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  require_role_approval: boolean;
  require_song_approval: boolean;
  current_song_id: string | null;
  admin_ids: string[];
  participant_count: number;
  created_by: string;
};

type Participant = {
  user: {
    id: string;
    name: string;
    bio: string;
    recording_link: string;
    avatar_url: string;
    instruments: InstrumentRecord[];
  };
  joined_at: string;
};

type Song = {
  id: string;
  jam_id: string;
  title: string;
  artist: string;
  status: string;
  submitted_by: string;
  submitted_by_name: string;
  created_at: string;
};

type Role = {
  id: string;
  song_id: string;
  instrument: string;
  owner_id: string | null;
  owner_name: string | null;
  joined_by: string | null;
  joined_by_name: string | null;
  pending_user: string | null;
  pending_user_name: string | null;
};

type Hardware = {
  id: string;
  instrument: string;
  owner_id: string;
  owner_name: string;
  status: string;
};

type UserProfile = {
  id: string;
  name: string;
  bio: string;
  recording_link: string;
  avatar_url: string;
  instruments: InstrumentRecord[];
};

type MockAuthUser = {
  uid: string;
  displayName: string;
  photoURL: string;
  token: string;
};

type GuestMockData = {
  jams: Jam[];
  participantsByJamId: Record<string, Participant[]>;
  songsByJamId: Record<string, Song[]>;
  rolesBySongId: Record<string, Role[]>;
  hardwareByJamId?: Record<string, Hardware[]>;
};

type AuthenticatedMockData = GuestMockData & {
  authUser: MockAuthUser;
  profile: UserProfile;
};

type AuthenticatedMockState = AuthenticatedMockData & {
  nextJamSeq: number;
  nextInviteSeq: number;
  nextSongSeq: number;
  spotifyConnected: boolean;
};

export const AUTH_TOKEN = 'playwright-e2e-token';

export const defaultMockData: GuestMockData = {
  jams: [
    {
      id: 'jam-near',
      name: 'Downtown Blues Session',
      date: '2026-05-10T18:00:00.000Z',
      state: 'initial',
      visibility: 'public',
      invite_code: null,
      address: '123 Main St',
      lat: 37.7749,
      lng: -122.4194,
      require_role_approval: false,
      require_song_approval: false,
      current_song_id: null,
      admin_ids: ['uid-admin'],
      participant_count: 2,
      created_by: 'uid-admin',
    },
    {
      id: 'jam-far',
      name: 'Mountain Jam',
      date: '2026-05-11T18:00:00.000Z',
      state: 'tuning',
      visibility: 'public',
      invite_code: null,
      address: '999 Far Away Rd',
      lat: 38.8048,
      lng: -123.0172,
      require_role_approval: false,
      require_song_approval: false,
      current_song_id: null,
      admin_ids: ['uid-other'],
      participant_count: 1,
      created_by: 'uid-other',
    },
  ],
  participantsByJamId: {
    'jam-near': [
      {
        user: {
          id: 'uid-admin',
          name: 'Alex Rivera',
          bio: 'Lead guitarist',
          recording_link: 'https://example.com/alex',
          avatar_url: '',
          instruments: [{ instrument: 'Electric Guitar', skill_level: 'advanced' }],
        },
        joined_at: '2026-05-10T17:00:00.000Z',
      },
      {
        user: {
          id: 'uid-vocals',
          name: 'Jamie Cross',
          bio: 'Singer and harmonica player',
          recording_link: '',
          avatar_url: '',
          instruments: [{ instrument: 'Vocals', skill_level: 'intermediate' }],
        },
        joined_at: '2026-05-10T17:05:00.000Z',
      },
    ],
    'jam-far': [
      {
        user: {
          id: 'uid-other',
          name: 'Morgan Fields',
          bio: 'Drummer',
          recording_link: '',
          avatar_url: '',
          instruments: [{ instrument: 'Drums', skill_level: 'advanced' }],
        },
        joined_at: '2026-05-11T17:00:00.000Z',
      },
    ],
  },
  songsByJamId: {
    'jam-near': [
      {
        id: 'song-1',
        jam_id: 'jam-near',
        title: 'Little Wing',
        artist: 'Jimi Hendrix',
        status: 'approved',
        submitted_by: 'uid-admin',
        submitted_by_name: 'Alex Rivera',
        created_at: '2026-05-10T17:30:00.000Z',
      },
    ],
    'jam-far': [],
  },
  rolesBySongId: {
    'song-1': [
      {
        id: 'role-open',
        song_id: 'song-1',
        instrument: 'Vocals',
        owner_id: null,
        owner_name: null,
        joined_by: null,
        joined_by_name: null,
        pending_user: null,
        pending_user_name: null,
      },
      {
        id: 'role-taken',
        song_id: 'song-1',
        instrument: 'Electric Guitar',
        owner_id: 'uid-admin',
        owner_name: 'Alex Rivera',
        joined_by: 'uid-admin',
        joined_by_name: 'Alex Rivera',
        pending_user: null,
        pending_user_name: null,
      },
    ],
  },
};

export const defaultAuthenticatedData: AuthenticatedMockData = {
  authUser: {
    uid: 'uid-auth',
    displayName: 'Taylor Stone',
    photoURL: '',
    token: AUTH_TOKEN,
  },
  profile: {
    id: 'uid-auth',
    name: 'Taylor Stone',
    bio: 'Rhythm guitarist and vocalist.',
    recording_link: 'https://example.com/taylor',
    avatar_url: '',
    instruments: [
      { instrument: 'Electric Guitar', skill_level: 'advanced' },
      { instrument: 'Vocals', skill_level: 'intermediate' },
    ],
  },
  jams: [
    {
      id: 'jam-admin',
      name: 'House Band Rehearsal',
      date: '2026-06-12T19:00:00.000Z',
      state: 'initial',
      visibility: 'public',
      invite_code: null,
      address: '88 Groove St',
      lat: 37.7749,
      lng: -122.4194,
      require_role_approval: false,
      require_song_approval: false,
      current_song_id: null,
      admin_ids: ['uid-auth'],
      participant_count: 1,
      created_by: 'uid-auth',
    },
    {
      id: 'jam-join',
      name: 'Downtown Open Jam',
      date: '2026-06-13T20:00:00.000Z',
      state: 'initial',
      visibility: 'public',
      invite_code: null,
      address: '123 Main St',
      lat: 37.776,
      lng: -122.418,
      require_role_approval: false,
      require_song_approval: false,
      current_song_id: null,
      admin_ids: ['uid-host'],
      participant_count: 1,
      created_by: 'uid-host',
    },
    {
      id: 'jam-private',
      name: 'Invite Only Funk Lab',
      date: '2026-06-14T21:00:00.000Z',
      state: 'initial',
      visibility: 'private',
      invite_code: 'FUNK42',
      address: '17 Secret Ave',
      lat: 37.78,
      lng: -122.41,
      require_role_approval: false,
      require_song_approval: false,
      current_song_id: null,
      admin_ids: ['uid-host'],
      participant_count: 1,
      created_by: 'uid-host',
    },
  ],
  participantsByJamId: {
    'jam-admin': [
      {
        user: {
          id: 'uid-auth',
          name: 'Taylor Stone',
          bio: 'Rhythm guitarist and vocalist.',
          recording_link: 'https://example.com/taylor',
          avatar_url: '',
          instruments: [
            { instrument: 'Electric Guitar', skill_level: 'advanced' },
            { instrument: 'Vocals', skill_level: 'intermediate' },
          ],
        },
        joined_at: '2026-06-12T18:30:00.000Z',
      },
    ],
    'jam-join': [
      {
        user: {
          id: 'uid-host',
          name: 'Riley Quinn',
          bio: 'Session guitarist.',
          recording_link: '',
          avatar_url: '',
          instruments: [{ instrument: 'Electric Guitar', skill_level: 'advanced' }],
        },
        joined_at: '2026-06-13T19:30:00.000Z',
      },
    ],
    'jam-private': [
      {
        user: {
          id: 'uid-host',
          name: 'Riley Quinn',
          bio: 'Session guitarist.',
          recording_link: '',
          avatar_url: '',
          instruments: [{ instrument: 'Bass Guitar', skill_level: 'advanced' }],
        },
        joined_at: '2026-06-14T20:30:00.000Z',
      },
    ],
  },
  songsByJamId: {
    'jam-admin': [
      {
        id: 'song-admin-1',
        jam_id: 'jam-admin',
        title: 'Crossroads',
        artist: 'Cream',
        status: 'approved',
        submitted_by: 'uid-auth',
        submitted_by_name: 'Taylor Stone',
        created_at: '2026-06-12T18:40:00.000Z',
      },
    ],
    'jam-join': [
      {
        id: 'song-join-1',
        jam_id: 'jam-join',
        title: 'Little Wing',
        artist: 'Jimi Hendrix',
        status: 'approved',
        submitted_by: 'uid-host',
        submitted_by_name: 'Riley Quinn',
        created_at: '2026-06-13T19:40:00.000Z',
      },
    ],
    'jam-private': [],
  },
  rolesBySongId: {
    'song-admin-1': [
      {
        id: 'role-admin-open',
        song_id: 'song-admin-1',
        instrument: 'Vocals',
        owner_id: null,
        owner_name: null,
        joined_by: null,
        joined_by_name: null,
        pending_user: null,
        pending_user_name: null,
      },
      {
        id: 'role-admin-taken',
        song_id: 'song-admin-1',
        instrument: 'Electric Guitar',
        owner_id: 'uid-auth',
        owner_name: 'Taylor Stone',
        joined_by: 'uid-auth',
        joined_by_name: 'Taylor Stone',
        pending_user: null,
        pending_user_name: null,
      },
    ],
    'song-join-1': [
      {
        id: 'role-join-open',
        song_id: 'song-join-1',
        instrument: 'Vocals',
        owner_id: null,
        owner_name: null,
        joined_by: null,
        joined_by_name: null,
        pending_user: null,
        pending_user_name: null,
      },
      {
        id: 'role-join-taken',
        song_id: 'song-join-1',
        instrument: 'Electric Guitar',
        owner_id: 'uid-host',
        owner_name: 'Riley Quinn',
        joined_by: 'uid-host',
        joined_by_name: 'Riley Quinn',
        pending_user: null,
        pending_user_name: null,
      },
    ],
  },
};

function cloneData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

function createAuthenticatedState(data: AuthenticatedMockData): AuthenticatedMockState {
  return {
    ...cloneData(data),
    nextJamSeq: 1,
    nextInviteSeq: 1,
    nextSongSeq: 1,
    spotifyConnected: false,
  };
}

function normalizeInviteCode(code: string | null) {
  return (code ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function participantFromProfile(profile: UserProfile, instruments = profile.instruments): Participant {
  return {
    user: {
      id: profile.id,
      name: profile.name,
      bio: profile.bio,
      recording_link: profile.recording_link,
      avatar_url: profile.avatar_url,
      instruments: cloneData(instruments),
    },
    joined_at: new Date().toISOString(),
  };
}

function findJam(jams: Jam[], jamId: string) {
  return jams.find((jam) => jam.id === jamId) ?? null;
}

function findSongLocation(state: AuthenticatedMockState, songId: string) {
  for (const [jamId, songs] of Object.entries(state.songsByJamId)) {
    const song = songs.find((item) => item.id === songId);
    if (song) return { jamId, song };
  }
  return null;
}

function findRole(state: AuthenticatedMockState, roleId: string) {
  for (const roles of Object.values(state.rolesBySongId)) {
    const role = roles.find((item) => item.id === roleId);
    if (role) return role;
  }
  return null;
}

function syncParticipantCount(state: AuthenticatedMockState, jamId: string) {
  const jam = findJam(state.jams, jamId);
  if (!jam) return;
  jam.participant_count = state.participantsByJamId[jamId]?.length ?? 0;
}

function syncAllParticipantCounts(state: AuthenticatedMockState) {
  for (const jam of state.jams) {
    syncParticipantCount(state, jam.id);
  }
}

function isParticipant(state: AuthenticatedMockState, jamId: string, userId: string) {
  return (state.participantsByJamId[jamId] ?? []).some((participant) => participant.user.id === userId);
}

function visibleJamsForUser(state: AuthenticatedMockState) {
  return state.jams.filter((jam) =>
    jam.visibility === 'public' ||
    jam.admin_ids.includes(state.profile.id) ||
    isParticipant(state, jam.id, state.profile.id)
  );
}

function addInstrumentToParticipant(participant: Participant | undefined, instrument: string) {
  if (!participant) return;
  if (participant.user.instruments.some((item) => item.instrument === instrument)) return;
  participant.user.instruments.push({ instrument, skill_level: 'intermediate' });
}

function hardwareByJam(data: GuestMockData, jamId: string) {
  data.hardwareByJamId ??= {};
  data.hardwareByJamId[jamId] ??= [];
  return data.hardwareByJamId[jamId];
}

function addRolesForHardware(state: AuthenticatedMockState, jamId: string, hardware: Hardware) {
  if (hardware.instrument === 'Vocals') return;
  for (const song of state.songsByJamId[jamId] ?? []) {
    const roles = state.rolesBySongId[song.id] ?? [];
    if (roles.some((role) => role.instrument === hardware.instrument && role.owner_id === hardware.owner_id)) continue;
    state.rolesBySongId[song.id] = [
      ...roles,
      {
        id: `role-${song.id}-${hardware.id}`,
        song_id: song.id,
        instrument: hardware.instrument,
        owner_id: hardware.owner_id,
        owner_name: hardware.owner_name,
        joined_by: null,
        joined_by_name: null,
        pending_user: null,
        pending_user_name: null,
      },
    ];
  }
}

function addDefaultRolesForSong(state: AuthenticatedMockState, song: Song) {
  const roles = state.rolesBySongId[song.id] ?? [];
  if (roles.some((role) => role.instrument === 'Vocals' && role.owner_id === null)) return;
  state.rolesBySongId[song.id] = [
    ...roles,
    {
      id: `role-${song.id}-vocals`,
      song_id: song.id,
      instrument: 'Vocals',
      owner_id: null,
      owner_name: null,
      joined_by: null,
      joined_by_name: null,
      pending_user: null,
      pending_user_name: null,
    },
  ];
}

function renameRolesForHardware(state: AuthenticatedMockState, jamId: string, ownerId: string, oldInstrument: string, newInstrument: string) {
  for (const song of state.songsByJamId[jamId] ?? []) {
    state.rolesBySongId[song.id] = (state.rolesBySongId[song.id] ?? []).map((role) =>
      role.owner_id === ownerId && role.instrument === oldInstrument
        ? { ...role, instrument: newInstrument }
        : role
    );
  }
}

function removeUnclaimedRolesForHardware(state: AuthenticatedMockState, jamId: string, ownerId: string, instrument: string) {
  for (const song of state.songsByJamId[jamId] ?? []) {
    state.rolesBySongId[song.id] = (state.rolesBySongId[song.id] ?? []).filter((role) =>
      !(role.owner_id === ownerId && role.instrument === instrument && !role.joined_by && !role.pending_user)
    );
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function fulfillEventStream(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: '',
  });
}

function parseJsonBody(route: Route) {
  const body = route.request().postData();
  return body ? JSON.parse(body) : {};
}

function hasValidAuth(route: Route, token: string) {
  const headers = route.request().headers();
  const authHeader = headers.authorization ?? headers.Authorization;
  return authHeader === `Bearer ${token}`;
}

async function handleGuestRoute(route: Route, data: GuestMockData) {
  const url = new URL(route.request().url());

  if (url.port !== '8000') {
    await route.continue();
    return;
  }

  if (route.request().method() !== 'GET') {
    await fulfillJson(route, { detail: 'Method not mocked' }, 405);
    return;
  }

  const path = url.pathname;

  if (path === '/jams') {
    await fulfillJson(route, data.jams.filter((jam) => jam.visibility === 'public'));
    return;
  }

  if (path.startsWith('/jams/') && path.endsWith('/participants')) {
    const jamId = path.split('/')[2];
    await fulfillJson(route, data.participantsByJamId[jamId] ?? []);
    return;
  }

  if (path.startsWith('/jams/') && path.endsWith('/hardware')) {
    const jamId = path.split('/')[2];
    await fulfillJson(route, hardwareByJam(data, jamId));
    return;
  }

  if (path.startsWith('/songs/jam/')) {
    const jamId = path.split('/')[3];
    await fulfillJson(route, data.songsByJamId[jamId] ?? []);
    return;
  }

  if (path.startsWith('/songs/') && path.endsWith('/roles')) {
    const songId = path.split('/')[2];
    await fulfillJson(route, data.rolesBySongId[songId] ?? []);
    return;
  }

  if (path.startsWith('/jams/')) {
    const jamId = path.split('/')[2];
    const jam = data.jams.find((item) => item.id === jamId);
    if (jam) {
      await fulfillJson(route, jam);
    } else {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
    }
    return;
  }

  await fulfillJson(route, { detail: 'Not mocked' }, 404);
}

async function handleAuthenticatedRoute(route: Route, state: AuthenticatedMockState) {
  const url = new URL(route.request().url());

  if (url.port !== '8000') {
    await route.continue();
    return;
  }

  if (!hasValidAuth(route, state.authUser.token)) {
    await fulfillJson(route, { detail: 'Unauthorized' }, 401);
    return;
  }

  const { pathname } = url;
  const method = route.request().method();

  if (pathname === '/users/me' && method === 'GET') {
    await fulfillJson(route, state.profile);
    return;
  }

  if (pathname === '/users' && method === 'POST') {
    const body = parseJsonBody(route);
    state.profile = {
      id: state.authUser.uid,
      name: body.name ?? state.authUser.displayName,
      bio: '',
      recording_link: '',
      avatar_url: body.avatar_url ?? '',
      instruments: [],
    };
    await fulfillJson(route, state.profile, 201);
    return;
  }

  if (pathname === '/users/me' && method === 'PATCH') {
    const body = parseJsonBody(route);
    state.profile = {
      ...state.profile,
      ...body,
      instruments: body.instruments ?? state.profile.instruments,
    };
    state.authUser.displayName = state.profile.name;
    state.authUser.photoURL = state.profile.avatar_url;

    for (const participants of Object.values(state.participantsByJamId)) {
      for (const participant of participants) {
        if (participant.user.id !== state.profile.id) continue;
        participant.user.name = state.profile.name;
        participant.user.bio = state.profile.bio;
        participant.user.recording_link = state.profile.recording_link;
        participant.user.avatar_url = state.profile.avatar_url;
        participant.user.instruments = cloneData(state.profile.instruments);
      }
    }

    await fulfillJson(route, state.profile);
    return;
  }

  if (pathname === '/uploads/avatar' && method === 'POST') {
    await fulfillJson(route, { url: 'http://127.0.0.1:9000/mock/taylor-avatar.png' });
    return;
  }

  if (pathname === '/spotify/status' && method === 'GET') {
    await fulfillJson(route, {
      connected: state.spotifyConnected,
      expires_at: state.spotifyConnected ? new Date(Date.now() + 3600000).toISOString() : null,
      scope: state.spotifyConnected ? 'playlist-read-private playlist-read-collaborative' : null,
    });
    return;
  }

  if (pathname === '/spotify/login' && method === 'GET') {
    await fulfillJson(route, { url: 'http://127.0.0.1:8000/spotify/callback?mock=1' });
    return;
  }

  if (pathname === '/spotify/disconnect' && method === 'POST') {
    state.spotifyConnected = false;
    await fulfillJson(route, { connected: false, expires_at: null, scope: null });
    return;
  }

  if (pathname.startsWith('/events/jam/') && pathname.endsWith('/token') && method === 'POST') {
    const jamId = pathname.split('/')[3];
    await fulfillJson(route, { token: `event-token-${jamId}`, expires_in: 21600 }, 201);
    return;
  }

  if (pathname.startsWith('/events/jam/')) {
    await fulfillEventStream(route);
    return;
  }

  if (pathname === '/jams' && method === 'GET') {
    syncAllParticipantCounts(state);
    await fulfillJson(route, visibleJamsForUser(state));
    return;
  }

  if (pathname === '/jams' && method === 'POST') {
    const body = parseJsonBody(route);
    const jamId = `jam-created-${state.nextJamSeq++}`;
    const newJam: Jam = {
      id: jamId,
      name: body.name,
      date: body.date,
      state: 'initial',
      visibility: body.visibility,
      invite_code: body.visibility === 'private' ? `CODE${state.nextJamSeq}` : null,
      address: body.address ?? '',
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      require_role_approval: false,
      require_song_approval: false,
      current_song_id: null,
      admin_ids: [state.profile.id],
      participant_count: 1,
      created_by: state.profile.id,
    };

    state.jams.push(newJam);
    state.participantsByJamId[jamId] = [participantFromProfile(state.profile)];
    state.songsByJamId[jamId] = [];
    hardwareByJam(state, jamId);
    await fulfillJson(route, newJam, 201);
    return;
  }

  if (pathname.startsWith('/jams/invite/') && method === 'GET') {
    const code = normalizeInviteCode(pathname.split('/')[3]);
    const jam = state.jams.find((item) => item.invite_code === code) ?? null;
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }
    await fulfillJson(route, jam);
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.endsWith('/participants') && method === 'GET') {
    const jamId = pathname.split('/')[2];
    await fulfillJson(route, state.participantsByJamId[jamId] ?? []);
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.endsWith('/hardware') && method === 'GET') {
    const jamId = pathname.split('/')[2];
    await fulfillJson(route, hardwareByJam(state, jamId));
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.endsWith('/join') && method === 'POST') {
    const jamId = pathname.split('/')[2];
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }

    const inviteCode = normalizeInviteCode(url.searchParams.get('invite_code'));
    if (jam.visibility === 'private' && inviteCode !== jam.invite_code) {
      await fulfillJson(route, { detail: 'Invite code required' }, 403);
      return;
    }

    if (isParticipant(state, jamId, state.profile.id)) {
      await fulfillJson(route, { detail: 'Already a participant' }, 409);
      return;
    }

    state.participantsByJamId[jamId] = [
      ...(state.participantsByJamId[jamId] ?? []),
      participantFromProfile(state.profile, []),
    ];
    syncParticipantCount(state, jamId);

    await fulfillJson(route, { detail: 'Joined' }, 201);
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.endsWith('/leave') && method === 'POST') {
    const jamId = pathname.split('/')[2];
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }

    const wasParticipant = isParticipant(state, jamId, state.profile.id);
    const wasAdmin = jam.admin_ids.includes(state.profile.id);

    if (!wasParticipant && !wasAdmin) {
      await fulfillJson(route, { detail: 'Not a participant' }, 404);
      return;
    }

    const isLastAdmin = wasAdmin && jam.admin_ids.length === 1;
    if (isLastAdmin) {
      state.jams = state.jams.filter((item) => item.id !== jamId);
      delete state.participantsByJamId[jamId];
      delete state.hardwareByJamId?.[jamId];
      const songs = state.songsByJamId[jamId] ?? [];
      for (const song of songs) delete state.rolesBySongId[song.id];
      delete state.songsByJamId[jamId];
      await fulfillJson(route, { detail: 'Jam deleted', deleted_jam: true });
      return;
    }

    state.participantsByJamId[jamId] = (state.participantsByJamId[jamId] ?? []).filter(
      (participant) => participant.user.id !== state.profile.id
    );
    jam.admin_ids = jam.admin_ids.filter((adminId) => adminId !== state.profile.id);
    syncParticipantCount(state, jamId);
    await fulfillJson(route, { detail: 'Left', deleted_jam: false });
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.endsWith('/hardware') && method === 'POST') {
    const jamId = pathname.split('/')[2];
    const instrument = url.searchParams.get('instrument');
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }
    if (!instrument?.trim()) {
      await fulfillJson(route, { detail: 'Instrument is required' }, 400);
      return;
    }
    if (instrument === 'Vocals') {
      await fulfillJson(route, { detail: 'Vocals are always available as a role and cannot be added as hardware' }, 400);
      return;
    }
    if (!isParticipant(state, jamId, state.profile.id) && !jam.admin_ids.includes(state.profile.id)) {
      await fulfillJson(route, { detail: 'Must be a participant to add hardware' }, 403);
      return;
    }

    const items = hardwareByJam(state, jamId);
    const existing = items.find((item) => item.instrument === instrument && item.owner_id === state.profile.id);
    if (existing) {
      await fulfillJson(route, existing, 201);
      return;
    }

    const participant = (state.participantsByJamId[jamId] ?? []).find(
      (item) => item.user.id === state.profile.id
    );
    addInstrumentToParticipant(participant, instrument);
    const hardware: Hardware = {
      id: `hw-${jamId}-${items.length + 1}`,
      instrument,
      owner_id: state.profile.id,
      owner_name: state.profile.name,
      status: 'approved',
    };
    items.push(hardware);
    addRolesForHardware(state, jamId, hardware);
    await fulfillJson(route, hardware, 201);
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.includes('/hardware/') && method === 'PATCH') {
    const [, , jamId, , hardwareId] = pathname.split('/');
    const jam = findJam(state.jams, jamId);
    const hardware = hardwareByJam(state, jamId).find((item) => item.id === hardwareId);
    if (!jam || !hardware) {
      await fulfillJson(route, { detail: 'Hardware not found' }, 404);
      return;
    }
    if (hardware.owner_id !== state.profile.id && !jam.admin_ids.includes(state.profile.id)) {
      await fulfillJson(route, { detail: 'Not allowed' }, 403);
      return;
    }
    const body = parseJsonBody(route);
    const instrument = String(body.instrument ?? '').trim();
    if (!instrument) {
      await fulfillJson(route, { detail: 'Instrument is required' }, 400);
      return;
    }
    if (instrument === 'Vocals') {
      await fulfillJson(route, { detail: 'Vocals are always available as a role and cannot be added as hardware' }, 400);
      return;
    }
    const oldInstrument = hardware.instrument;
    hardware.instrument = instrument;
    renameRolesForHardware(state, jamId, hardware.owner_id, oldInstrument, instrument);
    await fulfillJson(route, hardware);
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.includes('/hardware/') && method === 'DELETE') {
    const [, , jamId, , hardwareId] = pathname.split('/');
    const jam = findJam(state.jams, jamId);
    const items = hardwareByJam(state, jamId);
    const hardware = items.find((item) => item.id === hardwareId);
    if (!jam || !hardware) {
      await fulfillJson(route, { detail: 'Hardware not found' }, 404);
      return;
    }
    if (hardware.owner_id !== state.profile.id && !jam.admin_ids.includes(state.profile.id)) {
      await fulfillJson(route, { detail: 'Not allowed' }, 403);
      return;
    }
    state.hardwareByJamId![jamId] = items.filter((item) => item.id !== hardwareId);
    removeUnclaimedRolesForHardware(state, jamId, hardware.owner_id, hardware.instrument);
    await fulfillJson(route, { detail: 'Hardware removed' });
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.includes('/admins/') && method === 'POST') {
    const [, , jamId, , targetUserId] = pathname.split('/');
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }
    if (!jam.admin_ids.includes(targetUserId)) jam.admin_ids.push(targetUserId);
    await fulfillJson(route, { detail: 'Admin added' });
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.includes('/admins/') && method === 'DELETE') {
    const [, , jamId, , targetUserId] = pathname.split('/');
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }
    jam.admin_ids = jam.admin_ids.filter((id) => id !== targetUserId);
    await fulfillJson(route, { detail: 'Admin removed' });
    return;
  }

  if (pathname.startsWith('/jams/') && pathname.endsWith('/invite-code') && method === 'POST') {
    const jamId = pathname.split('/')[2];
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }
    if (!jam.admin_ids.includes(state.profile.id)) {
      await fulfillJson(route, { detail: 'Admin only' }, 403);
      return;
    }
    if (jam.visibility !== 'private') {
      await fulfillJson(route, { detail: 'Only private jams have invite codes' }, 400);
      return;
    }
    jam.invite_code = `RGEN${String(state.nextInviteSeq++).padStart(2, '0')}`;
    await fulfillJson(route, jam);
    return;
  }

  if (pathname.startsWith('/jams/') && method === 'GET') {
    const jamId = pathname.split('/')[2];
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }
    syncParticipantCount(state, jamId);
    await fulfillJson(route, jam);
    return;
  }

  if (pathname.startsWith('/jams/') && method === 'PATCH') {
    const jamId = pathname.split('/')[2];
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }
    const body = parseJsonBody(route);
    Object.assign(jam, body);
    await fulfillJson(route, jam);
    return;
  }

  if (pathname.startsWith('/jams/') && method === 'DELETE') {
    const jamId = pathname.split('/')[2];
    state.jams = state.jams.filter((jam) => jam.id !== jamId);
    delete state.participantsByJamId[jamId];
    delete state.hardwareByJamId?.[jamId];
    const songs = state.songsByJamId[jamId] ?? [];
    for (const song of songs) delete state.rolesBySongId[song.id];
    delete state.songsByJamId[jamId];
    await fulfillJson(route, { detail: 'Jam deleted' });
    return;
  }

  if (pathname.startsWith('/songs/jam/') && method === 'GET') {
    const jamId = pathname.split('/')[3];
    await fulfillJson(route, state.songsByJamId[jamId] ?? []);
    return;
  }

  if (pathname.startsWith('/songs/jam/') && method === 'POST') {
    const jamId = pathname.split('/')[3];
    const jam = findJam(state.jams, jamId);
    if (!jam) {
      await fulfillJson(route, { detail: 'Jam not found' }, 404);
      return;
    }
    const body = parseJsonBody(route);
    const songId = `song-created-${state.nextSongSeq++}`;
    const newSong: Song = {
      id: songId,
      jam_id: jamId,
      title: body.title,
      artist: body.artist,
      status: jam.require_song_approval ? 'pending' : 'approved',
      submitted_by: state.profile.id,
      submitted_by_name: state.profile.name,
      created_at: new Date().toISOString(),
    };
    state.songsByJamId[jamId] = [...(state.songsByJamId[jamId] ?? []), newSong];
    state.rolesBySongId[songId] = [];
    addDefaultRolesForSong(state, newSong);
    await fulfillJson(route, newSong, 201);
    return;
  }

  if (pathname === '/songs/import/metadata' && method === 'POST') {
    const body = parseJsonBody(route);
    const urlValue = String(body.url ?? '');
    if (urlValue.includes('spotify.com/track')) {
      await fulfillJson(route, {
        title: 'Mock Spotify Song',
        artist: 'Mock Spotify Artist',
        service: 'Spotify',
        original_url: urlValue,
      });
      return;
    }
    if (urlValue.includes('youtube.com') || urlValue.includes('youtu.be')) {
      await fulfillJson(route, {
        title: 'Mock YouTube Song',
        artist: 'Mock YouTube Artist',
        service: 'YouTube',
        original_url: urlValue,
      });
      return;
    }
    await fulfillJson(route, { detail: 'Link not recognized. Use a Spotify track link or YouTube video link.' }, 400);
    return;
  }

  if (pathname === '/songs/import/playlist' && method === 'POST') {
    const body = parseJsonBody(route);
    const urlValue = String(body.url ?? '');
    if (urlValue.includes('spotify.com/playlist')) {
      await fulfillJson(route, {
        service: 'Spotify',
        original_url: urlValue,
        songs: [
          { title: 'Mock Playlist Song', artist: 'Mock Playlist Artist' },
          { title: 'Second Playlist Song', artist: 'Second Playlist Artist' },
        ],
      });
      return;
    }
    if (
      urlValue.includes('youtube.com/playlist')
      || (urlValue.includes('youtube.com/watch') && urlValue.includes('list='))
    ) {
      await fulfillJson(route, {
        service: 'YouTube',
        original_url: urlValue,
        songs: [
          { title: 'Mock YouTube Playlist Song', artist: 'Mock YouTube Playlist Artist' },
          { title: 'Second YouTube Playlist Song', artist: 'Second YouTube Playlist Artist' },
        ],
      });
      return;
    }
    await fulfillJson(route, { detail: 'Link not recognized. Use a Spotify or YouTube playlist link.' }, 400);
    return;
  }

  if (pathname.startsWith('/songs/roles/') && pathname.endsWith('/claim') && method === 'POST') {
    const roleId = pathname.split('/')[3];
    const role = findRole(state, roleId);
    if (!role) {
      await fulfillJson(route, { detail: 'Role not found' }, 404);
      return;
    }

    const location = findSongLocation(state, role.song_id);
    const jam = location ? findJam(state.jams, location.jamId) : null;
    if (jam?.require_role_approval) {
      role.pending_user = state.profile.id;
      role.pending_user_name = state.profile.name;
      role.joined_by = null;
      role.joined_by_name = null;
    } else {
      role.joined_by = state.profile.id;
      role.joined_by_name = state.profile.name;
      role.pending_user = null;
      role.pending_user_name = null;
    }

    await fulfillJson(route, { detail: 'Role claimed' });
    return;
  }

  if (pathname.startsWith('/songs/roles/') && pathname.endsWith('/leave') && method === 'POST') {
    const roleId = pathname.split('/')[3];
    const role = findRole(state, roleId);
    if (!role) {
      await fulfillJson(route, { detail: 'Role not found' }, 404);
      return;
    }
    if (role.joined_by === state.profile.id) {
      role.joined_by = null;
      role.joined_by_name = null;
    }
    if (role.pending_user === state.profile.id) {
      role.pending_user = null;
      role.pending_user_name = null;
    }
    await fulfillJson(route, { detail: 'Role left' });
    return;
  }

  if (pathname.startsWith('/songs/roles/') && pathname.endsWith('/approve') && method === 'PATCH') {
    const roleId = pathname.split('/')[3];
    const role = findRole(state, roleId);
    if (!role) {
      await fulfillJson(route, { detail: 'Role not found' }, 404);
      return;
    }
    role.joined_by = role.pending_user;
    role.joined_by_name = role.pending_user_name;
    role.pending_user = null;
    role.pending_user_name = null;
    await fulfillJson(route, { detail: 'Role approved' });
    return;
  }

  if (pathname.startsWith('/songs/roles/') && pathname.endsWith('/reject') && method === 'PATCH') {
    const roleId = pathname.split('/')[3];
    const role = findRole(state, roleId);
    if (!role) {
      await fulfillJson(route, { detail: 'Role not found' }, 404);
      return;
    }
    role.pending_user = null;
    role.pending_user_name = null;
    await fulfillJson(route, { detail: 'Role rejected' });
    return;
  }

  if (pathname.startsWith('/songs/') && pathname.endsWith('/roles') && method === 'GET') {
    const songId = pathname.split('/')[2];
    const location = findSongLocation(state, songId);
    if (location) addDefaultRolesForSong(state, location.song);
    await fulfillJson(route, state.rolesBySongId[songId] ?? []);
    return;
  }

  if (pathname.startsWith('/songs/') && method === 'PATCH') {
    const songId = pathname.split('/')[2];
    const location = findSongLocation(state, songId);
    if (!location) {
      await fulfillJson(route, { detail: 'Song not found' }, 404);
      return;
    }
    const body = parseJsonBody(route);
    Object.assign(location.song, body);
    await fulfillJson(route, location.song);
    return;
  }

  if (pathname.startsWith('/songs/') && method === 'DELETE') {
    const songId = pathname.split('/')[2];
    const location = findSongLocation(state, songId);
    if (!location) {
      await fulfillJson(route, { detail: 'Song not found' }, 404);
      return;
    }
    state.songsByJamId[location.jamId] = state.songsByJamId[location.jamId].filter(
      (song) => song.id !== songId
    );
    delete state.rolesBySongId[songId];
    await fulfillJson(route, { detail: 'Song deleted' });
    return;
  }

  await fulfillJson(route, { detail: 'Not mocked' }, 404);
}

export async function mockGuestApi(page: Page, data: GuestMockData = defaultMockData) {
  const state = cloneData(data);
  await page.route('**/*', async (route) => {
    await handleGuestRoute(route, state);
  });
}

export async function mockAuthenticatedSession(
  page: Page,
  options: {
    initialUser?: MockAuthUser | null;
    googleUser?: MockAuthUser;
    facebookUser?: MockAuthUser;
  } = {}
) {
  const initialUser = options.initialUser === undefined ? defaultAuthenticatedData.authUser : options.initialUser;
  const googleUser = options.googleUser ?? defaultAuthenticatedData.authUser;
  const facebookUser = options.facebookUser ?? defaultAuthenticatedData.authUser;

  await page.addInitScript(
    ({ initialUser: nextInitialUser, nextGoogleUser, nextFacebookUser }) => {
      window.__MYJAM_E2E_AUTH__ = {
        enabled: true,
        initialUser: nextInitialUser,
        googleUser: nextGoogleUser,
        facebookUser: nextFacebookUser,
      };
    },
    {
      initialUser,
      nextGoogleUser: googleUser,
      nextFacebookUser: facebookUser,
    }
  );
}

export async function mockAuthenticatedApi(
  page: Page,
  data: AuthenticatedMockData = defaultAuthenticatedData
) {
  const state = createAuthenticatedState(data);
  await mockAuthenticatedApiWithState(page, state);
}

export function createSharedAuthenticatedState(
  data: AuthenticatedMockData = defaultAuthenticatedData
) {
  return createAuthenticatedState(data);
}

export async function mockAuthenticatedApiWithState(
  page: Page,
  state: AuthenticatedMockState
) {
  await page.route('**/*', async (route) => {
    await handleAuthenticatedRoute(route, state);
  });
}

export async function setMockLocation(context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
}
