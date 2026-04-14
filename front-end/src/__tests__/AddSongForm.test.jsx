import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddSongForm from '../components/AddSongForm';

const setup = (overrides = {}) => {
  const props = {
    onAddSong: vi.fn(),
    onOpenImportModal: vi.fn(),
    ...overrides,
  };
  render(<AddSongForm {...props} />);
  return props;
};

describe('AddSongForm', () => {
  it('starts collapsed', () => {
    setup();
    expect(screen.getByRole('button', { name: /add a song to the setlist/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/song title/i)).not.toBeInTheDocument();
  });

  it('opens the form when the add button is clicked', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /add a song to the setlist/i }));
    expect(screen.getByLabelText(/song title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/original artist/i)).toBeInTheDocument();
  });

  it('closes the form when cancel is clicked', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /add a song to the setlist/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByLabelText(/song title/i)).not.toBeInTheDocument();
  });

  it('calls onOpenImportModal from the collapsed import button', async () => {
    const props = setup();
    await userEvent.click(screen.getByTitle(/import via link/i));
    expect(props.onOpenImportModal).toHaveBeenCalledOnce();
  });

  it('calls onOpenImportModal from the expanded import button', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /add a song to the setlist/i }));
    await userEvent.click(screen.getByRole('button', { name: /import via link/i }));
    expect(props.onOpenImportModal).toHaveBeenCalledOnce();
  });

  it('disables submit until title and artist are filled', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /add a song to the setlist/i }));

    const submit = screen.getByRole('button', { name: /\+ add song/i });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/song title/i), 'Little Wing');
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/original artist/i), 'Jimi Hendrix');
    expect(submit).toBeEnabled();
  });

  it('submits entered values and resets the form', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /add a song to the setlist/i }));

    await userEvent.type(screen.getByLabelText(/song title/i), 'Little Wing');
    await userEvent.type(screen.getByLabelText(/original artist/i), 'Jimi Hendrix');
    await userEvent.click(screen.getByRole('button', { name: /\+ add song/i }));

    expect(props.onAddSong).toHaveBeenCalledWith('Little Wing', 'Jimi Hendrix');
    expect(screen.queryByLabelText(/song title/i)).not.toBeInTheDocument();
  });
});
