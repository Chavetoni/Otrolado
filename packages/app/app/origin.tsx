import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeftGlyph, PinGlyph } from '../src/components/glyphs';
import { PLACES } from '../src/places';
import { setOriginPlace, useOrigin } from '../src/useOrigin';
import { color, font, radius, space } from '../src/theme';

/**
 * The starting-point picker.
 *
 * Reached from the origin chip on Crossings and Plan. It exists because the
 * origin is the one input the user owns and could not previously state: with
 * location off, someone in Brownsville was ranked from a valley centroid and
 * had no way to say otherwise.
 *
 * "Use my location" is first and is the only option that can fail — declining
 * the permission leaves the fallback in place, which the screen already names
 * — so it is offered rather than assumed. Choosing a town SUPPRESSES the GPS
 * read entirely (see `useOrigin`), which is the point: a user who tells us
 * where they are should not also be asked.
 *
 * A pushed screen, not a modal sheet: it is a short list that replaces the
 * whole context, and a stack screen keeps the back affordance the rest of the
 * app uses.
 */
export default function OriginPicker() {
  const insets = useSafeAreaInsets();
  const origin = useOrigin();

  const close = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const choose = (id: string | null): void => {
    setOriginPlace(id);
    close();
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={close}
            hitSlop={10}
            style={{ paddingVertical: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeftGlyph size={22} color={color.cobaltLight} />
          </Pressable>
          <Text style={styles.title}>Starting point</Text>
        </View>
        <Text style={styles.headerNote}>
          Every drive time, total and leave-by is measured from here.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: space.sectionGap,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        <View style={styles.card}>
          <Row
            label="Use my location"
            sub={
              origin.source === 'gps'
                ? `In use · nearest town ${origin.label}`
                : 'Asks for location permission'
            }
            selected={origin.source === 'gps'}
            onPress={() => choose(null)}
            showPin
          />
        </View>

        <Text style={styles.sectionLabel}>OR PICK A TOWN</Text>
        <View style={styles.card}>
          {PLACES.map((p, i) => (
            <Row
              key={p.id}
              label={p.label}
              selected={origin.place?.id === p.id}
              onPress={() => choose(p.id)}
              divider={i < PLACES.length - 1}
            />
          ))}
        </View>

        {/*
          The precision this list actually has, said once. Town centroids are
          the right granularity for a straight-line estimate (see places.ts) —
          claiming more would be claiming precision the drive model destroys
          two lines later.
        */}
        <Text style={styles.footnote}>
          Towns are approximate centre points. Drive times from any starting point are
          straight-line estimates, not routed ETAs.
        </Text>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  sub,
  selected,
  onPress,
  divider = false,
  showPin = false,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onPress: () => void;
  divider?: boolean;
  showPin?: boolean;
}) {
  return (
    <Pressable
      style={[styles.row, divider && styles.rowDivider]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      {showPin && <PinGlyph size={16} color={selected ? color.cobalt : color.muted} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowLabel, selected && { color: color.cobalt }]}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected && <View style={styles.checkDot} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.mist },
  header: {
    backgroundColor: color.navy,
    paddingHorizontal: space.gutter,
    paddingBottom: 16,
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 24, fontFamily: font.bold, color: color.surface, letterSpacing: -0.48 },
  headerNote: { fontSize: 12.5, fontFamily: font.regular, color: color.mutedOnDark, lineHeight: 18 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: font.semibold,
    letterSpacing: 1.1,
    color: color.muted,
    paddingHorizontal: space.gutter,
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: space.gutter,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: color.line },
  rowLabel: { fontSize: 14.5, fontFamily: font.semibold, color: color.navy },
  rowSub: { fontSize: 11.5, fontFamily: font.regular, color: color.muted },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: color.cobalt },
  checkDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.cobalt },
  footnote: {
    fontSize: 11,
    fontFamily: font.regular,
    color: color.muted,
    lineHeight: 16,
    paddingHorizontal: space.gutter,
    marginTop: 16,
  },
});
