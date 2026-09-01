import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlertWatch } from '../../src/useAlertWatch';
import { color, dropShadow, font, radius } from '../../src/theme';

/**
 * The floating tab bar from the prototype, built on `expo-router/ui`.
 *
 * SDK 57's router dropped @react-navigation/bottom-tabs, so the older
 * `<Tabs tabBar={...}>` pattern does not exist here — the headless
 * Tabs/TabList/TabTrigger/TabSlot primitives are the supported way to style
 * a tab bar yourself.
 */

type IconKey = 'crossings' | 'trips' | 'alerts';

/** See the comment on `<TabSlot>` below. Undefined off web: keep Yoga's layout. */
const WEB_SLOT_FIX =
  Platform.OS === 'web'
    ? ({ flexBasis: 0, flexShrink: 1, minHeight: 0 } as const)
    : undefined;

/**
 * Three tabs, matching the prototype verbatim:
 *   tabsDef = [['home','Crossings'],['trips','Trips'],['alerts','Alerts']]
 * The map is not a tab — it is the inline card on Crossings (`CrossingsMap`).
 */
const TABS: readonly { name: string; href: string; label: string; icon: IconKey }[] = [
  { name: 'index', href: '/', label: 'Crossings', icon: 'crossings' },
  { name: 'trips', href: '/trips', label: 'Trips', icon: 'trips' },
  { name: 'alerts', href: '/alerts', label: 'Alerts', icon: 'alerts' },
];

/** Icon paths lifted verbatim from the prototype's 20x20 SVGs. */
function TabIcon({ name, tint }: { name: IconKey; tint: string }) {
  if (name === 'crossings') {
    return (
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Rect x={3} y={4} width={14} height={3} rx={1.5} fill={tint} />
        <Rect x={3} y={9} width={14} height={3} rx={1.5} fill={tint} />
        <Rect x={3} y={14} width={9} height={3} rx={1.5} fill={tint} />
      </Svg>
    );
  }
  if (name === 'trips') {
    return (
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Circle cx={10} cy={10} r={7} fill="none" stroke={tint} strokeWidth={1.5} />
        <Path d="M10 6v4l3 2" fill="none" stroke={tint} strokeWidth={1.5} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Path
        d="M10 3c-2.5 0-4 1.8-4 4v3l-1.2 2.5h10.4L14 10V7c0-2.2-1.5-4-4-4z"
        fill="none"
        stroke={tint}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TabButton({
  isFocused,
  label,
  icon,
  ...props
}: TabTriggerSlotProps & { label: string; icon: IconKey }) {
  const tint = isFocused ? color.navy : color.tabInactive;
  return (
    <Pressable
      {...props}
      style={styles.trigger}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
    >
      <TabIcon name={icon} tint={tint} />
      <Text
        style={[
          styles.label,
          { color: tint, fontFamily: isFocused ? font.extrabold : font.semibold },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  /**
   * Alert rules are evaluated here, above the screens, so they keep running on
   * whichever tab the user is on — a spike alert that only fires while you are
   * already looking at the Alerts tab would be useless. It observes the shared
   * waits query and issues no requests of its own.
   */
  useAlertWatch();

  const pathname = usePathname();
  const [barWidth, setBarWidth] = useState(0);

  const activeIndex = pathname.startsWith('/trips')
    ? 1
    : pathname.startsWith('/alerts')
      ? 2
      : 0;

  // The pill slides between slots. Width is measured rather than a percentage
  // because Animated cannot interpolate percentage translateX.
  const pillWidth = barWidth > 0 ? (barWidth - 10) / TABS.length : 0;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: activeIndex * pillWidth,
      duration: 320,
      // The prototype's curve, verbatim. Fidelity includes the easing.
      easing: Easing.bezier(0.3, 0.9, 0.35, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [activeIndex, pillWidth, translateX]);

  return (
    <Tabs>
      {/*
        Web-only: expo-router/ui's slot container ships `flexGrow: 1,
        flexShrink: 0` with an auto flex-basis. Yoga fills the Tabs container
        with that; real CSS instead sizes a shrink-0/auto-basis item to its
        CONTENT, so every screen's ScrollView grew to full content height and
        the *document* became the thing that scrolled. Basis 0 + shrink 1 +
        minHeight 0 pins the slot to the viewport so scrolling happens inside
        the screens, exactly as on the phone. Native is untouched.
      */}
      <TabSlot style={WEB_SLOT_FIX} />
      {/*
        TabList IS the bar, and must be a direct child of Tabs. The trigger
        parser only recurses through Fragments and TabList itself, so wrapping
        it in a View hides every trigger and the navigator throws "Couldn't
        find any screens". Non-trigger children inside TabList (the pill) are
        skipped by that parser but still rendered, which is what lets the bar
        carry the sliding indicator.
      */}
      <TabList
        style={[styles.bar, { bottom: Math.max(22, insets.bottom) }]}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {pillWidth > 0 && (
          <Animated.View
            style={[styles.pill, { width: pillWidth, transform: [{ translateX }] }]}
          />
        )}
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton label={t.label} icon={t.icon} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.tabBar,
    padding: 5,
    ...dropShadow({ y: 12, blur: 32, color: color.ink, opacity: 0.2, elevation: 12 }),
  },
  pill: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 5,
    backgroundColor: color.tabPill,
    borderRadius: radius.tabPill,
  },
  trigger: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radius.tabPill,
    paddingTop: 9,
    paddingBottom: 8,
  },
  label: { fontSize: 10.5, letterSpacing: 0.1 },
});
