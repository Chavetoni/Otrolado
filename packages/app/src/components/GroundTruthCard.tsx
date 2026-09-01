import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Port } from '@otrolado/shared';
import { openDirections } from '../directions';
import { color, font, radius, space } from '../theme';
import { CameraGlyph, PinGlyph } from './glyphs';

/**
 * "Ground truth" card on the port detail screen (v4 change 4): what a person
 * standing there could tell you — a live camera on the queue, and where the
 * queue usually begins.
 *
 * Both rows are curated per port from official sources and both are nullable.
 * A port with no verified webcam gets NO row — not a disabled one — because a
 * row that promises a view and can't deliver is a fake source, the exact
 * failure this card exists to avoid. The whole card disappears when neither
 * row has data.
 *
 * The webcam is a link-out to the operator's page, never embedded video:
 * honest about whose camera it is, and Expo Go-safe (no native video module).
 *
 * The Route pill deep-links to the line-start coordinate — where the queue
 * usually ENDS for an arriving driver — rather than the port pin, which sits
 * mid-bridge past the very wait being measured (v4 change 5). The prototype
 * routes this through a Route sheet; the app's directions handoff is a direct
 * deep-link (see directions.ts), so the pill goes straight there. Shown only
 * when the coordinate is actually curated; a label without a coordinate
 * renders as information, not a button that would navigate somewhere else.
 */
export function GroundTruthCard({ port }: { port: Port }) {
  // `!= null`, not `!== null`: a /v1/ports response persisted from an app
  // version predating these fields deserializes them as undefined, and a
  // strict null check renders both rows with blank subtitles until the next
  // successful fetch. Undefined and null both mean "nothing curated here".
  const hasCam = port.webcamUrl != null;
  const hasLineStart = port.lineStartLabel != null;
  if (!hasCam && !hasLineStart) return null;

  const lineStartCoord =
    port.lineStartLat != null && port.lineStartLng != null
      ? { lat: port.lineStartLat, lng: port.lineStartLng }
      : null;

  return (
    <View style={styles.card}>
      {hasCam && (
        <Pressable
          style={styles.row}
          onPress={() => {
            // A failed open (no browser) is not worth crashing over.
            Linking.openURL(port.webcamUrl!).catch(() => {});
          }}
          accessibilityRole="link"
          accessibilityLabel={`Watch the line live: ${port.webcamLabel ?? 'webcam'}`}
        >
          <View style={styles.iconTile}>
            <CameraGlyph size={18} color={color.navy} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Watch the line live</Text>
            {port.webcamLabel && <Text style={styles.rowSub}>{port.webcamLabel}</Text>}
          </View>
          <Text style={styles.linkOut}>↗</Text>
        </Pressable>
      )}

      {hasCam && hasLineStart && <View style={styles.divider} />}

      {hasLineStart && (
        <View style={styles.row}>
          <View style={styles.iconTile}>
            <PinGlyph size={18} color={color.navy} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Line usually starts at</Text>
            <Text style={styles.rowSub}>{port.lineStartLabel}</Text>
          </View>
          {lineStartCoord && (
            <Pressable
              onPress={() => openDirections(lineStartCoord)}
              style={styles.routePill}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Navigate to the line start: ${port.lineStartLabel}`}
            >
              <Text style={styles.routePillText}>Route</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.gutter,
    marginTop: space.sectionGap,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  divider: { height: 1, backgroundColor: color.hairline, marginLeft: 60 },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: color.navyTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13.5, fontFamily: font.bold, color: color.ink },
  rowSub: { fontSize: 11, fontFamily: font.regular, color: color.secondary, lineHeight: 15 },
  linkOut: { fontSize: 14, fontFamily: font.bold, color: color.tertiary },
  routePill: {
    backgroundColor: color.chipBg,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  routePillText: { fontSize: 11.5, fontFamily: font.bold, color: color.navy },
});
