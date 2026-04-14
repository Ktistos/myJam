import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateJamForm from '../pages/CreateJamForm';

const setup = (overrides = {}) => {
  const props = { onCreateJam: vi.fn(), onCancel: vi.fn(), ...overrides };
  return { ...render(<CreateJamForm {...props} />), props };
};

describe('CreateJamForm — rendering', () => {
  it('renders the heading', () => {
    setup();
    expect(screen.getByText('Create a New Jam')).toBeInTheDocument();
  });

  it('renders Jam Name input', () => {
    setup();
    expect(screen.getByLabelText(/Jam Name/i)).toBeInTheDocument();
  });

  it('renders Date and Time input', () => {
    setup();
    expect(screen.getByLabelText(/Date and Time/i)).toBeInTheDocument();
  });

  it('renders Location input', () => {
    setup();
    expect(screen.getByLabelText(/Location/i)).toBeInTheDocument();
  });

  it('defaults to Public visibility', () => {
    setup();
    expect(screen.getByDisplayValue('public')).toBeChecked();
  });

  it('renders Cancel and Create Jam buttons', () => {
    setup();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create jam/i })).toBeInTheDocument();
  });
});

describe('CreateJamForm — interactions', () => {
  it('calls onCancel when Cancel is clicked', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it('does not call onCreateJam when name is empty', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText(/Date and Time/i), { target: { value: '2026-06-01T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).not.toHaveBeenCalled();
  });

  it('does not call onCreateJam when date is empty', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText(/Jam Name/i), { target: { value: 'My Jam' } });
    fireEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).not.toHaveBeenCalled();
  });

  it('calls onCreateJam with correct args when name and date are filled', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText(/Jam Name/i),      { target: { value: 'Saturday Jam' } });
    fireEvent.change(screen.getByLabelText(/Date and Time/i), { target: { value: '2026-06-01T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).toHaveBeenCalledWith(
      'Saturday Jam',
      '2026-06-01T18:00',
      { address: '', lat: null, lng: null },
      'public'
    );
  });

  it('passes location address when filled', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText(/Jam Name/i),      { target: { value: 'My Jam' } });
    fireEvent.change(screen.getByLabelText(/Date and Time/i), { target: { value: '2026-06-01T18:00' } });
    fireEvent.change(screen.getByLabelText(/Location/i),      { target: { value: '123 Main St' } });
    fireEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).toHaveBeenCalledWith(
      'My Jam',
      '2026-06-01T18:00',
      { address: '123 Main St', lat: null, lng: null },
      'public'
    );
  });

  it('passes private visibility when selected', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText(/Jam Name/i),      { target: { value: 'Secret Jam' } });
    fireEvent.change(screen.getByLabelText(/Date and Time/i), { target: { value: '2026-06-01T18:00' } });
    fireEvent.click(screen.getByDisplayValue('private'));
    fireEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).toHaveBeenCalledWith(
      'Secret Jam',
      '2026-06-01T18:00',
      { address: '', lat: null, lng: null },
      'private'
    );
  });

  it('switching to Private and back to Public works', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText(/Jam Name/i),      { target: { value: 'Jam' } });
    fireEvent.change(screen.getByLabelText(/Date and Time/i), { target: { value: '2026-06-01T18:00' } });
    fireEvent.click(screen.getByDisplayValue('private'));
    fireEvent.click(screen.getByDisplayValue('public'));
    fireEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).toHaveBeenCalledWith('Jam', '2026-06-01T18:00', expect.any(Object), 'public');
  });
});
