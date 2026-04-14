import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../components/Modal';

describe('Modal', () => {
  it('renders title', () => {
    render(<Modal title="Error" message="Something went wrong" onClose={() => {}} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders message', () => {
    render(<Modal title="Info" message="Operation complete" onClose={() => {}} />);
    expect(screen.getByText('Operation complete')).toBeInTheDocument();
  });

  it('renders Close button', () => {
    render(<Modal title="Test" message="msg" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn();
    render(<Modal title="Test" message="msg" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
