import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/contexts/SettingsContext';

export default function TabLayout() {
  const { theme } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.border,
          height: 60 + insets.bottom,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 7),
        },
        tabBarItemStyle: { minHeight: 48 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} tintColor={color} size={23} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="upcoming"
        options={{
          title: 'Events',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'list.bullet.rectangle', android: 'event_note', web: 'event_note' }} tintColor={color} size={23} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }} tintColor={color} size={23} />,
        }}
      />
    </Tabs>
  );
}
