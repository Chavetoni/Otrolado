import { StyleSheet, Text, View } from 'react-native';
import { peakAdvisory, type ForecastPoint } from '../peak';
import { color, font, radius, space } from '../theme';
import { ClockGlyph } from './glyphs';

/**
 * One-sentence peak advisory below the hero card (v4 change 2).
 *
 * Renders nothing unless a forecast series says something worth a sentence —
 * no filler copy, no card chrome around an absence. Today `forecast` is always
 * null (predictions need ~6 weeks of archive that is still being collected;
 * the detail screen shows CBP's previous-year averages in the meantime — see
 * TypicalCard, which is attributed history, not a forecast, and deliberately
 * NOT fed into this card), so this card is dormant until the /v1/forecast P50
 * series is wired through Home. The wiring point is the one prop; the logic
 * and copy are final in `peak.ts`.
 *
 * Deliberately plain: a clock and a sentence, no "AI" branding, no sparkles.
 * The claim is a historical pattern and the copy says "typically".
 */
export function PeakAdvisoryCard({
  portName,
  currentWait,
  forecast,
}: {
  portName: string;
  currentWait: number | null;
  forecast: readonly ForecastPoint[] | null;
}) {
  if (currentWait === null || forecast === null) return null;
  const advisory = peakAdvisory(portName, currentWait, forecast);
  if (!advisory) return null;

  return (
    <View style={styles.card}>
      <ClockGlyph size={16} color={color.navy} />
      <Text style={styles.text}>
        <Text style={{ fontFamily: font.semibold }}>{advisory.head}</Text> {advisory.body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.gutter,
    marginTop: space.stackGap,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.button,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  text: { flex: 1, fontSize: 12, fontFamily: font.regular, color: color.muted, lineHeight: 17 },
});
