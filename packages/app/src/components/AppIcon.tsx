import { Image, StyleSheet } from 'react-native';

/**
 * The official Otrolado icon, as it appears inside the app (the header
 * lockups on Crossings and Plan). The same artwork as the home-screen icon,
 * the Android adaptive icon and the web favicon — all five are generated from
 * one master, `design/OtroladoIcon.png`, by `scripts/build-icons.py`. To change
 * the icon, replace the master and rerun the script; never edit an output.
 *
 * Rounded at the home-screen icon's own proportion (~22% of the side), so the
 * tile in the header reads as the icon the user just tapped. The rendered
 * lighting is the one gradient in the UI, on purpose: this is the brand mark,
 * which v2 exempts as "the only expressive mark in the product". Everything
 * else stays flat.
 *
 * NOT the launch splash: that animates the flat mark's gate arm (see
 * LaunchSplash), which a pre-rendered image cannot do.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ICON = require('../../assets/logo-tile.png');

/** The home-screen icon's corner, as a fraction of its side. */
const CORNER = 0.2237;

export function AppIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={ICON}
      style={[styles.icon, { width: size, height: size, borderRadius: Math.round(size * CORNER) }]}
      accessible
      aria-label="Otrolado"
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  // Clips the square render to the rounded corner on every platform.
  icon: { overflow: 'hidden' },
});
