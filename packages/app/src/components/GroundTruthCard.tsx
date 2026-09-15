import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Port } from '@otrolado/shared';
import { color, font, radius, space } from '../theme';
import { caption } from '../typography';
import { ArrowUpRightGlyph, CameraGlyph, PinGlyph } from './glyphs';

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
 * This row is INFORMATION ONLY. It used to carry a "Route" pill deep-linking
 * to the line-start coordinate; navigation now lives in the screen's entrance
 * row at the top, which routes to that same coordinate when it is curated.
 * Two buttons to the same place, one of them below the fold, was a choice
 * nobody needed to make — and the top row is where someone looks for "where do
 * I drive to".
 */
export function GroundTruthCard({ port }: { port: Port }) {
  // `!= null`, not `!== null`: a /v1/ports response persisted from an app
  // version predating these fields deserializes them as undefined, and a
  // strict null check renders both rows with blank subtitles until the next
  // successful fetch. Undefined and null both mean "nothing curated here".
  const hasCam = port.webcamUrl != null;
  const hasLineStart = port.lineStartLabel != null;
  if (!hasCam && !hasLineStart) return null;

  return (
    <View style={styles.card}>
      {hasCam && (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            // A failed open (no browser) is not worth crashing over.
            Linking.openURL(port.webcamUrl!).catch(() => {});
          }}
          role="link"
          aria-label={`Watch the line live: ${port.webcamLabel ?? 'webcam'}. Opens the operator's page`}
        >
          <View style={styles.iconTile}>
            <CameraGlyph size={20} color={color.navy} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Watch the line live</Text>
            {port.webcamLabel && <Text style={styles.rowSub}>{port.webcamLabel}</Text>}
          </View>
          <ArrowUpRightGlyph size={16} color={color.muted} />
        </Pressable>
      )}

      {hasCam && hasLineStart && <View style={styles.divider} />}

      {hasLineStart && (
        <View style={styles.row} accessible>
          <View style={styles.iconTile}>
            <PinGlyph size={20} color={color.navy} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Line usually starts at</Text>
            <Text style={styles.rowSub}>{port.lineStartLabel}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const TILE = 36;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.gutter,
    marginTop: space.sectionGap,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    // Clips the pressed row's mist fill to the card's rounded corners.
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.cardPad,
    paddingVertical: 12,
    minHeight: 60,
  },
  rowPressed: { backgroundColor: color.mist },
  divider: { height: 1, backgroundColor: color.line, marginLeft: space.cardPad + TILE + 12 },
  iconTile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.sm,
    backgroundColor: color.infoTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.navy },
  rowSub: { ...caption, color: color.muted },
});
