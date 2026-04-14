import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import AdminPanel from '../components/AdminPanel';

const makeJam = (overrides = {}) => ({
  id: 'jam-1',
  state: 'initial',
  currentSongId: null,
  settings: { requireRoleApproval: false, requireSongApproval: false },
  admins: ['admin-1'],
  ...overrides,
});

const defaultProps = {
  jam: makeJam(),
  songs: [],
  rolesBySongId: {},
  participants: [{ userId: 'admin-1', name: 'Alice' }],
  onAdvanceState:   vi.fn(),
  onUpdateSettings: vi.fn(),
  onSetCurrentSong: vi.fn(),
  onApproveSong:    vi.fn(),
  onRejectSong:     vi.fn(),
  onApproveRole:    vi.fn(),
  onRejectRole:     vi.fn(),
  onAddAdmin:       vi.fn(),
  onRemoveAdmin:    vi.fn(),
  onDeleteJam:      vi.fn(),
};

describe('AdminPanel — rendering', () => {
  it('shows Admin Panel heading', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });

  it('is open by default', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.getByText('Jam State')).toBeInTheDocument();
  });

  it('collapses and expands on header click', () => {
    render(<AdminPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Admin Panel'));
    expect(screen.queryByText('Jam State')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Admin Panel'));
    expect(screen.getByText('Jam State')).toBeInTheDocument();
  });
});

describe('AdminPanel — state control', () => {
  it('shows current state', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.getByText('initial')).toBeInTheDocument();
  });

  it('shows → Tuning button for initial state', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.getByText(/→.*Tuning/)).toBeInTheDocument();
  });

  it('no ← back button for initial (first) state', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.queryByText(/←.*Start/)).not.toBeInTheDocument();
  });

  it('calls onAdvanceState with next state when → clicked', () => {
    const onAdvanceState = vi.fn();
    render(<AdminPanel {...defaultProps} onAdvanceState={onAdvanceState} />);
    fireEvent.click(screen.getByText(/→.*Tuning/));
    expect(onAdvanceState).toHaveBeenCalledWith('jam-1', 'tuning');
  });

  it('shows back button when not at first state', () => {
    render(<AdminPanel {...defaultProps} jam={makeJam({ state: 'tuning' })} />);
    expect(screen.getByText(/←.*Start/)).toBeInTheDocument();
  });

  it('calls onAdvanceState with previous state when ← clicked', () => {
    const onAdvanceState = vi.fn();
    render(<AdminPanel {...defaultProps} jam={makeJam({ state: 'tuning' })} onAdvanceState={onAdvanceState} />);
    fireEvent.click(screen.getByText(/←.*Start/));
    expect(onAdvanceState).toHaveBeenCalledWith('jam-1', 'initial');
  });

  it('shows "Jam is complete." when at completed state', () => {
    render(<AdminPanel {...defaultProps} jam={makeJam({ state: 'completed' })} />);
    expect(screen.getByText('Jam is complete.')).toBeInTheDocument();
  });
});

describe('AdminPanel — settings toggles', () => {
  it('renders role approval toggle', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.getByText(/require admin approval for role/i)).toBeInTheDocument();
  });

  it('renders song approval toggle', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.getByText(/require admin approval for song/i)).toBeInTheDocument();
  });

  it('calls onUpdateSettings with toggled requireRoleApproval', () => {
    const onUpdateSettings = vi.fn();
    render(<AdminPanel {...defaultProps} onUpdateSettings={onUpdateSettings} />);
    // Click the first toggle (role approval)
    const toggles = document.querySelectorAll('button[type="button"]');
    // Find the role toggle specifically by nearby label text
    const roleLabel = screen.getByText(/require admin approval for role/i);
    const roleToggle = roleLabel.closest('label').querySelector('button');
    fireEvent.click(roleToggle);
    expect(onUpdateSettings).toHaveBeenCalledWith('jam-1', { requireRoleApproval: true });
  });
});

describe('AdminPanel — pending requests', () => {
  it('shows badge count when there are pending songs', () => {
    const pending = [{ id: 's1', status: 'pending', title: 'Song A', artist: 'Artist', submittedByName: 'Bob' }];
    render(<AdminPanel {...defaultProps} songs={pending} />);
    // Badge '1' appears in both the header button and the section — at least one should exist
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('shows pending song submission entry', () => {
    const pending = [{ id: 's1', status: 'pending', title: 'Highway Star', artist: 'Deep Purple', submittedByName: 'Bob' }];
    render(<AdminPanel {...defaultProps} songs={pending} />);
    expect(screen.getByText('Song submission')).toBeInTheDocument();
    expect(screen.getByText(/Highway Star/)).toBeInTheDocument();
  });

  it('calls onApproveSong when ✓ clicked on a pending song', () => {
    const onApproveSong = vi.fn();
    const pending = [{ id: 's1', status: 'pending', title: 'Highway Star', artist: 'Deep Purple', submittedByName: 'Bob' }];
    render(<AdminPanel {...defaultProps} songs={pending} onApproveSong={onApproveSong} />);
    fireEvent.click(screen.getByText('✓'));
    expect(onApproveSong).toHaveBeenCalledWith('jam-1', 's1');
  });

  it('calls onRejectSong when ✗ clicked on a pending song', () => {
    const onRejectSong = vi.fn();
    const pending = [{ id: 's1', status: 'pending', title: 'Highway Star', artist: 'Deep Purple', submittedByName: 'Bob' }];
    render(<AdminPanel {...defaultProps} songs={pending} onRejectSong={onRejectSong} />);
    fireEvent.click(screen.getByText('✗'));
    expect(onRejectSong).toHaveBeenCalledWith('jam-1', 's1');
  });

  it('shows pending role application', () => {
    const songs = [{ id: 's1', status: 'approved', title: 'Comfortably Numb', artist: 'Pink Floyd' }];
    const roles = { 's1': [{ id: 'r1', instrument: 'Guitar', pendingUserId: 'u2', pendingUserName: 'Carol', joinedByUserId: null }] };
    render(<AdminPanel {...defaultProps} songs={songs} rolesBySongId={roles} />);
    expect(screen.getByText(/Role application/i)).toBeInTheDocument();
    expect(screen.getByText(/Guitar/)).toBeInTheDocument();
  });

  it('does not show pending section when no pending items', () => {
    render(<AdminPanel {...defaultProps} songs={[]} rolesBySongId={{}} />);
    expect(screen.queryByText(/Pending Requests/i)).not.toBeInTheDocument();
  });
});

describe('AdminPanel — admin management', () => {
  it('shows the admin user', () => {
    const participants = [{ userId: 'admin-1', name: 'Alice' }];
    render(<AdminPanel {...defaultProps} participants={participants} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('does not show remove button when only one admin', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.queryByTitle('Remove admin')).not.toBeInTheDocument();
  });

  it('shows remove button when there are multiple admins', () => {
    const jam = makeJam({ admins: ['admin-1', 'admin-2'] });
    const participants = [
      { userId: 'admin-1', name: 'Alice' },
      { userId: 'admin-2', name: 'Bob' },
    ];
    render(<AdminPanel {...defaultProps} jam={jam} participants={participants} />);
    expect(screen.getAllByTitle('Remove admin')).toHaveLength(2);
  });

  it('calls onRemoveAdmin when × is clicked', () => {
    const onRemoveAdmin = vi.fn();
    const jam = makeJam({ admins: ['admin-1', 'admin-2'] });
    const participants = [
      { userId: 'admin-1', name: 'Alice' },
      { userId: 'admin-2', name: 'Bob' },
    ];
    render(<AdminPanel {...defaultProps} jam={jam} participants={participants} onRemoveAdmin={onRemoveAdmin} />);
    fireEvent.click(screen.getAllByTitle('Remove admin')[0]);
    expect(onRemoveAdmin).toHaveBeenCalledWith('jam-1', expect.any(String));
  });

  it('shows promote picker when there are non-admin participants', () => {
    const jam = makeJam({ admins: ['admin-1'] });
    const participants = [
      { userId: 'admin-1', name: 'Alice' },
      { userId: 'user-2',  name: 'Bob' },
    ];
    render(<AdminPanel {...defaultProps} jam={jam} participants={participants} />);
    expect(screen.getByText(/Select participant to promote/i)).toBeInTheDocument();
  });

  it('Add button is disabled before selecting a participant', () => {
    const jam = makeJam({ admins: ['admin-1'] });
    const participants = [
      { userId: 'admin-1', name: 'Alice' },
      { userId: 'user-2',  name: 'Bob' },
    ];
    render(<AdminPanel {...defaultProps} jam={jam} participants={participants} />);
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
  });

  it('shows no-participants message when all are already admins', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.getByText(/no other participants to promote/i)).toBeInTheDocument();
  });
});

describe('AdminPanel — delete jam', () => {
  it('shows Delete Jam button', () => {
    render(<AdminPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /delete jam/i })).toBeInTheDocument();
  });

  it('shows confirmation prompt after clicking Delete Jam', () => {
    render(<AdminPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /delete jam/i }));
    expect(screen.getByText(/permanently delete the jam/i)).toBeInTheDocument();
  });

  it('shows Cancel and Yes, Delete buttons in confirm state', () => {
    render(<AdminPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /delete jam/i }));
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument();
  });

  it('Cancel returns to normal state', () => {
    render(<AdminPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /delete jam/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('button', { name: /delete jam/i })).toBeInTheDocument();
  });

  it('calls onDeleteJam when Yes, Delete is confirmed', () => {
    const onDeleteJam = vi.fn();
    render(<AdminPanel {...defaultProps} onDeleteJam={onDeleteJam} />);
    fireEvent.click(screen.getByRole('button', { name: /delete jam/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));
    expect(onDeleteJam).toHaveBeenCalledWith('jam-1');
  });
});

describe('AdminPanel — current song (in-progress)', () => {
  const inProgressJam = makeJam({ state: 'in-progress', currentSongId: null });
  const songs = [
    { id: 's1', status: 'approved', title: 'Purple Haze', artist: 'Hendrix' },
    { id: 's2', status: 'approved', title: 'Smoke on the Water', artist: 'Deep Purple' },
  ];

  it('shows Current Song section when state is in-progress', () => {
    render(<AdminPanel {...defaultProps} jam={inProgressJam} songs={songs} />);
    expect(screen.getByText('Current Song')).toBeInTheDocument();
  });

  it('shows "No song playing" when no currentSongId', () => {
    render(<AdminPanel {...defaultProps} jam={inProgressJam} songs={songs} />);
    expect(screen.getByText('No song playing')).toBeInTheDocument();
  });

  it('shows current song title when currentSongId is set', () => {
    const jam = makeJam({ state: 'in-progress', currentSongId: 's1' });
    render(<AdminPanel {...defaultProps} jam={jam} songs={songs} />);
    expect(screen.getByText('Purple Haze')).toBeInTheDocument();
  });

  it('prev button is disabled when no song is playing', () => {
    render(<AdminPanel {...defaultProps} jam={inProgressJam} songs={songs} />);
    const [prev] = screen.getAllByRole('button', { name: /««/ });
    expect(prev).toBeDisabled();
  });

  it('does not show Current Song section when state is initial', () => {
    render(<AdminPanel {...defaultProps} songs={songs} />);
    expect(screen.queryByText('Current Song')).not.toBeInTheDocument();
  });
});
