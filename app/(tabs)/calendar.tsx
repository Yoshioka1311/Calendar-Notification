import { Redirect } from 'expo-router';

/** Backwards-compatible route for links created before Calendar became the main tab. */
export default function LegacyCalendarRoute() {
  return <Redirect href="/(tabs)" />;
}
