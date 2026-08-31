import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/contexts/SettingsContext';

type SymbolName = SymbolViewProps['name'];

const MAJOR_TABS = [
  { key: 'index', href: '/', label: 'Calendar', icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' } },
  { key: 'nutrition', href: '/nutrition', label: 'Nutrition', icon: { ios: 'chart.pie.fill', android: 'pie_chart', web: 'pie_chart' } },
  { key: 'finance', href: '/finance', label: 'Finance', icon: { ios: 'creditcard.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' } },
  { key: 'vault', href: '/vault', label: 'Vault', icon: { ios: 'lock.shield.fill', android: 'lock', web: 'lock' } },
  { key: 'settings', href: '/settings', label: 'Settings', icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' } },
] as const satisfies readonly { key: string; href: string; label: string; icon: SymbolName }[];

type MajorTab = (typeof MAJOR_TABS)[number]['key'];
type MajorTabDefinition = (typeof MAJOR_TABS)[number];

function tabFromPath(pathname: string): MajorTab {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (firstSegment === 'nutrition' || firstSegment === 'finance' || firstSegment === 'vault' || firstSegment === 'settings') {
    return firstSegment;
  }
  return 'index';
}

export default function TabLayout() {
  const { theme } = useSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const currentTab = tabFromPath(pathname);
  const [curtainVisible, setCurtainVisible] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [curtainTarget, setCurtainTarget] = useState<MajorTabDefinition>(MAJOR_TABS[0]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const transitionStartedAt = useRef(0);
  const curtainFade = useMemo(() => new Animated.Value(0), []);
  const identityOpacity = useMemo(() => new Animated.Value(0), []);
  const identityScale = useMemo(() => new Animated.Value(0.94), []);
  const curtainLayers = useMemo(() => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)], []);
  const tabIndex = useMemo(
    () => Object.fromEntries(MAJOR_TABS.map((tab, index) => [tab.key, index])) as Record<MajorTab, number>,
    [],
  );
  const curtainLayerColors = useMemo(
    () => [theme.colors.primarySoft, theme.colors.primary, '#17182B'],
    [theme.colors.primary, theme.colors.primarySoft],
  );

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);

  const finishTransition = useCallback(() => {
    if (__DEV__ && transitionStartedAt.current) {
      // Timings are development-only and never include user data.
      // eslint-disable-next-line no-console
      console.info(`[perf] page-curtain complete ${Math.round(Date.now() - transitionStartedAt.current)}ms`);
    }
    setCurtainVisible(false);
    setTransitioning(false);
    transitionStartedAt.current = 0;
  }, []);

  const runCurtainNavigation = useCallback((target: MajorTab) => {
    if (transitioning || target === currentTab) return;
    const targetTab = MAJOR_TABS.find((tab) => tab.key === target);
    if (!targetTab) return;

    const targetHref = targetTab.href as unknown as Parameters<typeof router.navigate>[0];
    const viewportWidth = Math.max(width, 360);
    const direction = tabIndex[target] > tabIndex[currentTab] ? 1 : -1;

    transitionStartedAt.current = Date.now();
    setTransitioning(true);
    setCurtainTarget(targetTab);
    setCurtainVisible(true);
    identityOpacity.setValue(0);
    identityScale.setValue(0.94);

    const revealDestination = () => {
      router.navigate(targetHref);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (reducedMotion) {
              Animated.parallel([
                Animated.timing(curtainFade, { toValue: 0, duration: 190, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
                Animated.timing(identityOpacity, { toValue: 0, duration: 110, useNativeDriver: true }),
              ]).start(finishTransition);
              return;
            }

            Animated.parallel([
              Animated.stagger(
                35,
                [...curtainLayers].reverse().map((layer) => Animated.timing(layer, {
                  toValue: -viewportWidth * direction,
                  duration: 360,
                  easing: Easing.inOut(Easing.cubic),
                  useNativeDriver: true,
                })),
              ),
              Animated.timing(identityOpacity, { toValue: 0, duration: 145, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            ]).start(finishTransition);
          }, reducedMotion ? 120 : 150);
        });
      });
    };

    requestAnimationFrame(() => {
      if (reducedMotion) {
        curtainFade.setValue(0);
        Animated.parallel([
          Animated.timing(curtainFade, { toValue: 1, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(70),
            Animated.timing(identityOpacity, { toValue: 1, duration: 90, useNativeDriver: true }),
          ]),
        ]).start(revealDestination);
        return;
      }

      curtainLayers.forEach((layer) => layer.setValue(viewportWidth * direction));
      Animated.parallel([
        Animated.stagger(
          35,
          curtainLayers.map((layer) => Animated.timing(layer, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })),
        ),
        Animated.sequence([
          Animated.delay(245),
          Animated.parallel([
            Animated.timing(identityOpacity, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.spring(identityScale, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
          ]),
        ]),
      ]).start(revealDestination);
    });
  }, [currentTab, curtainFade, curtainLayers, finishTransition, identityOpacity, identityScale, reducedMotion, router, tabIndex, transitioning, width]);

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
        {MAJOR_TABS.map((tab) => (
          <Tabs.Screen
            key={tab.key}
            name={tab.key}
            options={{
              title: tab.label,
              tabBarIcon: ({ color }) => <SymbolView name={tab.icon} tintColor={color} size={23} />,
            }}
            listeners={makeTabListeners(tab.key)}
          />
        ))}
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="upcoming" options={{ href: null }} />
        <Tabs.Screen name="add" options={{ href: null }} />
      </Tabs>

      <Modal
        animationType="none"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        visible={curtainVisible}
        onRequestClose={() => undefined}>
        <View accessibilityViewIsModal accessibilityLabel={`Opening ${curtainTarget.label}`} style={styles.curtainRoot}>
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
          <Animated.View style={[styles.curtainIdentity, { opacity: identityOpacity, transform: [{ scale: identityScale }] }]}>
            <View style={styles.identityIcon}>
              <SymbolView name={curtainTarget.icon} tintColor="#E9E5FF" size={42} />
            </View>
            <Text style={styles.identityLabel}>{curtainTarget.label}</Text>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  curtainRoot: { flex: 1, backgroundColor: 'transparent' },
  curtainLayer: { ...StyleSheet.absoluteFill },
  curtainIdentity: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 14 },
  identityIcon: {
    width: 82,
    height: 82,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(233, 229, 255, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(233, 229, 255, 0.28)',
  },
  identityLabel: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5 },
});
