import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, radius, status, tabular } from '../theme';

export function Chip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
}) {
  const tones = {
    neutral: { bg: color.mist, fg: color.muted },
    good: { bg: status.clear.tint, fg: status.clear.ink },
    bad: { bg: status.heavy.tint, fg: status.heavy.ink },
    warn: { bg: status.moderate.tint, fg: status.moderate.ink },
  } as const;
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <Text style={[styles.chipText, { color: t.fg }, tabular]}>{label}</Text>
    </View>
  );
}

export function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/**
 * Sliding-pill segmented control.
 *
 * The handoff specifies transform over 0.32s with cubic-bezier(.3,.9,.35,1) —
 * animating the pill's position rather than cross-fading backgrounds, so the
 * selection reads as one object moving.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  /**
   * `dot` renders a 6px status dot before the label — availability, not
   * severity (open = clear green regardless of the wait; the number below
   * carries how bad it is). `dimmed` pales the inactive label for an option
   * that exists as a choice but has nothing behind it (e.g. a lane this
   * crossing does not have); it stays tappable so the screen can say why.
   */
  options: readonly { value: T; label: string; dot?: string | null; dimmed?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const anim = useRef(new Animated.Value(index)).current;
  // RN transforms take pixels, not percentages, so the track has to be
  // measured before the pill can be positioned.
  const [trackWidth, setTrackWidth] = useState(0);
  const PADDING = 3;
  const itemWidth = trackWidth > 0 ? (trackWidth - PADDING * 2) / options.length : 0;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: index,
      duration: 320,
      easing: Easing.bezier(0.3, 0.9, 0.35, 1),
      // react-native-web has no native animated module, so asking for the
      // native driver there logs a warning and silently falls back to JS.
      // Same guard the tab bar uses.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [index, anim]);

  return (
    <View
      style={styles.segment}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {itemWidth > 0 && (
        <Animated.View
          style={[
            styles.segmentPill,
            {
              width: itemWidth,
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: options.map((_, i) => i),
                    outputRange: options.map((_, i) => i * itemWidth),
                  }),
                },
              ],
            },
          ]}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={styles.segmentItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <View style={styles.segmentLabelRow}>
              {o.dot != null && (
                <View style={[styles.segmentDot, { backgroundColor: o.dot }]} />
              )}
              <Text
                style={[
                  styles.segmentLabel,
                  {
                    color: active
                      ? color.navy
                      : o.dimmed
                        ? color.lineStrong
                        : color.muted,
                    fontFamily: active ? font.bold : font.semibold,
                  },
                ]}
              >
                {o.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Toggle per the design system: 48x28 track, 22px white knob, 3px padding,
 * on = cobalt, off = line. Track colour transitions over 180ms.
 *
 * The knob's x-position animates rather than the row re-rendering in two
 * states, so a flip reads as one object sliding — the same treatment as the
 * segmented control's pill.
 *
 * `disabled` renders at reduced opacity and refuses the press. It exists
 * because some rules cannot be evaluated yet, and a switch that moves but
 * changes nothing is exactly the kind of quiet lie this app avoids.
 */
export function Toggle({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      // Track colour interpolation is a layout-thread property, so this one
      // cannot go native. It is a 48px slide; the JS driver is fine.
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  return (
    <Pressable
      onPress={disabled ? undefined : onChange}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [color.line, color.cobalt],
            }),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            { transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [3, 23] }) }] },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontFamily: font.semibold },
  badge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontFamily: font.semibold, letterSpacing: 1.1 },
  segment: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: color.line,
    borderRadius: radius.pill,
    padding: 3,
  },
  // No shadows anywhere — the pill separates by surface contrast alone.
  segmentPill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: color.surface,
    borderRadius: radius.pill,
  },
  track: { width: 48, height: 28, borderRadius: radius.pill, justifyContent: 'center' },
  knob: {
    position: 'absolute',
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: color.surface,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 7 },
  segmentLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  segmentDot: { width: 6, height: 6, borderRadius: 3 },
  segmentLabel: { fontSize: 12.5 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: font.semibold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: color.muted,
  },
});
