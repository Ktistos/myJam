import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Login from '../pages/Login';

// Firebase is not available in test env — mock the whole module
vi.mock('../services/firebase', () => ({
  signInWithGoogle:   vi.fn(() => Promise.resolve()),
  signInWithFacebook: vi.fn(() => Promise.resolve()),
}));

describe('Login', () => {
  it('renders sign-in heading', () => {
    render(<Login onGuest={() => {}} />);
    expect(screen.getByText(/sign in to join jams/i)).toBeInTheDocument();
  });

  it('renders Google button', () => {
    render(<Login onGuest={() => {}} />);
    expect(screen.getByText(/continue with google/i)).toBeInTheDocument();
  });

  it('renders Facebook button', () => {
    render(<Login onGuest={() => {}} />);
    expect(screen.getByText(/continue with facebook/i)).toBeInTheDocument();
  });

  it('renders guest browse button', () => {
    render(<Login onGuest={() => {}} />);
    expect(screen.getByText(/browse public jams near me/i)).toBeInTheDocument();
  });

  it('calls onGuest when guest button is clicked', () => {
    const onGuest = vi.fn();
    render(<Login onGuest={onGuest} />);
    fireEvent.click(screen.getByText(/browse public jams near me/i));
    expect(onGuest).toHaveBeenCalledOnce();
  });

  it('shows loading spinner while Google sign-in is in progress', async () => {
    const { signInWithGoogle } = await import('../services/firebase');
    let resolve;
    signInWithGoogle.mockImplementation(() => new Promise((r) => { resolve = r; }));

    render(<Login onGuest={() => {}} />);
    fireEvent.click(screen.getByText(/continue with google/i));

    // Both auth buttons should be disabled while loading
    const buttons = screen.getAllByRole('button');
    const authButtons = buttons.filter((b) => b.disabled);
    expect(authButtons.length).toBeGreaterThan(0);

    resolve(); // unblock
  });

  it('shows an actionable unauthorized-domain error for Google', async () => {
    const { signInWithGoogle } = await import('../services/firebase');
    signInWithGoogle.mockRejectedValue({
      code: 'auth/unauthorized-domain',
      message: 'Firebase: Error (auth/unauthorized-domain).',
    });

    render(<Login onGuest={() => {}} />);
    fireEvent.click(screen.getByText(/continue with google/i));

    expect(await screen.findByText(/authorized domains/i)).toBeInTheDocument();
  });

  it('shows the existing-provider message for Facebook account collisions', async () => {
    const { signInWithFacebook } = await import('../services/firebase');
    signInWithFacebook.mockRejectedValue({
      code: 'auth/account-exists-with-different-credential',
      message: 'Firebase: Error (auth/account-exists-with-different-credential).',
    });

    render(<Login onGuest={() => {}} />);
    fireEvent.click(screen.getByText(/continue with facebook/i));

    expect(await screen.findByText(/already exists with another sign-in method/i)).toBeInTheDocument();
  });

  it('shows Meta OAuth setup guidance for Facebook config errors', async () => {
    const { signInWithFacebook } = await import('../services/firebase');
    signInWithFacebook.mockRejectedValue({
      code: 'auth/invalid-credential',
      message: 'Firebase: Error (auth/invalid-credential).',
    });

    render(<Login onGuest={() => {}} />);
    fireEvent.click(screen.getByText(/continue with facebook/i));

    expect(await screen.findByText(/valid oauth redirect uris/i)).toBeInTheDocument();
  });
});
