import { router, useLocalSearchParams } from 'expo-router';

import { EventForm } from '@/components/Event/EventForm';
import { Screen } from '@/components/UI/Screen';

export default function AddEventScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const initialDate = Array.isArray(params.date) ? params.date[0] : params.date;
  return (
    <Screen title="New event" subtitle="Add it now, remember it later">
      <EventForm key={initialDate ?? 'today'} initialDate={initialDate} onSaved={(event) => router.replace({ pathname: '/event/[id]', params: { id: event.id } })} />
    </Screen>
  );
}
