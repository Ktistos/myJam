import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Profile from '../pages/Profile';

const baseProps = {
  initialUserName: 'Alex',
  initialInstruments: [],
  initialBio: '',
  initialRecordingLink: '',
  initialAvatarUrl: null,
  onSave: vi.fn(),
  onBack: vi.fn(),
  onResetData: vi.fn(),
  userId: 'uid-1',
};

const setup = (overrides = {}) => {
  const props = { ...baseProps, ...overrides };
  render(<Profile {...props} />);
  return props;
};

describe('Profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls onBack when the back button is clicked', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /back to jams/i }));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  it('disables save when the name is empty', async () => {
    setup();
    const nameInput = screen.getByLabelText(/display name/i);
    await userEvent.clear(nameInput);
    expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled();
  });

  it('shows the model input for non-vocal instruments and adds the instrument', async () => {
    setup();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Electric Guitar');
    expect(screen.getByPlaceholderText(/les paul/i)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/les paul/i), 'Stratocaster');
    await userEvent.selectOptions(screen.getByDisplayValue('Intermediate'), 'Advanced');
    await userEvent.click(screen.getByRole('button', { name: /\+ add instrument/i }));

    expect(screen.getByText('Electric Guitar — Stratocaster')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('does not render the model input for vocals', async () => {
    setup();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Vocals');
    expect(screen.queryByPlaceholderText(/les paul/i)).not.toBeInTheDocument();
  });

  it('prevents duplicate instruments', async () => {
    setup();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Vocals');
    await userEvent.click(screen.getByRole('button', { name: /\+ add instrument/i }));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Vocals');
    await userEvent.click(screen.getByRole('button', { name: /\+ add instrument/i }));

    expect(screen.getAllByText('Vocals', { selector: 'span' })).toHaveLength(1);
  });

  it('removes an instrument when its remove button is clicked', async () => {
    setup({
      initialInstruments: [{ type: 'Vocals', model: '', skill: 'Intermediate' }],
    });

    await userEvent.click(screen.getByRole('button', { name: '×' }));
    expect(screen.queryByText('Vocals', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('submits the edited profile state', async () => {
    const props = setup({
      initialBio: 'Old bio',
      initialRecordingLink: 'https://example.com/old',
      initialInstruments: [{ type: 'Vocals', model: '', skill: 'Intermediate' }],
    });

    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Morgan');
    await userEvent.clear(screen.getByPlaceholderText(/tell other musicians/i));
    await userEvent.type(screen.getByPlaceholderText(/tell other musicians/i), 'Keys player');
    await userEvent.clear(screen.getByPlaceholderText(/soundcloud|youtube/i));
    await userEvent.type(screen.getByPlaceholderText(/soundcloud|youtube/i), 'https://example.com/new');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Morgan',
      bio: 'Keys player',
      recordingLink: 'https://example.com/new',
      instruments: [{ type: 'Vocals', model: '', skill: 'Intermediate' }],
    }));
  });

  it('removes the avatar preview when remove is clicked', async () => {
    setup({ initialAvatarUrl: 'https://example.com/avatar.png' });
    expect(screen.getByRole('img', { name: 'avatar' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(screen.queryByRole('img', { name: 'avatar' })).not.toBeInTheDocument();
  });

  it('updates the avatar when the loaded profile avatar changes after mount', () => {
    const { rerender } = render(<Profile {...baseProps} initialAvatarUrl={null} />);
    expect(screen.queryByRole('img', { name: 'avatar' })).not.toBeInTheDocument();

    rerender(<Profile {...baseProps} initialAvatarUrl="https://example.com/avatar.png" />);

    expect(screen.getByRole('img', { name: 'avatar' })).toHaveAttribute(
      'src',
      'https://example.com/avatar.png',
    );
  });

  it('falls back to initials when the avatar image fails to load', () => {
    setup({ initialAvatarUrl: 'https://example.com/broken-avatar.png' });
    const avatar = screen.getByRole('img', { name: 'avatar' });

    fireEvent.error(avatar);

    expect(screen.queryByRole('img', { name: 'avatar' })).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('hides the reset app data action by default', () => {
    setup();
    expect(screen.queryByRole('button', { name: /reset all app data/i })).not.toBeInTheDocument();
  });

  it('resets app data after confirmation', async () => {
    const props = setup({ allowDangerousReset: true });
    vi.stubGlobal('prompt', vi.fn(() => 'RESET'));

    await userEvent.click(screen.getByRole('button', { name: /reset all app data/i }));
    expect(props.onResetData).toHaveBeenCalledOnce();
  });

  it('does not reset app data when confirmation is rejected', async () => {
    const props = setup({ allowDangerousReset: true });
    vi.stubGlobal('prompt', vi.fn(() => 'no'));

    await userEvent.click(screen.getByRole('button', { name: /reset all app data/i }));
    expect(props.onResetData).not.toHaveBeenCalled();
  });
});
