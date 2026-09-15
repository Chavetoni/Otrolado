import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type Insets,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { Freshness } from '@otrolado/shared';
import { freshnessBadge } from '../freshness-ui';
import { isReduceMotion, useReduceMotion } from '../useReduceMotion';
import {
  color,
  font,
  motion,
  radius,
  space,
  status,
  tabular,
  waitColor,
  waitSeverityWord,
  waitTextColor,
} from '../theme';
import { type } from '../typography';
import { ClockGlyph } from './glyphs';

/*
 * ACCESSIBILITY PROPS. Everything here uses `role` and `aria-*`, not
 * `accessibilityRole` / `accessibilityState`. React Native 0.86 maps the aria
 * props onto the native accessibility state, and react-native-web 0.21 does
 * not know `accessibilityState` AT ALL — on web every toggled, selected and
 * expanded state was silently dropped (a `role=switch` with no
 * `aria-checked`). Screens follow the same convention.
 */

// react-native-web has no native animated module, so asking for the native
// driver there logs a warning and silently falls back to JS.
const NATIVE_DRIVER = Platform.OS !== 'web';

/* ── Press feedback ─────────────────────────────────────────────────── */

/**
 * Pressed, for a control with no fill to darken (v2 §06): scale(0.97). Cards
 * take a `mist` fill instead of scaling, and status-tinted surfaces take
 * neither a darker tint nor opacity — a status colour must never double as
 * touch feedback, so they scale too. Nothing scales under Reduce Motion.
 *
 * For a Pressable style function: `style={({ pressed }) => [s.x, pressedScale(pressed)]}`.
 * Read at press time, so it follows the setting without subscribing.
 */
export function pressedScale(pressed: boolean): ViewStyle | undefined {
  return pressed && !isReduceMotion() ? PRESSED_SCALE : undefined;
}
const PRESSED_SCALE: ViewStyle = { transform: [{ scale: 0.97 }] };

/**
 * The animated version of `pressedScale`, 90ms ease-out each way, for the
 * buttons that carry the app's main actions. Spread the handlers onto a
 * Pressable and the style onto the Animated.View inside it. Under Reduce
 * Motion the scale is skipped and only the colour change remains.
 */
export function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number): void => {
    if (isReduceMotion()) return;
    Animated.timing(scale, {
      toValue: value,
      duration: motion.press,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  };
  return {
    style: { transform: [{ scale }] },
    onPressIn: () => to(0.97),
    onPressOut: () => to(1),
  };
}

/* ── Buttons ────────────────────────────────────────────────────────── */

/**
 * `primary`       cobalt fill, white label — the one most tappable thing.
 * `tertiary`      white, navy label, 1.5px line-strong border.
 * `inverse`       white fill, NAVY label — the primary when it sits ON cobalt,
 *                 inverted so the hero keeps a single focal point.
 * `ghostOnCobalt` no fill, white label, 1.5px cobalt-outline border — the
 *                 secondary on cobalt.
 *
 * `selected` is the toggled state of an action that stays on screen (Watching,
 * Reminder on): light-surface variants take a navy fill; on cobalt, the
 * translucent white fill from the brand sheet's Replay chip.
 *
 * v2 also specifies a cobalt-outline `secondary` and a loading state (15px
 * ring + the verb in progress). Neither has a caller — every action in the
 * app today is a local toggle or a hand-off to the maps app, never a wait —
 * so they are not built. Add them from §06 when a button first has to wait.
 */
export type ButtonVariant = 'primary' | 'tertiary' | 'inverse' | 'ghostOnCobalt';

interface ButtonLook {
  readonly bg: string;
  readonly fg: string;
  readonly border: string;
}

function buttonLook(
  variant: ButtonVariant,
  pressed: boolean,
  selected: boolean,
  disabled: boolean,
): ButtonLook {
  if (disabled) {
    // v2: fill drops to `line`, text to `ink-muted` — never opacity, which
    // muddies whatever sits behind. Outline variants keep their white ground
    // and take a `line` border. On cobalt, the same idea in that surface's
    // own inks.
    switch (variant) {
      case 'primary':
        return { bg: color.line, fg: color.inkMuted, border: color.line };
      case 'tertiary':
        return { bg: color.surface, fg: color.inkMuted, border: color.line };
      case 'inverse':
        return { bg: color.surfaceOnCobalt, fg: color.cobaltLight, border: color.surfaceOnCobalt };
      case 'ghostOnCobalt':
        return { bg: 'transparent', fg: color.cobaltLight, border: color.cobaltOutline };
    }
  }
  if (selected) {
    if (variant === 'ghostOnCobalt' || variant === 'inverse') {
      return { bg: pressed ? color.cobaltPress : color.surfaceOnCobalt, fg: color.surface, border: color.surface };
    }
    const bg = pressed ? color.navyTint : color.navy;
    return { bg, fg: color.surface, border: bg };
  }
  switch (variant) {
    case 'primary': {
      const bg = pressed ? color.cobaltPress : color.cobalt;
      return { bg, fg: color.surface, border: bg };
    }
    case 'tertiary':
      return {
        bg: pressed ? color.mist : color.surface,
        fg: color.navy,
        border: pressed ? color.navy : color.lineStrong,
      };
    case 'inverse': {
      const bg = pressed ? color.mist : color.surface;
      return { bg, fg: color.navy, border: bg };
    }
    case 'ghostOnCobalt':
      return {
        bg: pressed ? color.cobaltPress : 'transparent',
        fg: color.surface,
        border: color.cobaltOutline,
      };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  selected = false,
  disabled = false,
  size = 'md',
  grow = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Drawn at 16px in the label's colour, before the label. */
  icon?: (tint: string) => ReactNode;
  selected?: boolean;
  disabled?: boolean;
  /** 48 tall (the spec's button) or 44 (the hit-target floor, for dense rows). */
  size?: 'md' | 'sm';
  /** `flex: 1` — for a row of equal buttons. */
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const press = usePressScale();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : press.onPressIn}
      onPressOut={disabled ? undefined : press.onPressOut}
      disabled={disabled}
      role="button"
      aria-label={accessibilityLabel}
      aria-disabled={disabled}
      aria-selected={selected}
      style={[grow && { flex: 1 }, style]}
    >
      {({ pressed }) => {
        const look = buttonLook(variant, pressed && !disabled, selected, disabled);
        return (
          <Animated.View
            style={[
              styles.button,
              size === 'sm' && styles.buttonSm,
              // In a row of equal buttons the width comes from the row, not
              // the padding, so the padding steps down to keep "Ready Lane"
              // on one line at 402pt.
              grow && styles.buttonGrow,
              { backgroundColor: look.bg, borderColor: look.border },
              press.style,
            ]}
          >
            {icon?.(look.fg)}
            <Text style={[styles.buttonLabel, { color: look.fg }]} numberOfLines={1}>
              {label}
            </Text>
          </Animated.View>
        );
      }}
    </Pressable>
  );
}

/**
 * A 44×44 hit target around a 22–24px glyph. Pressed, it takes a `mist`
 * circle (or `navyTint` on a dark surface) and the 0.97 scale; `selected`
 * keeps that circle as the toggled state, since glyphs are never filled in.
 */
export function IconButton({
  onPress,
  accessibilityLabel,
  children,
  onDark = false,
  selected,
  hitSlop,
  style,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  onDark?: boolean;
  /** Set for a toggle (the pin, the star); leave undefined for a plain action. */
  selected?: boolean;
  hitSlop?: number | Insets;
  style?: StyleProp<ViewStyle>;
}) {
  const press = usePressScale();
  const restingBg = selected ? (onDark ? color.surfaceOnCobalt : color.mist) : 'transparent';
  const pressedBg = onDark ? color.navyTint : color.mist;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={hitSlop}
      role="button"
      aria-label={accessibilityLabel}
      aria-selected={selected}
      style={style}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.iconButton,
            { backgroundColor: pressed ? pressedBg : restingBg },
            press.style,
          ]}
        >
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

/* ── Notices ────────────────────────────────────────────────────────── */

/**
 * The notice banner: a tinted panel, a 14/20 semibold title over 13/19 body,
 * radius 16, padding 14/16. `info` (the no-southbound-feed notices, "no
 * recommendation") carries the 7px cobalt dot; `error` is the heavy tint for
 * a failed fetch. Copy stays at each call site — the three southbound notices
 * say different things on purpose.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
  style,
}: {
  tone?: 'info' | 'error';
  title: string;
  children: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t =
    tone === 'error'
      ? { bg: status.heavy.tint, ink: status.heavy.ink }
      : { bg: color.infoTint, ink: color.infoInk };
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }, style]} role={tone === 'error' ? 'alert' : undefined}>
      {tone === 'info' && <View style={styles.noticeDot} />}
      <View style={styles.noticeBody}>
        <Text style={[styles.noticeTitle, { color: t.ink }]}>{title}</Text>
        <Text style={[styles.noticeText, { color: t.ink }]}>{children}</Text>
        {action}
      </View>
    </View>
  );
}

/* ── Loading ────────────────────────────────────────────────────────── */

/**
 * A placeholder block in `line`, pulsing at 1.4s. First open only: once a
 * number has been seen, a refresh never blanks it (React Query keeps the last
 * data through refetches, so the skeleton only ever renders before the first
 * response). Holds still under Reduce Motion.
 */
export function Skeleton({
  width,
  height,
  round = radius.sm,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  round?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: motion.pulse / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: motion.pulse / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: round, backgroundColor: color.line, opacity: pulse }, style]}
    />
  );
}

/* ── Pills, chips, tags ─────────────────────────────────────────────── */

/**
 * The v2 pill (§07): a tinted capsule, padding 5/11, gap 8, with a 10/600
 * spaced uppercase word and, before it, either a 7px dot or a 12px glyph.
 * Colour is never the only channel — that is what the word is for.
 */
export function Pill({
  label,
  bg,
  fg,
  icon,
  dot = false,
  style,
}: {
  label: string;
  bg: string;
  fg: string;
  /** A 12px glyph, drawn by the caller in `fg` at stroke 2.4. */
  icon?: ReactNode;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {dot && <View style={[styles.pillDot, { backgroundColor: fg }]} />}
      {icon}
      <Text style={[styles.pillText, { color: fg }, tabular]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The freshness verdict as a pill, or nothing while live. The clock glyph
 * says "this has aged" before the word does; the colours are the badge pairs
 * from `freshnessBadge`, so the row, the hero and the detail card cannot
 * disagree about what estimated looks like.
 */
export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  const badge = freshnessBadge(freshness);
  if (!badge) return null;
  return (
    <Pill
      label={badge.label}
      bg={badge.bg}
      fg={badge.fg}
      icon={<ClockGlyph size={12} strokeWidth={2.4} color={badge.fg} />}
    />
  );
}

/**
 * The word beside a severity colour: a vivid dot and "Clear" / "Moderate" /
 * "Heavy" in that status's AA-safe text ink. Sits next to a wait number on a
 * WHITE card so the number itself can stay in full ink. Live readings only —
 * the caller gates it, because a severity verdict on a reading nobody stands
 * behind is exactly what the non-live treatment exists to withhold.
 */
export function SeverityTag({ minutes }: { minutes: number }) {
  return (
    <View style={styles.severity} accessible aria-label={`${waitSeverityWord(minutes)} wait`}>
      <View style={[styles.severityDot, { backgroundColor: waitColor(minutes) }]} />
      <Text style={[styles.severityText, { color: waitTextColor(minutes) }]}>
        {waitSeverityWord(minutes)}
      </Text>
    </View>
  );
}

export function Chip({ label, tone }: { label: string; tone: 'good' | 'bad' }) {
  const t = tone === 'good' ? status.clear : status.heavy;
  return (
    <View style={[styles.chip, { backgroundColor: t.tint }]}>
      <Text style={[styles.chipText, { color: t.ink }, tabular]}>{label}</Text>
    </View>
  );
}

/* ── Controls ───────────────────────────────────────────────────────── */

/**
 * Sliding-pill segmented control.
 *
 * The handoff specifies transform over 0.32s with cubic-bezier(.3,.9,.35,1) —
 * animating the pill's position rather than cross-fading backgrounds, so the
 * selection reads as one object moving. Under Reduce Motion it jumps.
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
  const reduceMotion = useReduceMotion();
  // RN transforms take pixels, not percentages, so the track has to be
  // measured before the pill can be positioned.
  const [trackWidth, setTrackWidth] = useState(0);
  const PADDING = 3;
  const itemWidth = trackWidth > 0 ? (trackWidth - PADDING * 2) / options.length : 0;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: index,
      duration: reduceMotion ? 0 : 320,
      easing: Easing.bezier(0.3, 0.9, 0.35, 1),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [index, anim, reduceMotion]);

  return (
    <View
      style={styles.segment}
      role="tablist"
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
            role="tab"
            aria-selected={active}
          >
            {/* A pressed inactive label steps to full ink. The item has no
                surface of its own to tint — the pill slides beneath it. */}
            {({ pressed }) => (
              <Text
                style={[
                  styles.segmentLabel,
                  {
                    color: active || pressed ? color.navy : color.muted,
                    fontFamily: active ? font.bold : font.semibold,
                  },
                ]}
              >
                {o.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Toggle per the design system: 48x28 track, 22px white knob, 3px padding,
 * on = cobalt, off = line. Track colour transitions over 180ms `ease`.
 *
 * The knob's x-position animates rather than the row re-rendering in two
 * states, so a flip reads as one object sliding — the same treatment as the
 * segmented control's pill.
 *
 * `disabled` refuses the press and drops to the disabled palette (track
 * `line`, knob `mist` with a hairline) — never opacity. It exists because
 * some rules cannot be evaluated yet, and a switch that moves but changes
 * nothing is exactly the kind of quiet lie this app avoids.
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
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: reduceMotion ? 0 : motion.toggle,
      // CSS `ease`.
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      // Track colour interpolation is a layout-thread property, so this one
      // cannot go native. It is a 48px slide; the JS driver is fine.
      useNativeDriver: false,
    }).start();
  }, [value, anim, reduceMotion]);

  return (
    <Pressable
      onPress={disabled ? undefined : onChange}
      disabled={disabled}
      role="switch"
      aria-label={label}
      aria-checked={value}
      aria-disabled={disabled}
      // The 28pt track is below the 44pt minimum touch target. The rows it
      // sits in are taller than 44, so the slop lands inside the parent's
      // bounds (iOS only hit-tests slop that does).
      hitSlop={8}
    >
      {/* Pressed: on → cobaltPress (pressed on cobalt), off → lineStrong (the
          heavier inactive control). Released, the animated track takes over. */}
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.track,
            {
              backgroundColor: disabled
                ? color.line
                : pressed
                  ? (value ? color.cobaltPress : color.lineStrong)
                  : anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [color.line, color.cobalt],
                    }),
            },
          ]}
        >
          <Animated.View
            style={[
              styles.knob,
              disabled && styles.knobDisabled,
              { transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [3, 23] }) }] },
            ]}
          />
        </Animated.View>
      )}
    </Pressable>
  );
}

/* ── Text ───────────────────────────────────────────────────────────── */

/**
 * The eyebrow: 11/16/600, +0.1em, uppercase. `muted` on light surfaces,
 * `mutedOnDark` on navy, `cobaltLight` on cobalt.
 */
export function SectionLabel({
  children,
  tone = 'light',
  style,
}: {
  children: string;
  tone?: 'light' | 'dark' | 'cobalt';
  style?: StyleProp<TextStyle>;
}) {
  const ink =
    tone === 'dark' ? color.mutedOnDark : tone === 'cobalt' ? color.cobaltLight : color.muted;
  return <Text style={[type.eyebrow, { color: ink }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  // Buttons: 48 tall (14px vertical padding at body size), radius 16, 14/600,
  // 1.5px border on every variant so filled and outlined buttons measure the
  // same — the filled ones just paint the border in their own colour.
  button: {
    minHeight: space.buttonHeight,
    borderRadius: radius.button,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonSm: { minHeight: space.hitMin, paddingHorizontal: 16 },
  buttonGrow: { paddingHorizontal: 12 },
  buttonLabel: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, flexShrink: 1 },
  iconButton: {
    width: space.hitMin,
    height: space.hitMin,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notice: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: radius.banner,
    paddingVertical: 14,
    paddingHorizontal: space.cardPad,
  },
  noticeDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 7, backgroundColor: color.cobalt },
  noticeBody: { flex: 1, gap: 4 },
  noticeTitle: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold },
  noticeText: { fontSize: 13, lineHeight: 19, fontFamily: font.regular },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  pillDot: { width: 7, height: 7, borderRadius: 3.5 },
  pillText: { fontSize: 10, lineHeight: 14, fontFamily: font.semibold, letterSpacing: 1, textTransform: 'uppercase' },

  severity: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  severityDot: { width: 7, height: 7, borderRadius: 3.5 },
  severityText: { fontSize: 12, lineHeight: 17, fontFamily: font.semibold },

  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, lineHeight: 14, fontFamily: font.semibold },

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
  // 38pt of item + 3pt of track padding each side = the 44pt floor, inside the
  // track's own bounds (so no hitSlop, which iOS would clip at the track edge).
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 38 },
  segmentLabel: { fontSize: 13, lineHeight: 18 },

  track: { width: 48, height: 28, borderRadius: radius.pill, justifyContent: 'center' },
  knob: {
    position: 'absolute',
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: color.surface,
  },
  knobDisabled: { backgroundColor: color.mist, borderWidth: 1, borderColor: color.lineStrong },
});
