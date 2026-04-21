import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../components/Header';

const baseProps = {
  userName: 'Alice',
  avatarUrl: null,
  onNavProfile: vi.fn(),
  onNavHome: vi.fn(),
  onLogout: vi.fn(),
  isGuest: false,
};

describe('Header', () => {
  it('renders the myJam brand', () => {
    render(<Header {...baseProps} />);
    expect(screen.getByText(/myJam/i)).toBeInTheDocument();
  });

  it('renders the username', () => {
    render(<Header {...baseProps} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows initials avatar when no avatarUrl', () => {
    render(<Header {...baseProps} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows ? when userName is empty', () => {
    render(<Header {...baseProps} userName="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders an img when avatarUrl is provided', () => {
    render(<Header {...baseProps} avatarUrl="https://example.com/pic.jpg" />);
    const img = screen.getByRole('img', { name: 'avatar' });
    expect(img).toHaveAttribute('src', 'https://example.com/pic.jpg');
  });

  it('falls back to initials when avatarUrl fails to load', () => {
    render(<Header {...baseProps} avatarUrl="https://example.com/broken.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'avatar' }));
    expect(screen.queryByRole('img', { name: 'avatar' })).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('calls onNavHome when brand is clicked', () => {
    const onNavHome = vi.fn();
    render(<Header {...baseProps} onNavHome={onNavHome} />);
    fireEvent.click(screen.getByText(/myJam/i));
    expect(onNavHome).toHaveBeenCalledOnce();
  });

  it('calls onNavProfile when user button is clicked', () => {
    const onNavProfile = vi.fn();
    render(<Header {...baseProps} onNavProfile={onNavProfile} />);
    fireEvent.click(screen.getByText('Alice'));
    expect(onNavProfile).toHaveBeenCalledOnce();
  });

  it('renders Sign out button when onLogout is provided', () => {
    render(<Header {...baseProps} />);
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('calls onLogout when Sign out is clicked', () => {
    const onLogout = vi.fn();
    render(<Header {...baseProps} onLogout={onLogout} />);
    fireEvent.click(screen.getByText('Sign out'));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('does not render Sign out when onLogout is null', () => {
    render(<Header {...baseProps} onLogout={null} />);
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });
});

describe('Header — guest mode', () => {
  const guestProps = { ...baseProps, isGuest: true };

  it('shows Sign in button instead of profile avatar', () => {
    render(<Header {...guestProps} />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('does not show the profile avatar in guest mode', () => {
    render(<Header {...guestProps} />);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('calls onNavProfile when Sign in is clicked', () => {
    const onNavProfile = vi.fn();
    render(<Header {...guestProps} onNavProfile={onNavProfile} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(onNavProfile).toHaveBeenCalledOnce();
  });

  it('shows Exit instead of Sign out in guest mode', () => {
    render(<Header {...guestProps} />);
    expect(screen.getByText('Exit')).toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });
});
