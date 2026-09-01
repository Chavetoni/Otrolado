import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, dropShadow, font, radius, tabular } from '../theme';

export function Chip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
}) {
  const tones = {
    neutral: { bg: color.chipBg, fg: color.tertiary },
    good: { bg: color.greenTint, fg: color.green },
    bad: { bg: color.redTint, fg: color.red },
    warn: { bg: color.goldBadgeBg, fg: color.goldBadgeText },
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
  options: readonly { value: T; label: string }[];
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
            <Text
              style={[
                styles.segmentLabel,
                {
                  color: active ? color.ink : color.secondary,
                  fontFamily: active ? font.bold : font.semibold,
                },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * iOS-style switch. 44x26 with a 22px knob, exactly as the prototype specifies.
 *
 * The knob's x-position animates rather than the row re-rendering in two
 * states, so a flip reads as one object sliding — the same treatment as the
 * segmented control's pill. Track colour crossfades over the same 150ms.
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
      duration: 150,
      easing: Easing.out(Easing.quad),
      // Track colour interpolation is a layout-thread property, so this one
      // cannot go native. It is a 44px slide; the JS driver is fine.
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
              outputRange: [color.switchOff, color.green],
            }),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            { transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] }) }] },
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
  chip: { borderRadius: radius.segmentInner, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontFamily: font.bold },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9.5, fontFamily: font.bold, letterSpacing: 0.6 },
  segment: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: color.trackBg,
    borderRadius: radius.segment,
    padding: 3,
  },
  segmentPill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: color.card,
    borderRadius: radius.segmentInner,
    ...dropShadow({ y: 1, blur: 2, color: color.ink, opacity: 0.1 }),
  },
  track: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  knob: {
    position: 'absolute',
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: color.card,
    ...dropShadow({ y: 1, blur: 3, color: '#000000', opacity: 0.25 }),
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 7 },
  segmentLabel: { fontSize: 12.5 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: color.tertiary,
  },
});
