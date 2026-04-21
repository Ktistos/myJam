import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JamDetail from '../pages/JamDetail';

const makeJam = (overrides = {}) => ({
  id: 'jam-1',
  name: 'Thursday Blues Night',
  date: '2026-06-01T20:00:00.000Z',
  location: { address: '123 Main St', lat: null, lng: null },
  visibility: 'public',
  state: 'initial',
  admins: ['admin-1'],
  inviteCode: null,
  currentSongId: null,
  settings: { requireRoleApproval: false, requireSongApproval: false },
  ...overrides,
});

const makeSong = (overrides = {}) => ({
  id: 'song-1',
  title: 'Little Wing',
  artist: 'Jimi Hendrix',
  status: 'approved',
  submittedBy: 'user-1',
  submittedByName: 'You',
  ...overrides,
});

const participants = [
  { userId: 'user-1', name: 'You', bio: 'Bio', recordingLink: '', avatarUrl: null, instrumentObjects: [{ type: 'Vocals', skill: 'Intermediate' }] },
  { userId: 'admin-1', name: 'Admin', bio: 'Lead guitarist', recordingLink: '', avatarUrl: null, instrumentObjects: [{ type: 'Electric Guitar', model: 'SG', skill: 'Advanced' }] },
];

const setup = (overrides = {}) => {
  const props = {
    jam: makeJam(),
    songs: [makeSong()],
    onSongClick: vi.fn(),
    onAddSong: vi.fn(),
    onBack: vi.fn(),
    onOpenImportModal: vi.fn(),
    isAdmin: false,
    isGuest: false,
    isParticipant: true,
    onJoinJam: vi.fn(),
    onLeaveJam: vi.fn(),
    participants,
    rolesBySongId: {},
    onAdvanceState: vi.fn(),
    onUpdateSettings: vi.fn(),
    onRegenerateInviteCode: vi.fn(),
    onSetCurrentSong: vi.fn(),
    onApproveSong: vi.fn(),
    onRejectSong: vi.fn(),
    onApproveRole: vi.fn(),
    onRejectRole: vi.fn(),
    onAddAdmin: vi.fn(),
    onRemoveAdmin: vi.fn(),
    onRemoveParticipant: vi.fn(),
    onDeleteJam: vi.fn(),
    onDeleteSong: vi.fn(),
    onEditSong: vi.fn(),
    onReschedule: vi.fn(),
    hardware: [],
    onSubmitHardware: vi.fn(),
    onUpdateHardware: vi.fn(),
    onRemoveHardware: vi.fn(),
    onApproveHardware: vi.fn(),
    onRejectHardware: vi.fn(),
    currentUserId: 'user-1',
    ...overrides,
  };
  render(<JamDetail {...props} />);
  return props;
};

describe('JamDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn() },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls onBack when the back button is clicked', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /back to jams/i }));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  it('shows join button for a public jam when the user is not a participant', async () => {
    const props = setup({ isParticipant: false });
    await userEvent.click(screen.getByRole('button', { name: /join this jam/i }));
    expect(props.onJoinJam).toHaveBeenCalledWith('jam-1');
  });

  it('shows leave button for non-admin participants', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /leave jam/i }));
    expect(props.onLeaveJam).toHaveBeenCalledWith('jam-1');
  });

  it('shows leave-and-delete for the last admin on completed jams', async () => {
    const props = setup({
      jam: makeJam({ state: 'completed' }),
      isAdmin: true,
      currentUserId: 'admin-1',
    });

    await userEvent.click(screen.getByRole('button', { name: /leave and delete jam/i }));
    expect(props.onLeaveJam).toHaveBeenCalledWith('jam-1');
  });

  it('labels the last-admin action as leave and delete jam', () => {
    setup({
      isAdmin: true,
      currentUserId: 'admin-1',
    });

    expect(screen.getByRole('button', { name: /leave and delete jam/i })).toBeInTheDocument();
  });

  it('shows the guest sign-in prompt instead of a join button', () => {
    setup({ isGuest: true, isParticipant: false });
    expect(screen.getByText(/sign in to join this jam/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join this jam/i })).not.toBeInTheDocument();
  });

  it('reveals and copies the private invite code for admins', async () => {
    setup({
      jam: makeJam({ visibility: 'private', inviteCode: 'ROCK42' }),
      isAdmin: true,
    });

    await userEvent.click(screen.getByRole('button', { name: /show invite code/i }));
    expect(screen.getByText('ROCK42')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ROCK42');
  });

  it('regenerates the private invite code after admin confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const props = setup({
      jam: makeJam({ visibility: 'private', inviteCode: 'ROCK42' }),
      isAdmin: true,
    });

    await userEvent.click(screen.getByRole('button', { name: /regenerate code/i }));

    expect(confirm).toHaveBeenCalledWith(
      'Regenerate this invite code? The current code will stop working.'
    );
    expect(props.onRegenerateInviteCode).toHaveBeenCalledWith('jam-1');
  });

  it('navigates to song detail when a song row is clicked', async () => {
    const props = setup();
    await userEvent.click(screen.getByText('Little Wing'));
    expect(props.onSongClick).toHaveBeenCalledWith('song-1');
  });

  it('splits approved songs into current playlist and pending songs into proposed songs', () => {
    setup({
      songs: [
        makeSong({ id: 'song-approved', title: 'Little Wing', status: 'approved' }),
        makeSong({
          id: 'song-pending',
          title: 'Hey Joe',
          artist: 'Jimi Hendrix',
          status: 'pending',
          submittedBy: 'user-2',
          submittedByName: 'Morgan',
        }),
      ],
    });

    const currentPlaylist = screen.getByTestId('current-playlist-section');
    const proposedSongs = screen.getByTestId('proposed-songs-section');

    expect(within(currentPlaylist).getByRole('heading', { name: /current playlist/i })).toBeInTheDocument();
    expect(within(currentPlaylist).getByText('Little Wing')).toBeInTheDocument();
    expect(within(currentPlaylist).queryByText('Hey Joe')).not.toBeInTheDocument();
    expect(within(proposedSongs).getByRole('heading', { name: /proposed songs/i })).toBeInTheDocument();
    expect(within(proposedSongs).getByText('Hey Joe')).toBeInTheDocument();
    expect(within(proposedSongs).queryByText('Little Wing')).not.toBeInTheDocument();
  });

  it('filters the current playlist with its search input', async () => {
    setup({
      songs: [
        makeSong({ id: 'song-1', title: 'Little Wing', artist: 'Jimi Hendrix' }),
        makeSong({ id: 'song-2', title: 'Red House', artist: 'Jimi Hendrix' }),
      ],
    });

    await userEvent.type(screen.getByLabelText(/search current playlist/i), 'red');

    const currentPlaylist = screen.getByTestId('current-playlist-section');
    expect(within(currentPlaylist).getByText('Red House')).toBeInTheDocument();
    expect(within(currentPlaylist).queryByText('Little Wing')).not.toBeInTheDocument();
  });

  it('filters proposed songs with its search input', async () => {
    setup({
      songs: [
        makeSong({ id: 'song-1' }),
        makeSong({ id: 'song-2', title: 'Hey Joe', status: 'pending', submittedBy: 'user-2', submittedByName: 'Morgan' }),
        makeSong({ id: 'song-3', title: 'Cissy Strut', artist: 'The Meters', status: 'pending', submittedBy: 'user-3', submittedByName: 'Casey' }),
      ],
    });

    await userEvent.type(screen.getByLabelText(/search proposed songs/i), 'meters');

    const proposedSongs = screen.getByTestId('proposed-songs-section');
    expect(within(proposedSongs).getByText('Cissy Strut')).toBeInTheDocument();
    expect(within(proposedSongs).queryByText('Hey Joe')).not.toBeInTheDocument();
  });

  it('lets admins approve and reject proposed songs from the proposed list', async () => {
    const props = setup({
      isAdmin: true,
      songs: [
        makeSong({ id: 'song-1' }),
        makeSong({ id: 'song-2', title: 'Hey Joe', status: 'pending', submittedBy: 'user-2', submittedByName: 'Morgan' }),
        makeSong({ id: 'song-3', title: 'Cissy Strut', artist: 'The Meters', status: 'pending', submittedBy: 'user-3', submittedByName: 'Casey' }),
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: /approve hey joe/i }));
    await userEvent.click(screen.getByRole('button', { name: /reject cissy strut/i }));

    expect(props.onApproveSong).toHaveBeenCalledWith('jam-1', 'song-2');
    expect(props.onRejectSong).toHaveBeenCalledWith('jam-1', 'song-3');
  });

  it('lets admins approve visible proposed songs as a batch', async () => {
    const props = setup({
      isAdmin: true,
      songs: [
        makeSong({ id: 'song-1' }),
        makeSong({ id: 'song-2', title: 'Hey Joe', status: 'pending', submittedBy: 'user-2', submittedByName: 'Morgan' }),
        makeSong({ id: 'song-3', title: 'Cissy Strut', artist: 'The Meters', status: 'pending', submittedBy: 'user-3', submittedByName: 'Casey' }),
      ],
    });

    await userEvent.type(screen.getByLabelText(/search proposed songs/i), 'hey');
    await userEvent.click(screen.getByRole('button', { name: /approve visible/i }));

    expect(props.onApproveSong).toHaveBeenCalledTimes(1);
    expect(props.onApproveSong).toHaveBeenCalledWith('jam-1', 'song-2');
  });

  it('lets admins switch to any approved playlist song by clicking the row during an in-progress jam', async () => {
    const props = setup({
      isAdmin: true,
      jam: makeJam({ state: 'in-progress', currentSongId: 'song-1' }),
      songs: [
        makeSong({ id: 'song-1', title: 'Little Wing' }),
        makeSong({ id: 'song-2', title: 'Red House', artist: 'Jimi Hendrix' }),
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: /switch to red house/i }));

    expect(props.onSetCurrentSong).toHaveBeenCalledWith('jam-1', 'song-2');
    expect(props.onSongClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /switch to little wing/i })).not.toBeInTheDocument();
  });

  it('lets admins switch to an approved playlist song with the explicit play action', async () => {
    const props = setup({
      isAdmin: true,
      jam: makeJam({ state: 'in-progress', currentSongId: 'song-1' }),
      songs: [
        makeSong({ id: 'song-1', title: 'Little Wing' }),
        makeSong({ id: 'song-2', title: 'Red House', artist: 'Jimi Hendrix' }),
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: /play red house now/i }));

    expect(props.onSetCurrentSong).toHaveBeenCalledWith('jam-1', 'song-2');
  });

  it('keeps duplicate proposed songs as separate searchable rows', async () => {
    const props = setup({
      isAdmin: true,
      songs: [
        makeSong({ id: 'song-1' }),
        makeSong({
          id: 'song-dup-1',
          title: 'Duplicate Song',
          artist: 'Same Artist',
          status: 'pending',
          submittedBy: 'user-2',
          submittedByName: 'Morgan',
        }),
        makeSong({
          id: 'song-dup-2',
          title: 'Duplicate Song',
          artist: 'Same Artist',
          status: 'pending',
          submittedBy: 'user-3',
          submittedByName: 'Casey',
        }),
      ],
    });

    await userEvent.type(screen.getByLabelText(/search proposed songs/i), 'duplicate');

    const proposedSongs = screen.getByTestId('proposed-songs-section');
    expect(within(proposedSongs).getAllByText('Duplicate Song')).toHaveLength(2);

    await userEvent.click(within(proposedSongs).getByRole('button', { name: /approve duplicate song by same artist from casey/i }));
    expect(props.onApproveSong).toHaveBeenCalledWith('jam-1', 'song-dup-2');
  });

  it('edits a song inline and saves through onEditSong', async () => {
    const props = setup();
    await userEvent.click(screen.getByTitle(/edit song/i));

    const titleInput = screen.getByDisplayValue('Little Wing');
    const artistInput = screen.getByDisplayValue('Jimi Hendrix');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Voodoo Child');
    await userEvent.clear(artistInput);
    await userEvent.type(artistInput, 'Hendrix');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(props.onEditSong).toHaveBeenCalledWith('jam-1', 'song-1', 'Voodoo Child', 'Hendrix');
  });

  it('deletes a song when the delete action is clicked', async () => {
    const props = setup();
    await userEvent.click(screen.getByTitle(/delete song/i));
    expect(props.onDeleteSong).toHaveBeenCalledWith('jam-1', 'song-1');
  });

  it('withdraws a pending song submission', async () => {
    const props = setup({
      songs: [
        makeSong({ id: 'song-1' }),
        makeSong({ id: 'song-2', title: 'Hey Joe', status: 'pending', submittedBy: 'user-1' }),
      ],
    });

    await userEvent.click(screen.getByTitle(/withdraw submission/i));
    expect(props.onDeleteSong).toHaveBeenCalledWith('jam-1', 'song-2');
  });

  it('adds a song through the embedded add-song form', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /add a song to the setlist/i }));
    await userEvent.type(screen.getByLabelText(/song title/i), 'Stormy Monday');
    await userEvent.type(screen.getByLabelText(/original artist/i), 'T-Bone Walker');
    await userEvent.click(screen.getByRole('button', { name: /\+ add song/i }));

    expect(props.onAddSong).toHaveBeenCalledWith('Stormy Monday', 'T-Bone Walker');
  });

  it('opens the import modal from the embedded add-song form', async () => {
    const props = setup();
    await userEvent.click(screen.getByTitle(/import via link/i));
    expect(props.onOpenImportModal).toHaveBeenCalledOnce();
  });

  it('adds available hardware from the jam detail editor', async () => {
    const props = setup();
    const select = screen.getByLabelText(/hardware instrument/i);

    expect([...select.options].map((option) => option.value)).not.toContain('Vocals');
    await userEvent.selectOptions(select, 'Bass Guitar');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(props.onSubmitHardware).toHaveBeenCalledWith('jam-1', 'Bass Guitar');
  });

  it('updates available hardware from the jam detail editor', async () => {
    const props = setup({
      hardware: [
        {
          id: 'hw-1',
          instrument: 'Guitar',
          owner_id: 'user-1',
          owner_name: 'You',
          status: 'approved',
        },
      ],
    });

    expect(screen.getAllByText('Guitar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByTitle(/edit hardware/i));
    const input = screen.getByLabelText(/edit hardware instrument/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Electric Guitar');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(props.onUpdateHardware).toHaveBeenCalledWith('jam-1', 'hw-1', 'Electric Guitar');
  });

  it('removes available hardware owned by the current user', async () => {
    const props = setup({
      hardware: [
        {
          id: 'hw-1',
          instrument: 'Guitar',
          owner_id: 'user-1',
          owner_name: 'You',
          status: 'approved',
        },
      ],
    });

    await userEvent.click(screen.getByTitle(/remove hardware/i));

    expect(props.onRemoveHardware).toHaveBeenCalledWith('jam-1', 'hw-1');
  });

  it('lets admins remove another participant from the participant list', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const props = setup({
      isAdmin: true,
      currentUserId: 'admin-1',
    });

    await userEvent.click(screen.getByRole('button', { name: /remove you from jam/i }));

    expect(confirm).toHaveBeenCalledWith(
      'Remove You from this jam? Their roles, pending claims, and hardware will be removed.'
    );
    expect(props.onRemoveParticipant).toHaveBeenCalledWith('jam-1', 'user-1');
    expect(screen.queryByText('Bio')).not.toBeInTheDocument();
  });

  it('does not show participant remove actions to non-admins', () => {
    setup();

    expect(screen.queryByRole('button', { name: /remove you from jam/i })).not.toBeInTheDocument();
  });

  it('opens and closes the participant profile modal', async () => {
    setup();
    await userEvent.click(screen.getByText('Admin'));
    expect(screen.getByText('Lead guitarist')).toBeInTheDocument();

    await userEvent.click(screen.getByText('×'));
    expect(screen.queryByText('Lead guitarist')).not.toBeInTheDocument();
  });

  it('shows the now-playing banner when the jam is in progress', () => {
    setup({
      jam: makeJam({ state: 'in-progress', currentSongId: 'song-1' }),
    });
    expect(screen.getAllByText(/now playing/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Little Wing', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows the completed summary when the jam is completed', () => {
    setup({
      jam: makeJam({ state: 'completed' }),
    });
    expect(screen.getByText(/session complete/i)).toBeInTheDocument();
    expect(screen.getByText(/who was there/i)).toBeInTheDocument();
  });
});
