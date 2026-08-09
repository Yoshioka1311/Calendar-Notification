import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useSettings } from '@/contexts/SettingsContext';

export default function TabLayout() {
  const { theme } = useSettings();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.border,
          minHeight: 64,
          paddingTop: 7,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={23} />
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
        name="add"
        options={{
          title: 'Add event',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.addIcon, { backgroundColor: theme.colors.primary, transform: [{ scale: focused ? 1.05 : 1 }] }]}>
              <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor={theme.dark ? '#17182A' : '#FFFFFF'} size={25} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="upcoming"
        options={{
          title: 'Upcoming',
          tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'clock.fill', android: 'event_upcoming', web: 'event_upcoming' }} tintColor={color} size={23} />,
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

const styles = StyleSheet.create({
  addIcon: { width: 42, height: 42, marginTop: -15, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
