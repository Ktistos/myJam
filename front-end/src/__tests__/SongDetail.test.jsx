import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SongDetail from '../pages/SongDetail';

const baseProps = {
  song: { id: 'song-1', title: 'Little Wing', artist: 'Jimi Hendrix' },
  roles: [],
  onApplyForRole: vi.fn(),
  onLeaveRole: vi.fn(),
  onBack: vi.fn(),
  currentUserId: 'user-1',
  isParticipant: true,
  requiresApproval: false,
  jamState: 'initial',
};

const makeRole = (overrides = {}) => ({
  id: 'role-1',
  instrument: 'Guitar',
  ownerId: 'user-2',
  ownerName: 'Alex',
  joinedByUserId: null,
  joinedByUserName: null,
  pendingUserId: null,
  pendingUserName: null,
  ...overrides,
});

describe('SongDetail', () => {
  it('shows the claim button for an open role', () => {
    const onApplyForRole = vi.fn();
    render(<SongDetail {...baseProps} roles={[makeRole()]} onApplyForRole={onApplyForRole} />);

    fireEvent.click(screen.getByRole('button', { name: /i'll play/i }));
    expect(onApplyForRole).toHaveBeenCalledWith('role-1');
  });

  it('shows cancel application for the current pending applicant', () => {
    const onLeaveRole = vi.fn();
    render(
      <SongDetail
        {...baseProps}
        roles={[makeRole({ pendingUserId: 'user-1', pendingUserName: 'You' })]}
        requiresApproval
        onLeaveRole={onLeaveRole}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel application/i }));
    expect(onLeaveRole).toHaveBeenCalledWith('role-1');
  });

  it('shows leave role for the current player', () => {
    const onLeaveRole = vi.fn();
    render(
      <SongDetail
        {...baseProps}
        roles={[makeRole({ joinedByUserId: 'user-1', joinedByUserName: 'You' })]}
        onLeaveRole={onLeaveRole}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /leave role/i }));
    expect(onLeaveRole).toHaveBeenCalledWith('role-1');
  });

  it('renders unassigned when a role has no owner', () => {
    render(<SongDetail {...baseProps} roles={[makeRole({ ownerId: null, ownerName: null })]} />);
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
  });
});
