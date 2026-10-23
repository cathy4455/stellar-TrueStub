import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import NotificationPreferences, {
  GET_NOTIFICATION_PREFERENCES,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from './NotificationPreferences';

describe('NotificationPreferences', () => {
  it('degrades gracefully with sane defaults when no preferences row exists yet', async () => {
    const mocks = [
      {
        request: { query: GET_NOTIFICATION_PREFERENCES },
        result: { data: { notification_preferences: [] } },
      },
    ];

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <NotificationPreferences />
      </MockedProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole('checkbox', { name: /email/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /push/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /sms/i })).not.toBeChecked();

    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      email: true,
      push: true,
      sms: false,
    });
  });
});
