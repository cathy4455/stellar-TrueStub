import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_NOTIFICATION_PREFERENCES, UPDATE_NOTIFICATION_PREFERENCES } from '../graphql/notifications';
import { useAuth } from '../contexts/AuthContext';

interface NotificationPreference {
  id?: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  weeklyDigest: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreference = {
  emailNotifications: true,
  pushNotifications: true,
  marketingEmails: false,
  weeklyDigest: true,
};

const PREFERENCE_FIELDS: Array<{
  key: keyof Omit<NotificationPreference, 'id'>;
  label: string;
  description: string;
}> = [
  {
    key: 'emailNotifications',
    label: 'Email notifications',
    description: 'Receive important account and activity updates by email.',
  },
  {
    key: 'pushNotifications',
    label: 'Push notifications',
    description: 'Get real-time alerts on your devices.',
  },
  {
    key: 'marketingEmails',
    label: 'Marketing emails',
    description: 'Hear about new features, offers, and promotions.',
  },
  {
    key: 'weeklyDigest',
    label: 'Weekly digest',
    description: 'A weekly summary of activity delivered to your inbox.',
  },
];

export default function NotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreference>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);

  const { data, loading, error } = useQuery(GET_NOTIFICATION_PREFERENCES, {
    variables: { userId: user?.id },
    skip: !user?.id,
    fetchPolicy: 'cache-and-network',
  });

  const [updatePreferences, { loading: saving }] = useMutation(UPDATE_NOTIFICATION_PREFERENCES);

  useEffect(() => {
    // A user may not have a stored preferences row yet (new user, or the
    // migration/table rollout lagging). In that case fall back to sane
    // defaults instead of erroring.
    const stored = data?.notification_preferences?.[0];
    if (stored) {
      setPreferences({
        id: stored.id,
        emailNotifications: stored.emailNotifications ?? DEFAULT_PREFERENCES.emailNotifications,
        pushNotifications: stored.pushNotifications ?? DEFAULT_PREFERENCES.pushNotifications,
        marketingEmails: stored.marketingEmails ?? DEFAULT_PREFERENCES.marketingEmails,
        weeklyDigest: stored.weeklyDigest ?? DEFAULT_PREFERENCES.weeklyDigest,
      });
    } else {
      setPreferences(DEFAULT_PREFERENCES);
    }
  }, [data]);

  const handleToggle = (key: keyof Omit<NotificationPreference, 'id'>) => {
    setSaved(false);
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    try {
      await updatePreferences({
        variables: {
          userId: user.id,
          preferences: {
            emailNotifications: preferences.emailNotifications,
            pushNotifications: preferences.pushNotifications,
            marketingEmails: preferences.marketingEmails,
            weeklyDigest: preferences.weeklyDigest,
          },
        },
      });
      setSaved(true);
    } catch {
      // Surface nothing destructive; the user can retry.
    }
  };

  if (loading && !data) {
    return <div className="notification-preferences">Loading preferences…</div>;
  }

  return (
    <div className="notification-preferences">
      <h2>Notification Preferences</h2>
      {error && (
        <p className="notification-preferences__notice">
          We couldn&apos;t load your saved preferences, so we&apos;re showing defaults.
        </p>
      )}
      <ul className="notification-preferences__list">
        {PREFERENCE_FIELDS.map((field) => (
          <li key={field.key} className="notification-preferences__item">
            <label>
              <input
                type="checkbox"
                checked={preferences[field.key]}
                onChange={() => handleToggle(field.key)}
              />
              <span className="notification-preferences__label">{field.label}</span>
            </label>
            <p className="notification-preferences__description">{field.description}</p>
          </li>
        ))}
      </ul>
      <button type="button" onClick={handleSave} disabled={saving || !user?.id}>
        {saving ? 'Saving…' : 'Save preferences'}
      </button>
      {saved && <span className="notification-preferences__saved">Saved</span>}
    </div>
  );
}
