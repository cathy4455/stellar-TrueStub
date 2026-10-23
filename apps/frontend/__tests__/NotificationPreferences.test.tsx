import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import NotificationPreferences from '../components/NotificationPreferences';

jest.mock('../lib/apolloClient', () => ({
  __esModule: true,
  default: {},
}));

const mockUseQuery = jest.fn();
jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => [jest.fn(), { loading: false }],
}));

describe('NotificationPreferences', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it('renders sensible defaults when no preferences row exists yet', async () => {
    mockUseQuery.mockReturnValue({
      data: { notification_preferences: [] },
      loading: false,
      error: undefined,
    });

    render(<NotificationPreferences />);

    await waitFor(() => {
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /notification preferences/i })).toBeInTheDocument();

    const emailToggle = screen.getByLabelText(/email/i);
    expect(emailToggle).toBeInTheDocument();
    expect(emailToggle).toBeChecked();

    const pushToggle = screen.getByLabelText(/push/i);
    expect(pushToggle).toBeInTheDocument();
    expect(pushToggle).toBeChecked();
  });

  it('does not crash when the preferences query returns no data', async () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    });

    render(<NotificationPreferences />);

    await waitFor(() => {
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /notification preferences/i })).toBeInTheDocument();
  });
});
