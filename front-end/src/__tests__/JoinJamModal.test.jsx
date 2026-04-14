import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JoinJamModal from '../components/JoinJamModal';

const setup = (overrides = {}) => {
  const props = {
    jam: { id: 'jam-1', name: 'Thursday Blues Night' },
    userInstruments: [
      { type: 'Electric Guitar', model: 'Stratocaster', skill: 'Advanced' },
      { type: 'Vocals', model: '', skill: 'Intermediate' },
    ],
    existingHardware: [],
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<JoinJamModal {...props} />);
  return props;
};

describe('JoinJamModal', () => {
  it('renders non-vocal profile instruments as selectable hardware options', () => {
    setup();
    expect(screen.getByText('Electric Guitar — Stratocaster')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^vocals$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/vocals are always available as a role/i)).toBeInTheDocument();
  });

  it('toggles a profile instrument and updates the confirm label', async () => {
    setup();
    await userEvent.click(screen.getByLabelText(/electric guitar/i));
    expect(screen.getByRole('button', { name: /join & add 1 instrument/i })).toBeInTheDocument();
  });

  it('adds an instrument through the dropdown picker', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText(/additional hardware instrument/i), 'Drums');
    await userEvent.click(screen.getByRole('button', { name: /add instrument/i }));
    expect(screen.getByRole('button', { name: /join & add 1 instrument/i })).toBeInTheDocument();
  });

  it('does not add duplicate dropdown instruments', async () => {
    setup();
    const select = screen.getByLabelText(/additional hardware instrument/i);
    await userEvent.selectOptions(select, 'Drums');
    await userEvent.click(screen.getByRole('button', { name: /add instrument/i }));
    await userEvent.selectOptions(select, 'Drums');
    await userEvent.click(screen.getByRole('button', { name: /add instrument/i }));
    expect(screen.getByRole('button', { name: /join & add 1 instrument/i })).toBeInTheDocument();
  });

  it('removes a selected instrument from the summary chips', async () => {
    setup();
    await userEvent.click(screen.getByLabelText(/electric guitar/i));
    expect(screen.getByText('You are bringing')).toBeInTheDocument();

    const removeButtons = screen.getAllByRole('button', { name: '×' });
    await userEvent.click(removeButtons[0]);
    expect(screen.queryByText('You are bringing')).not.toBeInTheDocument();
  });

  it('calls onConfirm with the selected instruments', async () => {
    const props = setup();
    await userEvent.click(screen.getByLabelText(/electric guitar/i));
    await userEvent.selectOptions(screen.getByLabelText(/additional hardware instrument/i), 'Keyboard');
    await userEvent.click(screen.getByRole('button', { name: /add instrument/i }));
    await userEvent.click(screen.getByRole('button', { name: /join & add 2 instruments/i }));

    expect(props.onConfirm).toHaveBeenCalledWith(['Electric Guitar — Stratocaster', 'Keyboard']);
  });

  it('calls onConfirm with an empty array when joining without instruments', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /join without adding instruments/i }));
    expect(props.onConfirm).toHaveBeenCalledWith([]);
  });

  it('calls onCancel when cancel is clicked', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it('shows the empty-profile message when the user has no non-vocal profile instruments', () => {
    setup({ userInstruments: [] });
    expect(screen.getByText(/no non-vocal instruments in your profile yet/i)).toBeInTheDocument();
  });

  it('does not offer Vocals as hardware when it is the only profile instrument', () => {
    setup({ userInstruments: [{ type: 'Vocals', model: '', skill: 'Intermediate' }] });
    expect(screen.getByText(/no non-vocal instruments in your profile yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^vocals$/i)).not.toBeInTheDocument();
  });
});
