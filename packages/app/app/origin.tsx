import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeftGlyph, PinGlyph } from '../src/components/glyphs';
import { IconButton, SectionLabel } from '../src/components/ui';
import { borderCitiesNear, NEAR_MAX_MILES } from '../src/places';
import { usePorts } from '../src/queries';
import { setOriginPlace, useOrigin } from '../src/useOrigin';
import { font, radius, space } from '../src/theme';
import { makeStyles, useTheme } from '../src/useTheme';
import { caption, type } from '../src/typography';

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
  const { color } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const origin = useOrigin();
  const ports = usePorts();
  const borderCities = useMemo(
    () => borderCitiesNear(ports.data?.ports ?? [], origin),
    [ports.data, origin],
  );

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
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerRow}>
          <IconButton onDark onPress={close} accessibilityLabel="Back" style={styles.back}>
            <ArrowLeftGlyph size={24} color={color.cobaltLight} />
          </IconButton>
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
            label="Use my approximate location"
            sub={
              origin.source === 'gps'
                ? origin.near
                  ? `In use · nearest town ${origin.label}`
                  : `In use · no town below is within ${NEAR_MAX_MILES} mi`
                : 'Uses your device location; drive times stay approximate'
            }
            selected={origin.source === 'gps'}
            onPress={() => choose(null)}
            showPin
          />
        </View>

        <View style={styles.sectionHeader}>
          <SectionLabel>Cities near our crossings</SectionLabel>
          <Text style={styles.sectionNote}>
            {origin.isFallback ? 'near default start' : 'closest to you'}
          </Text>
        </View>
        <View style={styles.card}>
          {borderCities.map(({ place, nearestPort, borderMiles }, i) => (
            <Row
              key={place.id}
              label={place.label}
              sub={`${borderMiles < 1 ? '<1' : Math.round(borderMiles)} mi from ${nearestPort.displayName}`}
              selected={origin.place?.id === place.id}
              onPress={() => choose(place.id)}
              divider={i < borderCities.length - 1}
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
  const { color } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.rowPressed]}
      onPress={onPress}
      role="radio"
      aria-checked={selected}
    >
      {showPin && <PinGlyph size={20} color={selected ? color.accent : color.muted} />}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.rowLabel, selected && { color: color.accent }]}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected && <View style={styles.checkDot} />}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ color }) => ({
  screen: { flex: 1, backgroundColor: color.page },
  header: {
    backgroundColor: color.navy,
    paddingHorizontal: space.gutter,
    paddingBottom: space.cardPad,
    gap: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { marginLeft: -10 },
  title: { flex: 1, ...type.screenTitle, color: color.inkOnDark },
  headerNote: { fontSize: 13, lineHeight: 19, fontFamily: font.regular, color: color.mutedOnDark },

  sectionHeader: {
    paddingHorizontal: space.gutter,
    marginTop: space.sectionGap,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionNote: { ...caption, color: color.muted },
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
    gap: 12,
    paddingHorizontal: space.cardPad,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: color.line },
  rowPressed: { backgroundColor: color.inset },
  rowLabel: { ...type.cardTitle, color: color.ink },
  rowSub: { ...type.metadata, fontFamily: font.regular, color: color.muted },
  // The radio: 22px, 1.5px line-strong ring; accent ring and dot when chosen.
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: color.accent },
  checkDot: { width: 11, height: 11, borderRadius: 5.5, backgroundColor: color.accent },
  footnote: {
    ...caption,
    color: color.muted,
    paddingHorizontal: space.gutter,
    marginTop: space.sectionGap,
  },
}));
