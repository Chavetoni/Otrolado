import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { color, font } from '../theme';

/**
 * The launch sequence, from the brand sheet ("Otrolado Brand.dc.html"):
 *
 *   0.0s  Cobalt field, booth with the gate down. Holds while the app renders.
 *   0.7s  Arm rotates 90° on the hinge, 750ms ease-out. Wordmark fades up
 *         250ms behind it.
 *   1.7s  Splash dissolves, 450ms, revealing the Crossings screen underneath.
 *   2.2s  Done. If the app is ready earlier, still finish the arm — never cut
 *         it mid-swing.
 *
 * HOW THE HANDOFF WORKS
 *
 * The native splash (expo-splash-screen, configured in app.json) shows the
 * gate-down frame while JS loads. This overlay draws the identical frame —
 * the same booth image at the same 248×200 size, centred the same way, with
 * the arm at 0° — and only then asks the native splash to hide, so the swap
 * is invisible. The arm is drawn here rather than baked into the image because
 * it has to rotate; `assets/splash-icon.png` is the same composition rendered
 * flat for the native side. Change one and regenerate the other.
 *
 * The timeline is fixed once it starts: readiness never shortens it, per the
 * sheet. It runs on a per-launch clock, so the app can be fully interactive
 * beneath it before the dissolve begins.
 */

/** The brand box the splash panel is drawn in. Units are dp. */
const BOX = { w: 248, h: 200 } as const;
/** Arm geometry, verbatim from the sheet's `armStyle`. */
const ARM = { x: 128, y: 108.5, w: 116, h: 17, r: 8.5 } as const;
/** The hinge pin: 8.5 from the arm's left edge, vertically centred. */
const PIVOT = 8.5;
/** Gap between the mark and the wordmark. */
const WORD_GAP = 44;

const T = {
  hold: 700,
  swing: 750,
  wordDelay: 250,
  word: 500,
  dissolveAt: 1700,
  dissolve: 450,
} as const;

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

export function LaunchSplash({ onDone }: { onDone: () => void }) {
  const arm = useRef(new Animated.Value(0)).current; // 0 = closed, 1 = open
  const word = useRef(new Animated.Value(0)).current;
  const veil = useRef(new Animated.Value(1)).current;
  // Once the dissolve starts, touches go through to the screen beneath.
  const [dissolving, setDissolving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const seq = Animated.sequence([
      Animated.delay(T.hold),
      Animated.parallel([
        Animated.timing(arm, {
          toValue: 1,
          duration: T.swing,
          easing: Easing.bezier(0.3, 0.9, 0.3, 1),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.sequence([
          Animated.delay(T.wordDelay),
          Animated.timing(word, {
            toValue: 1,
            duration: T.word,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: NATIVE_DRIVER,
          }),
        ]),
      ]),
      Animated.delay(T.dissolveAt - T.hold - T.swing),
      Animated.timing(veil, {
        toValue: 0,
        duration: T.dissolve,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]);
    const release = setTimeout(() => setDissolving(true), T.dissolveAt);
    seq.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => {
      clearTimeout(release);
      seq.stop();
    };
  }, [arm, word, veil]);

  return (
    <Animated.View
      style={[styles.veil, { opacity: veil, pointerEvents: dissolving ? 'none' : 'auto' }]}
      // First layout means this frame is painted: safe to drop the native
      // splash showing the same picture. No-op on web.
      onLayout={() => {
        void SplashScreen.hideAsync().catch(() => {});
      }}
    >
      <StatusBar style="light" />
      <View style={styles.box}>
        <Image source={BOOTH} style={styles.booth} resizeMode="contain" />
        <Animated.View
          style={[
            styles.arm,
            {
              transform: [
                // Rotate about the pin, not the arm's centre.
                { translateX: -(ARM.w / 2 - PIVOT) },
                { rotate: arm.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] }) },
                { translateX: ARM.w / 2 - PIVOT },
              ],
            },
          ]}
        >
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
        </Animated.View>
        <Animated.View
          style={[
            styles.wordmark,
            {
              opacity: word,
              transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
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
