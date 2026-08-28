import { useCallback, useEffect, useMemo, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { AccessibilityInfo, Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/contexts/SettingsContext';

const MAJOR_TABS = [
  { key: 'index', href: '/' },
  { key: 'nutrition', href: '/nutrition' },
  { key: 'finance', href: '/finance' },
  { key: 'vault', href: '/vault' },
  { key: 'settings', href: '/settings' },
] as const;

type MajorTab = (typeof MAJOR_TABS)[number]['key'];

function tabFromPath(pathname: string): MajorTab {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (firstSegment === 'nutrition' || firstSegment === 'finance' || firstSegment === 'vault' || firstSegment === 'settings') return firstSegment;
  return 'index';
}

export default function TabLayout() {
  const { theme } = useSettings();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const currentTab = tabFromPath(pathname);
  const [curtainVisible, setCurtainVisible] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const curtainFade = useMemo(() => new Animated.Value(0), []);
  const curtainLayers = useMemo(() => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)], []);
  const tabIndex = useMemo(() => Object.fromEntries(MAJOR_TABS.map((tab, index) => [tab.key, index])) as Record<MajorTab, number>, []);
  const curtainLayerColors = useMemo(() => [
    theme.colors.primarySoft,
    theme.colors.primary,
    theme.colors.background,
  ], [theme.colors.background, theme.colors.primary, theme.colors.primarySoft]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);

  const runCurtainNavigation = useCallback((target: MajorTab) => {
    if (transitioning) return;
    if (target === currentTab) return;
    const targetTab = MAJOR_TABS.find((tab) => tab.key === target);
    if (!targetTab) return;
    const targetHref = targetTab.href as unknown as Parameters<typeof router.navigate>[0];

    setTransitioning(true);
    setCurtainVisible(true);
    const width = Dimensions.get('window').width || 420;
    const direction = tabIndex[target] > tabIndex[currentTab] ? 1 : -1;

    if (reducedMotion) {
      curtainFade.setValue(0);
      Animated.timing(curtainFade, {
        toValue: 1,
        duration: 110,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        router.navigate(targetHref);
        Animated.timing(curtainFade, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          setCurtainVisible(false);
          setTransitioning(false);
        });
      });
      return;
    }

    curtainLayers.forEach((layer) => layer.setValue(width * direction));
    Animated.stagger(55, curtainLayers.map((layer) => Animated.timing(layer, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }))).start(() => {
      router.navigate(targetHref);
      requestAnimationFrame(() => {
        Animated.stagger(55, curtainLayers.map((layer) => Animated.timing(layer, {
          toValue: -width * direction,
          duration: 330,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }))).start(() => {
          setCurtainVisible(false);
          setTransitioning(false);
        });
      });
    });
  }, [currentTab, curtainFade, curtainLayers, reducedMotion, router, tabIndex, transitioning]);

  const makeTabListeners = useCallback((target: MajorTab) => ({
    tabPress: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      runCurtainNavigation(target);
    },
  }), [runCurtainNavigation]);

  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.background }]}>
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
          listeners={makeTabListeners('index')}
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
            href: null,
          }}
        />
        <Tabs.Screen
          name="nutrition"
          options={{
            title: 'Nutrition',
            tabBarIcon: ({ color }) => (
              <SymbolView name={{ ios: 'chart.pie.fill', android: 'pie_chart', web: 'pie_chart' }} tintColor={color} size={23} />
            ),
          }}
          listeners={makeTabListeners('nutrition')}
        />
        <Tabs.Screen
          name="finance"
          options={{
            title: 'Finance',
            tabBarIcon: ({ color }) => (
              <SymbolView name={{ ios: 'creditcard.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }} tintColor={color} size={23} />
            ),
          }}
          listeners={makeTabListeners('finance')}
        />
        <Tabs.Screen
          name="vault"
          options={{
            title: 'Vault',
            tabBarIcon: ({ color }) => (
              <SymbolView name={{ ios: 'lock.shield.fill', android: 'lock', web: 'lock' }} tintColor={color} size={23} />
            ),
          }}
          listeners={makeTabListeners('vault')}
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
          listeners={makeTabListeners('settings')}
        />
      </Tabs>
      {curtainVisible ? (
        <View pointerEvents="auto" style={StyleSheet.absoluteFill}>
          {curtainLayerColors.map((color, index) => (
            <Animated.View
              key={`${color}-${index}`}
              style={[
                styles.curtainLayer,
                {
                  backgroundColor: color,
                  opacity: reducedMotion ? curtainFade : 1,
                  transform: reducedMotion ? [] : [{ translateX: curtainLayers[index] }],
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  curtainLayer: {
    ...StyleSheet.absoluteFill,
  },
});
