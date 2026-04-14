import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
