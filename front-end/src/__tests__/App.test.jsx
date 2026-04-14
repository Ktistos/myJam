import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { createRolesFromParticipants } from '../App';

vi.mock('../services/api', () => ({
  getMe: vi.fn(),
  createUser: vi.fn(),
  getSpotifyStatus: vi.fn(),
  createSpotifyLoginUrl: vi.fn(),
  disconnectSpotify: vi.fn(),
  listJams: vi.fn(),
  getJam: vi.fn(),
  createJam: vi.fn(),
  updateJam: vi.fn(),
  deleteJam: vi.fn(),
  getJamByCode: vi.fn(),
  regenerateInviteCode: vi.fn(),
  listParticipants: vi.fn(),
  joinJam: vi.fn(),
  leaveJam: vi.fn(),
  addHardware: vi.fn(),
  listHardware: vi.fn(),
  submitHardware: vi.fn(),
  updateHardware: vi.fn(),
  removeHardware: vi.fn(),
  approveHardware: vi.fn(),
  rejectHardware: vi.fn(),
  addAdmin: vi.fn(),
  removeAdmin: vi.fn(),
  createJamEventToken: vi.fn(),
  listSongs: vi.fn(),
  importSongMetadata: vi.fn(),
  submitSong: vi.fn(),
  updateSong: vi.fn(),
  deleteSong: vi.fn(),
  listRoles: vi.fn(),
  claimRole: vi.fn(),
  leaveRole: vi.fn(),
  approveRole: vi.fn(),
  rejectRole: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(() => Promise.resolve('token-123')),
    },
  },
  onAuthStateChanged: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithFacebook: vi.fn(),
  logout: vi.fn(),
}));

import * as api from '../services/api';
import { onAuthStateChanged } from '../services/firebase';

const guestJam = {
  id: 'jam-1',
  name: 'Sunday Blues Session',
  date: '2026-05-10T18:00:00.000Z',
  state: 'initial',
  visibility: 'public',
  address: '123 Main St',
  require_role_approval: false,
  require_song_approval: false,
  admin_ids: ['uid-1'],
  current_song_id: null,
  participant_count: 1,
};

const guestParticipants = [
  {
    user: {
      id: 'uid-1',
      name: 'Alex',
      bio: 'Singer',
      recording_link: '',
      avatar_url: '',
      instruments: [{ instrument: 'Vocals', skill_level: 'Intermediate' }],
    },
    joined_at: '2026-05-10T17:00:00.000Z',
  },
];

const guestSongs = [
  {
    id: 'song-1',
    jam_id: 'jam-1',
    title: 'Little Wing',
    artist: 'Jimi Hendrix',
    status: 'approved',
    submitted_by: 'uid-1',
    submitted_by_name: 'Alex',
    created_at: '2026-05-10T17:30:00.000Z',
  },
];

class MockEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    MockEventSource.instances.push(this);
  }
  close() {}
}

describe('createRolesFromParticipants', () => {
  it('creates one open vocals role and hardware roles from all supported instrument shapes', () => {
    const roles = createRolesFromParticipants('song-99', [
      {
        userId: 'uid-1',
        name: 'Alex',
        instrumentObjects: [
          { instrument: 'Electric Guitar', skill_level: 'advanced' },
          { type: 'Bass Guitar', model: 'Fender P Bass', skill: 'Intermediate' },
          { type: 'Vocals', skill: 'Advanced' },
          { instrument: 'Electric Guitar', skill_level: 'advanced' },
        ],
      },
      {
        userId: 'uid-2',
        name: 'Morgan',
        instrumentObjects: ['Drums'],
      },
    ]);

    expect(roles).toEqual([
      expect.objectContaining({
        songId: 'song-99',
        instrument: 'Vocals',
        ownerId: null,
        joinedByUserId: null,
        pendingUserId: null,
      }),
      expect.objectContaining({
        songId: 'song-99',
        instrument: 'Electric Guitar',
        ownerId: 'uid-1',
        ownerName: 'Alex',
      }),
      expect.objectContaining({
        songId: 'song-99',
        instrument: 'Bass Guitar — Fender P Bass',
        ownerId: 'uid-1',
        ownerName: 'Alex',
      }),
      expect.objectContaining({
        songId: 'song-99',
        instrument: 'Drums',
        ownerId: 'uid-2',
        ownerName: 'Morgan',
      }),
    ]);
    expect(roles.map((role) => role.instrument)).not.toContain('[object Object]');
    expect(roles.filter((role) => role.instrument === 'Vocals')).toHaveLength(1);
  });
});

describe('App interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('EventSource', MockEventSource);
    MockEventSource.instances = [];
    api.createJamEventToken.mockResolvedValue({ token: 'event-token-123', expires_in: 21600 });
    api.listHardware.mockResolvedValue([]);
    api.submitHardware.mockResolvedValue({});
    api.updateHardware.mockResolvedValue({});
    api.removeHardware.mockResolvedValue({});
    api.approveHardware.mockResolvedValue({});
    api.rejectHardware.mockResolvedValue({});
    api.getSpotifyStatus.mockResolvedValue({ connected: false });
    api.createSpotifyLoginUrl.mockResolvedValue({ url: 'http://127.0.0.1:8000/spotify/callback?mock=1' });
    api.disconnectSpotify.mockResolvedValue({ connected: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('supports the guest browse flow with jam navigation and participant modal clicks', async () => {
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    api.listJams.mockResolvedValue([guestJam]);
    api.listParticipants.mockResolvedValue(guestParticipants);
    api.listSongs.mockResolvedValue(guestSongs);

    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /browse public jams near me/i }));
    expect(await screen.findByText('Sunday Blues Session')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Sunday Blues Session'));
    expect(await screen.findByRole('button', { name: /back to jams/i })).toBeInTheDocument();

    await userEvent.click(screen.getByText('Alex'));
    expect(await screen.findByText('Singer')).toBeInTheDocument();

    await userEvent.click(screen.getByText('×'));
    await waitFor(() => {
      expect(screen.queryByText('Singer')).not.toBeInTheDocument();
    });
  });

  it('supports logged-in jam and song navigation with role claiming clicks', async () => {
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', displayName: 'Alex', photoURL: '' });
      return () => {};
    });
    api.getMe.mockResolvedValue({
      id: 'uid-1',
      name: 'Alex',
      bio: 'Singer',
      recording_link: '',
      avatar_url: '',
      instruments: [{ instrument: 'Electric Guitar', skill_level: 'Intermediate' }],
    });
    api.listJams.mockResolvedValue([guestJam]);
    api.listParticipants.mockResolvedValue(guestParticipants);
    api.listSongs.mockResolvedValue(guestSongs);
    api.listRoles
      .mockResolvedValueOnce([
        {
          id: 'role-1',
          song_id: 'song-1',
          instrument: 'Vocals',
          owner_id: null,
          owner_name: null,
          joined_by: null,
          joined_by_name: null,
          pending_user: null,
          pending_user_name: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'role-1',
          song_id: 'song-1',
          instrument: 'Vocals',
          owner_id: null,
          owner_name: null,
          joined_by: null,
          joined_by_name: null,
          pending_user: null,
          pending_user_name: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'role-1',
          song_id: 'song-1',
          instrument: 'Vocals',
          owner_id: null,
          owner_name: null,
          joined_by: 'uid-1',
          joined_by_name: 'Alex',
          pending_user: null,
          pending_user_name: null,
        },
      ]);
    api.claimRole.mockResolvedValue({});

    render(<App />);

    expect(await screen.findByText('Sunday Blues Session')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Sunday Blues Session'));
    expect(await screen.findByRole('button', { name: /back to jams/i })).toBeInTheDocument();
    expect(api.createJamEventToken).toHaveBeenCalledWith('jam-1');
    expect(MockEventSource.instances.at(-1)?.url).toContain('token=event-token-123');
    expect(MockEventSource.instances.at(-1)?.url).not.toContain('token=token-123');

    await userEvent.click(screen.getByText('Little Wing'));
    expect(await screen.findByRole('button', { name: /i'll play/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /i'll play/i }));
    expect(api.claimRole).toHaveBeenCalledWith('role-1');
    expect(api.listRoles).toHaveBeenCalledWith('song-1');
  });

  it('does not open SSE for a logged-in user who is only viewing a public jam', async () => {
    const viewOnlyJam = {
      ...guestJam,
      admin_ids: ['uid-admin'],
      participant_count: 1,
      is_participant: false,
    };
    const viewOnlyParticipants = [
      {
        user: {
          id: 'uid-admin',
          name: 'Morgan',
          bio: 'Host',
          recording_link: '',
          avatar_url: '',
          instruments: [],
        },
        joined_at: '2026-05-10T17:00:00.000Z',
      },
    ];

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', displayName: 'Alex', photoURL: '' });
      return () => {};
    });
    api.getMe.mockResolvedValue({
      id: 'uid-1',
      name: 'Alex',
      bio: 'Singer',
      recording_link: '',
      avatar_url: '',
      instruments: [{ instrument: 'Vocals', skill_level: 'Intermediate' }],
    });
    api.listJams.mockResolvedValue([viewOnlyJam]);
    api.listParticipants.mockResolvedValue(viewOnlyParticipants);
    api.listSongs.mockResolvedValue(guestSongs);

    render(<App />);

    expect(await screen.findByText('Sunday Blues Session')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Sunday Blues Session'));
    expect(await screen.findByRole('button', { name: /join this jam/i })).toBeInTheDocument();
    expect(api.createJamEventToken).not.toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('reconciles a stale join when the account already joined from another browser', async () => {
    const staleJoinJam = {
      ...guestJam,
      admin_ids: ['uid-admin'],
      participant_count: 1,
      is_participant: false,
    };
    const reconciledJam = {
      ...staleJoinJam,
      participant_count: 2,
      is_participant: true,
      hardware: [],
    };
    const staleParticipants = [
      {
        user: {
          id: 'uid-admin',
          name: 'Morgan',
          bio: 'Host',
          recording_link: '',
          avatar_url: '',
          instruments: [],
        },
        joined_at: '2026-05-10T17:00:00.000Z',
      },
    ];
    const reconciledParticipants = [
      ...staleParticipants,
      {
        user: {
          id: 'uid-1',
          name: 'Alex',
          bio: 'Singer',
          recording_link: '',
          avatar_url: '',
          instruments: [{ instrument: 'Vocals', skill_level: 'Intermediate' }],
        },
        joined_at: '2026-05-10T17:05:00.000Z',
      },
    ];

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', displayName: 'Alex', photoURL: '' });
      return () => {};
    });
    api.getMe.mockResolvedValue({
      id: 'uid-1',
      name: 'Alex',
      bio: 'Singer',
      recording_link: '',
      avatar_url: '',
      instruments: [{ instrument: 'Vocals', skill_level: 'Intermediate' }],
    });
    api.listJams.mockResolvedValue([staleJoinJam]);
    api.listParticipants
      .mockResolvedValueOnce(staleParticipants)
      .mockResolvedValueOnce(reconciledParticipants);
    api.listSongs.mockResolvedValue(guestSongs);
    api.joinJam.mockRejectedValue(Object.assign(new Error('Already a participant'), { status: 409, detail: 'Already a participant' }));
    api.getJam.mockResolvedValue(reconciledJam);

    render(<App />);

    expect(await screen.findByText('Sunday Blues Session')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Sunday Blues Session'));
    expect(await screen.findByRole('button', { name: /join this jam/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /join this jam/i }));
    await userEvent.click(screen.getByRole('button', { name: /join without adding instruments/i }));

    expect(await screen.findByText('Already Joined')).toBeInTheDocument();
    expect(api.getJam).toHaveBeenCalledWith('jam-1');
    expect(api.listParticipants).toHaveBeenCalledTimes(2);
    expect(api.submitHardware).not.toHaveBeenCalled();
  });

  it('reconciles the jam after join succeeds but hardware registration fails', async () => {
    const joiningJam = {
      ...guestJam,
      admin_ids: ['uid-admin'],
      participant_count: 1,
      is_participant: false,
    };
    const reconciledJam = {
      ...joiningJam,
      participant_count: 2,
      is_participant: true,
      hardware: [],
    };
    const initialParticipants = [
      {
        user: {
          id: 'uid-admin',
          name: 'Morgan',
          bio: 'Host',
          recording_link: '',
          avatar_url: '',
          instruments: [],
        },
        joined_at: '2026-05-10T17:00:00.000Z',
      },
    ];
    const reconciledParticipants = [
      ...initialParticipants,
      {
        user: {
          id: 'uid-1',
          name: 'Alex',
          bio: 'Singer',
          recording_link: '',
          avatar_url: '',
          instruments: [{ instrument: 'Vocals', skill_level: 'Intermediate' }],
        },
        joined_at: '2026-05-10T17:05:00.000Z',
      },
    ];

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', displayName: 'Alex', photoURL: '' });
      return () => {};
    });
    api.getMe.mockResolvedValue({
      id: 'uid-1',
      name: 'Alex',
      bio: 'Singer',
      recording_link: '',
      avatar_url: '',
      instruments: [{ instrument: 'Vocals', skill_level: 'Intermediate' }],
    });
    api.listJams.mockResolvedValue([joiningJam]);
    api.listParticipants
      .mockResolvedValueOnce(initialParticipants)
      .mockResolvedValueOnce(reconciledParticipants);
    api.listSongs.mockResolvedValue(guestSongs);
    api.joinJam.mockResolvedValue({ detail: 'Joined' });
    api.submitHardware.mockRejectedValue(Object.assign(new Error('Hardware service unavailable'), { status: 500 }));
    api.getJam.mockResolvedValue(reconciledJam);

    render(<App />);

    expect(await screen.findByText('Sunday Blues Session')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Sunday Blues Session'));
    await userEvent.click(screen.getByRole('button', { name: /join this jam/i }));
    await userEvent.selectOptions(
      screen.getByLabelText(/additional hardware instrument/i),
      'Electric Guitar',
    );
    await userEvent.click(screen.getByRole('button', { name: /add instrument/i }));
    await userEvent.click(screen.getByRole('button', { name: /join & add 1 instrument/i }));

    expect(await screen.findByText('Joined, but Incomplete')).toBeInTheDocument();
    expect(api.getJam).toHaveBeenCalledWith('jam-1');
    expect(api.listParticipants).toHaveBeenCalledTimes(2);
  });

  it('removes the jam from local state when the last admin leaves and the backend deletes it', async () => {
    const deletableJam = {
      ...guestJam,
      created_by: 'uid-1',
      participant_count: 2,
      is_participant: true,
    };
    const jamParticipants = [
      ...guestParticipants,
      {
        user: {
          id: 'uid-2',
          name: 'Morgan',
          bio: 'Host',
          recording_link: '',
          avatar_url: '',
          instruments: [],
        },
        joined_at: '2026-05-10T17:03:00.000Z',
      },
    ];

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', displayName: 'Alex', photoURL: '' });
      return () => {};
    });
    api.getMe.mockResolvedValue({
      id: 'uid-1',
      name: 'Alex',
      bio: 'Singer',
      recording_link: '',
      avatar_url: '',
      instruments: [{ instrument: 'Vocals', skill_level: 'Intermediate' }],
    });
    api.listJams.mockResolvedValue([deletableJam]);
    api.listParticipants.mockResolvedValue(jamParticipants);
    api.listSongs.mockResolvedValue(guestSongs);
    api.leaveJam.mockResolvedValue({ detail: 'Jam deleted', deleted_jam: true });

    render(<App />);

    expect(await screen.findByText('Sunday Blues Session')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Sunday Blues Session'));
    expect(await screen.findByRole('button', { name: /leave and delete jam/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /leave and delete jam/i }));

    expect(await screen.findByText('Jam Deleted')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Sunday Blues Session')).not.toBeInTheDocument();
    });
    expect(api.leaveJam).toHaveBeenCalledWith('jam-1');
  });

  it('reconciles a stale leave when another browser already left the jam', async () => {
    const joinedJam = {
      ...guestJam,
      admin_ids: ['uid-admin'],
      participant_count: 2,
      is_participant: true,
    };
    const initialParticipants = [
      ...guestParticipants,
      {
        user: {
          id: 'uid-admin',
          name: 'Morgan',
          bio: 'Host',
          recording_link: '',
          avatar_url: '',
          instruments: [],
        },
        joined_at: '2026-05-10T17:00:00.000Z',
      },
    ];
    const reconciledJam = {
      ...joinedJam,
      participant_count: 1,
      is_participant: false,
    };
    const reconciledParticipants = [
      {
        user: {
          id: 'uid-admin',
          name: 'Morgan',
          bio: 'Host',
          recording_link: '',
          avatar_url: '',
          instruments: [],
        },
        joined_at: '2026-05-10T17:00:00.000Z',
      },
    ];

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', displayName: 'Alex', photoURL: '' });
      return () => {};
    });
    api.getMe.mockResolvedValue({
      id: 'uid-1',
      name: 'Alex',
      bio: 'Singer',
      recording_link: '',
      avatar_url: '',
      instruments: [{ instrument: 'Vocals', skill_level: 'Intermediate' }],
    });
    api.listJams.mockResolvedValue([joinedJam]);
    api.listParticipants
      .mockResolvedValueOnce(initialParticipants)
      .mockResolvedValueOnce(reconciledParticipants);
    api.listSongs.mockResolvedValue(guestSongs);
    api.leaveJam.mockRejectedValue(Object.assign(new Error('Not a participant'), { status: 404, detail: 'Not a participant' }));
    api.getJam.mockResolvedValue(reconciledJam);

    render(<App />);

    expect(await screen.findByText('Sunday Blues Session')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Sunday Blues Session'));
    expect(await screen.findByRole('button', { name: /leave jam/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /leave jam/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /back to jams/i })).not.toBeInTheDocument();
    });
    expect(api.getJam).toHaveBeenCalledWith('jam-1');
    expect(screen.queryByText(/^Error$/)).not.toBeInTheDocument();
  });
});
