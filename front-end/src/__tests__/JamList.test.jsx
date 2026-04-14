import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JamList from '../pages/JamList';

const makeJam = (overrides = {}) => ({
  id: 'jam-1',
  name: 'Sunday Blues Session',
  date: new Date('2026-05-10T18:00:00').toISOString(),
  state: 'initial',
  visibility: 'public',
  location: { address: '123 Main St', lat: 51.5, lng: -0.1 },
  ...overrides,
});

const defaultProps = {
  jams: [],
  onJamClick: vi.fn(),
  onNavCreate: vi.fn(),
  userLocation: null,
  onRequestLocation: vi.fn(),
  participantsByJamId: {},
  currentUserId: 'user-1',
  onJoinByInviteCode: vi.fn(),
};

// ── Empty states ──────────────────────────────────────────────────────────────

describe('JamList — empty discover state', () => {
  it('shows empty discover state when no public jams', () => {
    render(<JamList {...defaultProps} />);
    expect(screen.getByText(/no public jams found/i)).toBeInTheDocument();
  });

  it('shows "Be the first to create one!" when no radius set', () => {
    render(<JamList {...defaultProps} />);
    expect(screen.getByText(/be the first to create one/i)).toBeInTheDocument();
  });

  it('empty state has a Create a Jam button that calls onNavCreate', () => {
    const onNavCreate = vi.fn();
    render(<JamList {...defaultProps} onNavCreate={onNavCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ create a jam/i }));
    expect(onNavCreate).toHaveBeenCalledOnce();
  });
});

describe('JamList — empty my jams state', () => {
  it('shows empty My Jams state after switching tabs', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /my jams/i }));
    expect(screen.getByText(/haven't joined any jams/i)).toBeInTheDocument();
  });

  it('shows Browse Jams + Create buttons in empty My Jams', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /my jams/i }));
    expect(screen.getByRole('button', { name: /browse jams/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ create a jam/i })).toBeInTheDocument();
  });

  it('Browse Jams button switches back to Discover tab', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /my jams/i }));
    fireEvent.click(screen.getByRole('button', { name: /browse jams/i }));
    expect(screen.getByText(/no public jams found/i)).toBeInTheDocument();
  });
});

// ── Jam cards ─────────────────────────────────────────────────────────────────

describe('JamList — jam card rendering', () => {
  const jam  = makeJam();
  const props = {
    ...defaultProps,
    jams: [jam],
    participantsByJamId: { 'jam-1': [{ userId: 'user-2', name: 'Alice' }] },
  };

  it('renders jam name', () => {
    render(<JamList {...props} />);
    expect(screen.getByText('Sunday Blues Session')).toBeInTheDocument();
  });

  it('renders location address', () => {
    render(<JamList {...props} />);
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
  });

  it('shows participant count', () => {
    render(<JamList {...props} />);
    expect(screen.getByText(/1 participant(?!s)/)).toBeInTheDocument();
  });

  it('pluralises "participants" correctly for multiple', () => {
    const manyProps = {
      ...props,
      participantsByJamId: { 'jam-1': [{ userId: 'u1', name: 'A' }, { userId: 'u2', name: 'B' }] },
    };
    render(<JamList {...manyProps} />);
    expect(screen.getByText(/2 participants/)).toBeInTheDocument();
  });

  it('calls onJamClick with jam id when card is clicked', () => {
    const onJamClick = vi.fn();
    render(<JamList {...props} onJamClick={onJamClick} />);
    fireEvent.click(screen.getByText('Sunday Blues Session'));
    expect(onJamClick).toHaveBeenCalledWith('jam-1');
  });

  it('shows ✓ Joined badge for current user', () => {
    const joined = { ...props, participantsByJamId: { 'jam-1': [{ userId: 'user-1', name: 'Me' }] } };
    render(<JamList {...joined} />);
    expect(screen.getByText(/✓ Joined/)).toBeInTheDocument();
  });

  it('does not show Joined badge for other users', () => {
    render(<JamList {...props} />);
    expect(screen.queryByText(/✓ Joined/)).not.toBeInTheDocument();
  });

  it('shows 🔒 Private badge for private jams in My Jams tab', () => {
    const privateJam = makeJam({ id: 'jam-2', visibility: 'private' });
    // User must be a participant to see the jam in My Jams
    const propsPrivate = {
      ...defaultProps,
      jams: [privateJam],
      participantsByJamId: { 'jam-2': [{ userId: 'user-1', name: 'Me' }] },
    };
    render(<JamList {...propsPrivate} />);
    fireEvent.click(screen.getByRole('button', { name: /my jams/i }));
    expect(screen.getByText(/🔒 Private/)).toBeInTheDocument();
  });

  it('does not show Private badge for public jams', () => {
    render(<JamList {...props} />);
    expect(screen.queryByText(/🔒 Private/)).not.toBeInTheDocument();
  });

  it('does not show JamStateBadge for initial state', () => {
    render(<JamList {...props} />);
    // Initial state badge should not render (only tuning/in-progress shown)
    expect(screen.queryByText('Initial')).not.toBeInTheDocument();
  });

  it('shows in-progress state badge on card', () => {
    const liveJam = makeJam({ state: 'in-progress' });
    render(<JamList {...defaultProps} jams={[liveJam]} participantsByJamId={{}} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('shows tuning state badge on card', () => {
    const tuningJam = makeJam({ state: 'tuning' });
    render(<JamList {...defaultProps} jams={[tuningJam]} participantsByJamId={{}} />);
    expect(screen.getByText('Tuning')).toBeInTheDocument();
  });

  it('does not show completed state badge on card', () => {
    const doneJam = makeJam({ state: 'completed' });
    render(<JamList {...defaultProps} jams={[doneJam]} participantsByJamId={{}} />);
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('renders multiple cards', () => {
    const jam2 = makeJam({ id: 'jam-2', name: 'Monday Jazz Night' });
    render(<JamList {...defaultProps} jams={[jam, jam2]} participantsByJamId={{}} />);
    expect(screen.getByText('Sunday Blues Session')).toBeInTheDocument();
    expect(screen.getByText('Monday Jazz Night')).toBeInTheDocument();
  });

  it('private jams are excluded from Discover tab', () => {
    const privateJam = makeJam({ id: 'j-priv', name: 'Secret Jam', visibility: 'private' });
    render(<JamList {...defaultProps} jams={[privateJam]} participantsByJamId={{}} />);
    // Discover shows no jams (private is hidden)
    expect(screen.getByText(/no public jams found/i)).toBeInTheDocument();
  });
});

// ── My Jams tab ───────────────────────────────────────────────────────────────

describe('JamList — My Jams tab', () => {
  it('shows jam in My Jams tab when user is a participant', () => {
    const joined = {
      ...defaultProps,
      jams: [makeJam()],
      participantsByJamId: { 'jam-1': [{ userId: 'user-1', name: 'Me' }] },
    };
    render(<JamList {...joined} />);
    fireEvent.click(screen.getByRole('button', { name: /my jams.*1/i }));
    expect(screen.getAllByText('Sunday Blues Session').length).toBeGreaterThan(0);
  });

  it('tab label shows count of joined jams', () => {
    const joined = {
      ...defaultProps,
      jams: [makeJam(), makeJam({ id: 'jam-2', name: 'Jazz Night' })],
      participantsByJamId: {
        'jam-1': [{ userId: 'user-1', name: 'Me' }],
        'jam-2': [{ userId: 'user-1', name: 'Me' }],
      },
    };
    render(<JamList {...joined} />);
    expect(screen.getByRole('button', { name: /my jams.*2/i })).toBeInTheDocument();
  });

  it('private joined jams appear in My Jams', () => {
    const privateJam = makeJam({ id: 'j-priv', name: 'Secret Session', visibility: 'private' });
    const props = {
      ...defaultProps,
      jams: [privateJam],
      participantsByJamId: { 'j-priv': [{ userId: 'user-1', name: 'Me' }] },
    };
    render(<JamList {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /my jams.*1/i }));
    expect(screen.getByText('Secret Session')).toBeInTheDocument();
  });
});

// ── Invite code form ──────────────────────────────────────────────────────────

describe('JamList — invite code form', () => {
  it('form is hidden initially', () => {
    render(<JamList {...defaultProps} />);
    expect(screen.queryByPlaceholderText(/ROCK42/i)).not.toBeInTheDocument();
  });

  it('toggles invite code form on button click', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    expect(screen.getByPlaceholderText(/ROCK42/i)).toBeInTheDocument();
  });

  it('hides form on second click (toggle off)', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    expect(screen.queryByPlaceholderText(/ROCK42/i)).not.toBeInTheDocument();
  });

  it('Join button is disabled when input is empty', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    expect(screen.getByRole('button', { name: /^join$/i })).toBeDisabled();
  });

  it('Join button is disabled when input is only whitespace', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    fireEvent.change(screen.getByPlaceholderText(/ROCK42/i), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /^join$/i })).toBeDisabled();
  });

  it('Join button is enabled once code is entered', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    fireEvent.change(screen.getByPlaceholderText(/ROCK42/i), { target: { value: 'ABC' } });
    expect(screen.getByRole('button', { name: /^join$/i })).not.toBeDisabled();
  });

  it('uppercases the invite code as typed', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    fireEvent.change(screen.getByPlaceholderText(/ROCK42/i), { target: { value: 'rock42' } });
    expect(screen.getByPlaceholderText(/ROCK42/i)).toHaveValue('ROCK42');
  });

  it('removes separators and punctuation from the invite code', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'ro-ck 42!' } });
    expect(screen.getByLabelText(/invite code/i)).toHaveValue('ROCK42');
  });

  it('calls onJoinByInviteCode with entered code', () => {
    const onJoinByInviteCode = vi.fn();
    render(<JamList {...defaultProps} onJoinByInviteCode={onJoinByInviteCode} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    fireEvent.change(screen.getByPlaceholderText(/ROCK42/i), { target: { value: 'ABC123' } });
    fireEvent.click(screen.getByRole('button', { name: /^join$/i }));
    expect(onJoinByInviteCode).toHaveBeenCalledWith('ABC123');
  });

  it('clears input and closes form after submission', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    fireEvent.change(screen.getByPlaceholderText(/ROCK42/i), { target: { value: 'TEST99' } });
    fireEvent.click(screen.getByRole('button', { name: /^join$/i }));
    expect(screen.queryByPlaceholderText(/ROCK42/i)).not.toBeInTheDocument();
  });

  it('enforces maxLength of 6', () => {
    render(<JamList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /enter invite code/i }));
    expect(screen.getByPlaceholderText(/ROCK42/i)).toHaveAttribute('maxLength', '6');
  });
});

// ── Location / radius filter ──────────────────────────────────────────────────

describe('JamList — location filter', () => {
  it('shows enable location prompt when userLocation is null', () => {
    render(<JamList {...defaultProps} jams={[makeJam()]} />);
    expect(screen.getByText(/enable location for radius filter/i)).toBeInTheDocument();
  });

  it('calls onRequestLocation when the enable button is clicked', () => {
    const onRequestLocation = vi.fn();
    render(<JamList {...defaultProps} jams={[makeJam()]} onRequestLocation={onRequestLocation} />);
    fireEvent.click(screen.getByText(/enable location for radius filter/i));
    expect(onRequestLocation).toHaveBeenCalledOnce();
  });

  it('shows "Location active" when userLocation is provided', () => {
    render(<JamList {...defaultProps} jams={[makeJam()]} userLocation={{ lat: 51.5, lng: -0.1 }} />);
    expect(screen.getByText(/location active/i)).toBeInTheDocument();
  });

  it('radius select is disabled without location', () => {
    render(<JamList {...defaultProps} jams={[makeJam()]} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('radius select is enabled with location', () => {
    render(<JamList {...defaultProps} jams={[makeJam()]} userLocation={{ lat: 51.5, lng: -0.1 }} />);
    expect(screen.getByRole('combobox')).not.toBeDisabled();
  });

  it('shows distance label when userLocation is set', () => {
    render(<JamList {...defaultProps} jams={[makeJam()]} userLocation={{ lat: 51.5, lng: -0.1 }} />);
    expect(screen.getByText(/away/i)).toBeInTheDocument();
  });

  it('hides jams outside the selected radius', () => {
    // Athens is ~2500km from London; using London as user location with a 10km radius
    const athensJam = makeJam({ location: { address: 'Athens', lat: 37.97, lng: 23.72 } });
    render(<JamList
      {...defaultProps}
      jams={[athensJam]}
      userLocation={{ lat: 51.5074, lng: -0.1278 }}
    />);
    // Without radius filter the jam shows
    expect(screen.getByText('Sunday Blues Session')).toBeInTheDocument();
    // Set 10 km radius — Athens is too far
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
    expect(screen.queryByText('Sunday Blues Session')).not.toBeInTheDocument();
    expect(screen.getByText(/no jams within 10 km/i)).toBeInTheDocument();
  });

  it('shows jams within the selected radius', () => {
    // Jam is ~0.5km from user
    const nearJam = makeJam({ location: { address: 'Near', lat: 51.505, lng: -0.1 } });
    render(<JamList
      {...defaultProps}
      jams={[nearJam]}
      userLocation={{ lat: 51.5, lng: -0.1 }}
    />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
    expect(screen.getByText('Sunday Blues Session')).toBeInTheDocument();
  });

  it('jams with no location data are always shown regardless of radius', () => {
    const noLocJam = makeJam({ location: null });
    render(<JamList
      {...defaultProps}
      jams={[noLocJam]}
      userLocation={{ lat: 51.5, lng: -0.1 }}
    />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
    // No location means it passes the filter
    expect(screen.getByText('Sunday Blues Session')).toBeInTheDocument();
  });
});

// ── Header buttons ────────────────────────────────────────────────────────────

describe('JamList — top bar', () => {
  it('renders + New Jam button', () => {
    render(<JamList {...defaultProps} />);
    expect(screen.getByRole('button', { name: /\+ new jam/i })).toBeInTheDocument();
  });

  it('+ New Jam calls onNavCreate', () => {
    const onNavCreate = vi.fn();
    render(<JamList {...defaultProps} onNavCreate={onNavCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new jam/i }));
    expect(onNavCreate).toHaveBeenCalledOnce();
  });

  it('My Jams tab label has no count when no joined jams', () => {
    render(<JamList {...defaultProps} />);
    // Label should be "🎸 My Jams" without a number
    expect(screen.getByRole('button', { name: /🎸 My Jams$/ })).toBeInTheDocument();
  });
});
