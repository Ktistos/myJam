import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateJamForm, { parseMapPin } from '../pages/CreateJamForm';

const setup = (overrides = {}) => {
  const props = { onCreateJam: vi.fn(), onCancel: vi.fn(), ...overrides };
  return { ...render(<CreateJamForm {...props} />), props };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseMapPin', () => {
  it('parses Google Maps @ coordinates', () => {
    expect(parseMapPin('https://www.google.com/maps/@37.983810,23.727539,17z').coords).toEqual({
      lat: 37.983810,
      lng: 23.727539,
    });
  });

  it('parses Google Maps data coordinates', () => {
    expect(parseMapPin('https://www.google.com/maps/place/Athens/data=!3d37.983810!4d23.727539').coords).toEqual({
      lat: 37.983810,
      lng: 23.727539,
    });
  });

  it('parses plain latitude and longitude pairs', () => {
    expect(parseMapPin('37.983810, 23.727539').coords).toEqual({
      lat: 37.983810,
      lng: 23.727539,
    });
  });

  it('rejects invalid map pin text', () => {
    const result = parseMapPin('https://maps.app.goo.gl/short-link-without-coordinates');
    expect(result.coords).toBeNull();
    expect(result.error).toMatch(/could not read coordinates/i);
  });
});

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
    expect(screen.getByLabelText(/Location address/i)).toBeInTheDocument();
  });

  it('renders Google Maps pin input', () => {
    setup();
    expect(screen.getByLabelText(/google maps pin/i)).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/Location address/i), { target: { value: '123 Main St' } });
    fireEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).toHaveBeenCalledWith(
      'My Jam',
      '2026-06-01T18:00',
      { address: '123 Main St', lat: null, lng: null },
      'public'
    );
  });

  it('passes parsed Google Maps pin coordinates when filled', async () => {
    const { props } = setup();
    await userEvent.type(screen.getByLabelText(/Jam Name/i), 'Pin Jam');
    fireEvent.change(screen.getByLabelText(/Date and Time/i), { target: { value: '2026-06-01T18:00' } });
    await userEvent.type(screen.getByLabelText(/Location address/i), 'Athens Studio');
    fireEvent.change(screen.getByLabelText(/google maps pin/i), {
      target: { value: 'https://www.google.com/maps/@37.983810,23.727539,17z' },
    });

    expect(screen.getByText(/pin set: 37\.983810, 23\.727539/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).toHaveBeenCalledWith(
      'Pin Jam',
      '2026-06-01T18:00',
      { address: 'Athens Studio', lat: 37.983810, lng: 23.727539 },
      'public'
    );
  });

  it('shows an error and submits null coordinates for an unreadable map pin', async () => {
    const { props } = setup();
    await userEvent.type(screen.getByLabelText(/Jam Name/i), 'Short Link Jam');
    fireEvent.change(screen.getByLabelText(/Date and Time/i), { target: { value: '2026-06-01T18:00' } });
    fireEvent.change(screen.getByLabelText(/google maps pin/i), {
      target: { value: 'https://maps.app.goo.gl/abc123' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/could not read coordinates/i);

    await userEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).toHaveBeenCalledWith(
      'Short Link Jam',
      '2026-06-01T18:00',
      { address: '', lat: null, lng: null },
      'public'
    );
  });

  it('can use the browser current location as the map pin', async () => {
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 37.990837, longitude: 23.738339 } });
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const { props } = setup();
    await userEvent.type(screen.getByLabelText(/Jam Name/i), 'Location Jam');
    fireEvent.change(screen.getByLabelText(/Date and Time/i), { target: { value: '2026-06-01T18:00' } });
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }));

    await waitFor(() => {
      expect(screen.getByText(/pin set: 37\.990837, 23\.738339/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /create jam/i }));
    expect(props.onCreateJam).toHaveBeenCalledWith(
      'Location Jam',
      '2026-06-01T18:00',
      { address: '', lat: 37.990837, lng: 23.738339 },
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
