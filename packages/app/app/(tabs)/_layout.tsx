import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlertWatch } from '../../src/useAlertWatch';
import { color, font } from '../../src/theme';

/**
 * The design-system tab bar, built on `expo-router/ui`: white surface,
 * 1px `line` border-top, active items in cobalt, inactive icons in the
 * dedicated tabInactive tint with muted labels. Flat — no shadow, no pill.
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

/** Icon paths lifted verbatim from the prototype's 20x20 SVGs, drawn at the
 * spec's 21px item size. */
function TabIcon({ name, tint }: { name: IconKey; tint: string }) {
  if (name === 'crossings') {
    return (
      <Svg width={21} height={21} viewBox="0 0 20 20">
        <Rect x={3} y={4} width={14} height={3} rx={1.5} fill={tint} />
        <Rect x={3} y={9} width={14} height={3} rx={1.5} fill={tint} />
        <Rect x={3} y={14} width={9} height={3} rx={1.5} fill={tint} />
      </Svg>
    );
  }
  if (name === 'trips') {
    return (
      <Svg width={21} height={21} viewBox="0 0 20 20">
        <Circle cx={10} cy={10} r={7} fill="none" stroke={tint} strokeWidth={1.5} />
        <Path d="M10 6v4l3 2" fill="none" stroke={tint} strokeWidth={1.5} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={21} height={21} viewBox="0 0 20 20">
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
  // Active is cobalt on both icon and label; inactive splits — the icon takes
  // the pale tabInactive tint, the label takes muted, exactly as specified.
  return (
    <Pressable
      {...props}
      style={styles.trigger}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
    >
      <TabIcon name={icon} tint={isFocused ? color.cobalt : color.tabInactive} />
      <Text style={[styles.label, { color: isFocused ? color.cobalt : color.muted }]}>
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
      <TabList style={[styles.bar, { paddingBottom: Math.max(20, insets.bottom) }]}>
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
  // Spec: white, border-top 1px line, padding 11px 34px 20px. The bottom
  // padding is applied inline so the safe-area inset can widen it.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: 11,
    paddingHorizontal: 34,
  },
  trigger: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: 10, fontFamily: font.semibold },
});
