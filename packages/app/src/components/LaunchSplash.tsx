import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { color, font, motion } from '../theme';

/**
 * The launch sequence — 1.2s, down from the brand sheet's 2.2s (design system
 * v2 §09: "a reward, not loading theater"):
 *
 *   0.00s  Cobalt field, booth in place, arm down. Holds while the app renders.
 *   0.25s  Arm starts lifting: 450ms, cubic-bezier(.3,.9,.3,1).
 *   0.70s  Arm lands vertical. Wordmark fades up over 200ms.
 *   1.05s  Splash dissolves, 150ms, revealing Crossings underneath.
 *   1.20s  Interface live and interactive.
 *
 * Three rules ride on it:
 *  - A WARM START SKIPS IT ENTIRELY — decided in app/_layout.tsx, which never
 *    mounts this component when cached data is under ten minutes old.
 *  - REDUCE MOTION: nothing rotates, nothing scales. The arm is drawn twice,
 *    down and up, and cross-fades between them where the swing would have
 *    been; the whole splash then cross-fades out over 200ms (§09).
 *  - SLOW NETWORK: the splash still exits on schedule. Readiness never
 *    shortens the timeline and slowness never extends it — Crossings appears
 *    with skeletons if it must. The brand moment never gates the data.
 *
 * TIMING. Every step is its own native-driver timing with a `delay` measured
 * from ONE start instant, run in parallel. A JS-side `Animated.sequence`
 * waits on the JS thread between steps, and the JS thread is exactly what is
 * busy while Crossings mounts underneath — so the 1.2s stretched.
 *
 * HOW THE HANDOFF WORKS
 *
 * The native splash (expo-splash-screen, configured in app.json) shows the
 * gate-down frame while JS loads. This overlay draws the identical frame —
 * the same booth image at the same 248×200 size, centred the same way, with
 * the arm at 0° — and only then asks the native splash to hide, so the swap
 * is invisible. "Drawn" means laid out AND the booth image loaded: RN loads
 * images asynchronously (in a dev build, over HTTP from Metro), and hiding on
 * layout alone could flash a cobalt field with only the arm on it. A short
 * fallback timer covers an image that never reports. The timeline starts at
 * the same moment, so the hold is measured from the frame the user sees.
 *
 * The arm is drawn here rather than baked into the image because it has to
 * move; `assets/splash-icon.png` is the same composition rendered flat for
 * the native side. Change one and regenerate the other. (On Android 12+ the
 * system splash is a masked icon, so the swap is not pixel-identical there;
 * its exit fade is shortened below so it doesn't cover the hold.)
 */

/** The brand box the splash panel is drawn in. Units are dp. */
const BOX = { w: 248, h: 200 } as const;
/** Arm geometry, verbatim from the sheet's `armStyle`. */
const ARM = { x: 128, y: 108.5, w: 116, h: 17, r: 8.5 } as const;
/** The hinge pin: 8.5 from the arm's left edge, vertically centred. */
const PIVOT = 8.5;
/** Gap between the mark and the wordmark. */
const WORD_GAP = 44;

/** Milliseconds from the start instant. */
const T = {
  armAt: 250,
  swing: motion.gate,
  /** Reduce Motion: the down→up cross-fade that stands in for the swing. */
  crossfade: 200,
  wordAt: 700,
  word: 200,
  dissolveAt: 1050,
  dissolve: 150,
  /** Reduce Motion exit: "whole splash cross-fades in 200ms" (§09). */
  dissolveReduced: 200,
} as const;

/** Give up waiting for the booth image and hide the native splash anyway. */
const IMAGE_WAIT_MS = 500;

/**
 * The sheet's `linear-gradient(112deg, …)` expressed as a user-space SVG
 * gradient over the 116×17 arm: CSS measures the angle clockwise from "up"
 * and runs the line through the centre with length |w·sin a| + |h·cos a|.
 */
const A = (112 * Math.PI) / 180;
const DIR = { x: Math.sin(A), y: -Math.cos(A) };
const LEN = Math.abs(ARM.w * DIR.x) + Math.abs(ARM.h * DIR.y);
const G0 = { x: ARM.w / 2 - (DIR.x * LEN) / 2, y: ARM.h / 2 - (DIR.y * LEN) / 2 };
const G1 = { x: ARM.w / 2 + (DIR.x * LEN) / 2, y: ARM.h / 2 + (DIR.y * LEN) / 2 };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BOOTH = require('../../assets/splash-booth.png');

// react-native-web has no native animated module; same guard as ui.tsx.
const NATIVE_DRIVER = Platform.OS !== 'web';

/** Rotate about the pin, not the arm's centre. */
const aboutPivot = (rotate: Animated.AnimatedInterpolation<string> | string) => [
  { translateX: -(ARM.w / 2 - PIVOT) },
  { rotate },
  { translateX: ARM.w / 2 - PIVOT },
];

export function LaunchSplash({
  onDone,
  reduceMotion = false,
}: {
  onDone: () => void;
  reduceMotion?: boolean;
}) {
  const arm = useRef(new Animated.Value(0)).current; // 0 = closed, 1 = open
  const word = useRef(new Animated.Value(0)).current;
  const veil = useRef(new Animated.Value(1)).current;
  // Once the dissolve starts, touches go through to the screen beneath.
  const [dissolving, setDissolving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The handoff gate: first layout, and the booth image loaded (or given up on).
  const [laidOut, setLaidOut] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const markImageReady = useCallback(() => setImageReady(true), []);
  useEffect(() => {
    const id = setTimeout(markImageReady, IMAGE_WAIT_MS);
    return () => clearTimeout(id);
  }, [markImageReady]);
  const drawn = laidOut && imageReady;

  useEffect(() => {
    if (!drawn) return;

    // Our frame is on screen: drop the native one showing the same picture.
    // Android always fades its splash out (400ms by default, `fade` ignored),
    // which would sit over the hold and half the swing; keep it short. No-op
    // on web.
    if (Platform.OS === 'android') {
      try {
        SplashScreen.setOptions({ duration: 150 });
      } catch {
        // Older runtime: accept the default fade.
      }
    }
    void SplashScreen.hideAsync().catch(() => {});

    const dissolveFor = reduceMotion ? T.dissolveReduced : T.dissolve;

    const timeline = Animated.parallel([
      // With motion: the swing. Without: the same value drives the opacity
      // cross-fade between the two arm drawings — linear, since a fade with
      // an easing curve reads as a stutter.
      Animated.timing(arm, {
        toValue: 1,
        delay: T.armAt,
        duration: reduceMotion ? T.crossfade : T.swing,
        easing: reduceMotion ? Easing.linear : Easing.bezier(0.3, 0.9, 0.3, 1),
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(word, {
        toValue: 1,
        delay: T.wordAt,
        duration: T.word,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(veil, {
        toValue: 0,
        delay: T.dissolveAt,
        duration: dissolveFor,
        easing: reduceMotion ? Easing.linear : Easing.out(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]);

    const release = setTimeout(() => setDissolving(true), T.dissolveAt);
    timeline.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => {
      clearTimeout(release);
      timeline.stop();
    };
  }, [drawn, arm, word, veil, reduceMotion]);

  const armSvg = (
    <Svg width={ARM.w} height={ARM.h} viewBox={`0 0 ${ARM.w} ${ARM.h}`}>
      <Defs>
        <LinearGradient
          id="stripes"
          gradientUnits="userSpaceOnUse"
          x1={G0.x}
          y1={G0.y}
          x2={G1.x}
          y2={G1.y}
        >
          <Stop offset={0} stopColor={color.surface} />
          <Stop offset={0.4} stopColor={color.surface} />
          <Stop offset={0.4} stopColor={color.cobalt} />
          <Stop offset={0.52} stopColor={color.cobalt} />
          <Stop offset={0.52} stopColor={color.surface} />
          <Stop offset={0.64} stopColor={color.surface} />
          <Stop offset={0.64} stopColor={color.cobalt} />
          <Stop offset={0.76} stopColor={color.cobalt} />
          <Stop offset={0.76} stopColor={color.surface} />
          <Stop offset={1} stopColor={color.surface} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={ARM.w} height={ARM.h} rx={ARM.r} fill="url(#stripes)" />
      <Circle cx={PIVOT} cy={ARM.h / 2} r={3.5} fill={color.cobalt} />
    </Svg>
  );

  return (
    <Animated.View
      style={[styles.veil, { opacity: veil, pointerEvents: dissolving ? 'none' : 'auto' }]}
      onLayout={() => setLaidOut(true)}
      // Decorative: the brand moment has nothing a screen reader needs, and
      // the screen beneath is what it should reach.
      aria-hidden
    >
      <StatusBar style="light" />
      <View style={styles.box}>
        <Image
          source={BOOTH}
          style={styles.booth}
          resizeMode="contain"
          onLoadEnd={markImageReady}
        />
        {reduceMotion ? (
          <>
            <Animated.View
              style={[styles.arm, { opacity: Animated.subtract(1, arm), transform: aboutPivot('0deg') }]}
            >
              {armSvg}
            </Animated.View>
            <Animated.View style={[styles.arm, { opacity: arm, transform: aboutPivot('-90deg') }]}>
              {armSvg}
            </Animated.View>
          </>
        ) : (
          <Animated.View
            style={[
              styles.arm,
              {
                transform: aboutPivot(
                  arm.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] }),
                ),
              },
            ]}
          >
            {armSvg}
          </Animated.View>
        )}
        <Animated.View
          style={[
            styles.wordmark,
            {
              opacity: word,
              // The 8px rise is motion too; under Reduce Motion the wordmark only fades.
              transform: reduceMotion
                ? []
                : [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          <Text style={styles.name}>Otrolado</Text>
          <Text style={styles.tagline}>BORDER WAIT TIMES</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: color.cobalt,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  // Centred exactly, so it lands on top of the native splash's centred image.
  box: { width: BOX.w, height: BOX.h },
  booth: { position: 'absolute', left: 0, top: 0, width: BOX.w, height: BOX.h },
  arm: { position: 'absolute', left: ARM.x, top: ARM.y, width: ARM.w, height: ARM.h },
  // Hangs below the box rather than sharing its centre, so the mark never
  // moves when the wordmark appears.
  wordmark: {
    position: 'absolute',
    top: BOX.h + WORD_GAP,
    left: -100,
    right: -100,
    alignItems: 'center',
  },
  // Sheet: 28/700, -0.02em, white; tagline 11/600, 0.14em, cobaltLight.
  name: {
    fontSize: 28, lineHeight: 28, fontFamily: font.bold, color: color.surface,
    letterSpacing: -0.56,
  },
  tagline: {
    fontSize: 11, fontFamily: font.semibold, color: color.cobaltLight,
    letterSpacing: 1.54, marginTop: 8,
  },
});
