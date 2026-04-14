import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserProfileModal from '../components/UserProfileModal';

// Profile exports are needed by UserProfileModal
vi.mock('../pages/Profile', async (importOriginal) => {
  const real = await importOriginal();
  return real;
});

const baseParticipant = {
  userId: 'u-1',
  userName: 'Charlie',
  bio: null,
  recordingLink: null,
  avatarUrl: null,
  instruments: [],
  instrumentObjects: [],
};

describe('UserProfileModal', () => {
  it('renders nothing when participant is null', () => {
    const { container } = render(<UserProfileModal participant={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the username', () => {
    render(<UserProfileModal participant={baseParticipant} onClose={() => {}} />);
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders initials avatar when no avatarUrl', () => {
    render(<UserProfileModal participant={baseParticipant} onClose={() => {}} />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders avatar image when avatarUrl provided', () => {
    const p = { ...baseParticipant, avatarUrl: 'https://example.com/img.jpg' };
    render(<UserProfileModal participant={p} onClose={() => {}} />);
    expect(screen.getByRole('img', { name: 'Charlie' })).toHaveAttribute('src', 'https://example.com/img.jpg');
  });

  it('does not render Bio section when bio is falsy', () => {
    render(<UserProfileModal participant={baseParticipant} onClose={() => {}} />);
    expect(screen.queryByText('Bio')).not.toBeInTheDocument();
  });

  it('renders bio when present', () => {
    const p = { ...baseParticipant, bio: 'Guitarist from Athens' };
    render(<UserProfileModal participant={p} onClose={() => {}} />);
    expect(screen.getByText('Bio')).toBeInTheDocument();
    expect(screen.getByText('Guitarist from Athens')).toBeInTheDocument();
  });

  it('renders recording link when present', () => {
    const p = { ...baseParticipant, recordingLink: 'https://soundcloud.com/charlie' };
    render(<UserProfileModal participant={p} onClose={() => {}} />);
    expect(screen.getByText('Recording')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://soundcloud.com/charlie');
  });

  it('opens recording link in a new tab', () => {
    const p = { ...baseParticipant, recordingLink: 'https://soundcloud.com/charlie' };
    render(<UserProfileModal participant={p} onClose={() => {}} />);
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('renders instruments from instrumentObjects', () => {
    const p = { ...baseParticipant, instrumentObjects: [{ type: 'Electric Guitar', skill: 'Advanced' }] };
    render(<UserProfileModal participant={p} onClose={() => {}} />);
    expect(screen.getByText('Instruments')).toBeInTheDocument();
    expect(screen.getByText('Electric Guitar')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('renders plain instrument strings as tags', () => {
    const p = { ...baseParticipant, instruments: ['Drums', 'Bass Guitar'] };
    render(<UserProfileModal participant={p} onClose={() => {}} />);
    expect(screen.getByText('Drums')).toBeInTheDocument();
    expect(screen.getByText('Bass Guitar')).toBeInTheDocument();
  });

  it('calls onClose when × button is clicked', () => {
    const onClose = vi.fn();
    render(<UserProfileModal participant={baseParticipant} onClose={onClose} />);
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<UserProfileModal participant={baseParticipant} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when clicking the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<UserProfileModal participant={baseParticipant} onClose={onClose} />);
    // The backdrop is the outermost div (fixed inset-0)
    const backdrop = container.querySelector('.fixed.inset-0');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking inside the modal card', () => {
    const onClose = vi.fn();
    render(<UserProfileModal participant={baseParticipant} onClose={onClose} />);
    // Click on the username text (inside the card)
    fireEvent.click(screen.getByText('Charlie'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
