import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DisputeArbitrationCard from './DisputeArbitrationCard';

describe('DisputeArbitrationCard', () => {
  it('renders the dispute status and arbitration state', () => {
    render(
      <DisputeArbitrationCard
        dispute={{
          id: 'dispute-1',
          status: 'UNDER_REVIEW',
          reason: 'Work not delivered',
          raisedBy: 'client-1',
          createdAt: '2024-01-01T00:00:00.000Z',
        }}
      />
    );

    expect(screen.getByText(/under review/i)).toBeInTheDocument();
    expect(screen.getByText(/work not delivered/i)).toBeInTheDocument();
  });

  it('renders the resolved arbitration outcome', () => {
    render(
      <DisputeArbitrationCard
        dispute={{
          id: 'dispute-2',
          status: 'RESOLVED',
          reason: 'Payment dispute',
          raisedBy: 'freelancer-1',
          createdAt: '2024-02-01T00:00:00.000Z',
          resolution: 'Refund issued to client',
        }}
      />
    );

    expect(screen.getByText(/resolved/i)).toBeInTheDocument();
    expect(screen.getByText(/refund issued to client/i)).toBeInTheDocument();
  });

  it('invokes the arbitration action handler when triggered', () => {
    const onArbitrate = vi.fn();
    render(
      <DisputeArbitrationCard
        dispute={{
          id: 'dispute-3',
          status: 'OPEN',
          reason: 'Scope disagreement',
          raisedBy: 'client-2',
          createdAt: '2024-03-01T00:00:00.000Z',
        }}
        onArbitrate={onArbitrate}
      />
    );

    expect(screen.getByText(/open/i)).toBeInTheDocument();
  });
});
