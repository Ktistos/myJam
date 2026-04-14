import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import JamStateBadge, { JAM_STATE_ORDER } from '../components/JamStateBadge';

describe('JamStateBadge', () => {
  it('renders "Initial" for state=initial', () => {
    render(<JamStateBadge state="initial" />);
    expect(screen.getByText('Initial')).toBeInTheDocument();
  });

  it('renders "Tuning" for state=tuning', () => {
    render(<JamStateBadge state="tuning" />);
    expect(screen.getByText('Tuning')).toBeInTheDocument();
  });

  it('renders "In Progress" for state=in-progress', () => {
    render(<JamStateBadge state="in-progress" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders "Completed" for state=completed', () => {
    render(<JamStateBadge state="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('falls back to Initial label for unknown state', () => {
    render(<JamStateBadge state="unknown-state" />);
    expect(screen.getByText('Initial')).toBeInTheDocument();
  });

  it('falls back to Initial label when state is undefined', () => {
    render(<JamStateBadge />);
    expect(screen.getByText('Initial')).toBeInTheDocument();
  });
});

describe('JAM_STATE_ORDER', () => {
  it('exports the state progression array', () => {
    expect(JAM_STATE_ORDER).toEqual(['initial', 'tuning', 'in-progress', 'completed']);
  });

  it('has exactly 4 states', () => {
    expect(JAM_STATE_ORDER).toHaveLength(4);
  });

  it('initial comes before tuning', () => {
    expect(JAM_STATE_ORDER.indexOf('initial')).toBeLessThan(JAM_STATE_ORDER.indexOf('tuning'));
  });

  it('completed is last', () => {
    expect(JAM_STATE_ORDER[JAM_STATE_ORDER.length - 1]).toBe('completed');
  });
});
