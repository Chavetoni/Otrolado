import { Platform, Pressable, Text, View } from 'react-native';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellGlyph, ClockGlyph, CrossingGlyph } from '../../src/components/glyphs';
import { pressedScale } from '../../src/components/ui';
import { useAlertWatch } from '../../src/useAlertWatch';
import { font, space } from '../../src/theme';
import { makeStyles, useTheme } from '../../src/useTheme';

/**
 * The design-system tab bar (v2 §05), built on `expo-router/ui`: `surface`
 * ground, 1px `line` border-top, no shadow, no pill. Active is an `accent`
 * glyph and an `accent` label (cobalt in light; the lifted cobalt-light
 * `accent` in dark, where plain cobalt is 2.3:1); inactive is `muted` for
 * BOTH — v1's pale `line`-coloured icon square is gone, because a pale fill
 * read as disabled rather than as "the other tabs". Labels went 10 → 11px.
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
 * Three tabs: Crossings, Plan, Alerts.
 *
 * The v2 sheet draws a four-tab bar (Now / Map / Alerts / You). Not adopted:
 * the map is a pushed route from the Crossings card, because panning does not
 * belong inside a scroll view and the card already shows where the crossings
 * are; and there is no account, so there is nothing for a "You" tab to hold.
 * What IS taken from that sheet is the icon family and the active/inactive
 * treatment.
 *
 * "Plan" rather than "Trips" — the tab holds one question ("when do I leave"),
 * not a list of saved journeys, and "Trips" implied the latter. The ROUTE stays
 * `/trips`: renaming it would break every existing deep link for a label
 * change, and the path is not user-visible.
 */
const TABS: readonly { name: string; href: string; label: string; icon: IconKey }[] = [
  { name: 'index', href: '/', label: 'Crossings', icon: 'crossings' },
  { name: 'trips', href: '/trips', label: 'Plan', icon: 'trips' },
  { name: 'alerts', href: '/alerts', label: 'Alerts', icon: 'alerts' },
];

/** Optical size 23 — the sheet's own tab-bar mock. */
const ICON_SIZE = 23;

/**
 * Crossings is the mark itself as a glyph — the booth with its arm; Plan is
 * the clock ("now" in the family), because the tab answers "when"; Alerts is
 * the bell.
 */
function TabIcon({ name, tint }: { name: IconKey; tint: string }) {
  if (name === 'crossings') return <CrossingGlyph size={ICON_SIZE} color={tint} />;
  if (name === 'trips') return <ClockGlyph size={ICON_SIZE} color={tint} />;
  return <BellGlyph size={ICON_SIZE} color={tint} />;
}

function TabButton({
  isFocused,
  label,
  icon,
  ...props
}: TabTriggerSlotProps & { label: string; icon: IconKey }) {
  const { color } = useTheme();
  const styles = useStyles();
  const tint = isFocused ? color.accent : color.muted;
  return (
    <Pressable
      {...props}
      // Pressed: the 0.97 scale, never a tint toward cobalt — cobalt already
      // means "the tab you're on", and colouring toward it would claim the
      // switch before it happens.
      style={({ pressed }) => [styles.trigger, pressedScale(pressed)]}
      role="tab"
      aria-selected={Boolean(isFocused)}
    >
      <TabIcon name={icon} tint={tint} />
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();

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
        find any screens". The bar is flat per the design system — three
        triggers, no pill, no sliding indicator — so TabList holds nothing but
        the triggers.
      */}
      {/* role=tablist: a `tab` only announces "n of m" inside one. */}
      <TabList
        role="tablist"
        style={[styles.bar, { paddingBottom: Math.max(20, insets.bottom) }]}
      >
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton label={t.label} icon={t.icon} />
          </TabTrigger>
        ))}
      </TabList>
      {/*
        The status bar is transparent on iOS, and every tab screen pads its
        inset INSIDE its ScrollView — so anything scrolled up slid under the
        clock and the Dynamic Island (dark clock over the cobalt hero). A page-
        coloured band the height of the inset gives the bar a ground on all
        three tabs.
        Web has no status bar: the inset is 0 there and this renders nothing.
      */}
      <View style={[styles.statusBand, { height: insets.top }]} />
    </Tabs>
  );
}

const useStyles = makeStyles(({ color }) => ({
  // Surface, border-top 1px line, padding 12 20 20. The bottom padding is
  // applied inline so the safe-area inset can widen it.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: 12,
    paddingHorizontal: space.gutter,
  },
  trigger: {
    flex: 1,
    minHeight: space.hitMin,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: { fontSize: 11, lineHeight: 14, fontFamily: font.semibold },
  statusBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: color.page,
    pointerEvents: 'none',
  },
}));
