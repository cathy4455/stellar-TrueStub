import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import NotificationPreferences, {
  GET_NOTIFICATION_PREFERENCES,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../NotificationPreferences';

describe('NotificationPreferences', () => {
  it('renders sensible defaults when no preferences row exists yet', async () => {
    const mocks = [
      {
        request: {
          query: GET_NOTIFICATION_PREFERENCES,
          variables: { userId: 'user-1' },
        },
        result: {
          data: {
            notification_preferences: [],
          },
        },
      },
    ];

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <NotificationPreferences userId="user-1" />
      </MockedProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    expect(
      screen.getByRole('checkbox', {
        name: /email notifications/i,
      })
    ).toHaveProperty('checked', DEFAULT_NOTIFICATION_PREFERENCES.emailNotifications);

    expect(
      screen.getByRole('checkbox', {
        name: /push notifications/i,
      })
    ).toHaveProperty('checked', DEFAULT_NOTIFICATION_PREFERENCES.pushNotifications);
  });
});
