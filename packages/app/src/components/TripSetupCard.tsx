import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Direction } from '@otrolado/shared';
import type { Origin } from '../useOrigin';
import { DIRECTIONS, type UiTravelMode } from '../modes';
import { font, radius, space } from '../theme';
import { caption, type } from '../typography';
import { makeStyles, useTheme } from '../useTheme';
import { useReduceMotion } from '../useReduceMotion';
import { ChevronRightGlyph, PinGlyph } from './glyphs';
import { SegmentedControl } from './ui';

/** The trip vocabulary people use, rather than the feed's lane vocabulary. */
const MODE_OPTIONS = [
  { value: 'passenger', label: 'Driving' },
  { value: 'pedestrian', label: 'Walking' },
] as const satisfies readonly { value: UiTravelMode; label: string }[];

function labelFor<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function originSourceLabel(origin: Origin): string {
  if (origin.source === 'chosen') return 'Chosen starting point';
  if (origin.source === 'gps') return origin.near ? 'Near your location' : 'Your location';
  return 'Approximate starting point';
}

/**
 * One summary control for the three inputs that shape every result on Home.
 * The detail controls live in a modal sheet so the page starts with the trip,
 * not a stack of configuration widgets.
 */
export function TripSetupCard({
  origin,
  direction,
  mode,
  onDirectionChange,
  onModeChange,
}: {
  origin: Origin;
  direction: Direction;
  mode: UiTravelMode;
  onDirectionChange: (direction: Direction) => void;
  onModeChange: (mode: UiTravelMode) => void;
}) {
  const { color } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);

  const directionLabel = labelFor(DIRECTIONS, direction);
  const modeLabel = labelFor(MODE_OPTIONS, mode);
  const openOrigin = (): void => {
    setOpen(false);
    router.push('/origin');
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => setOpen(true)}
        role="button"
        aria-expanded={open}
        aria-label={`Trip setup. Starting point ${origin.label}. ${directionLabel}. ${modeLabel}. Open trip settings.`}
      >
        <View style={styles.cardIcon} aria-hidden>
          <PinGlyph size={22} color={color.infoAccent} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.eyebrow}>Trip setup</Text>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {origin.label}
          </Text>
          <Text style={styles.cardSummary} numberOfLines={1}>
            {origin.isFallback ? 'Approx. · ' : ''}
            {directionLabel} · {modeLabel}
          </Text>
        </View>
        <ChevronRightGlyph size={20} color={color.muted} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'fade' : 'slide'}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modal}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setOpen(false)}
            accessible={false}
            aria-hidden
          />
          <View
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
            role="dialog"
            aria-label="Trip setup"
            aria-modal
            accessibilityViewIsModal
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <Text style={styles.sheetTitle}>Trip setup</Text>
                <Text style={styles.sheetNote}>Set what this page should compare.</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
                onPress={() => setOpen(false)}
                role="button"
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [styles.originRow, pressed && styles.originRowPressed]}
              onPress={openOrigin}
              role="button"
              aria-label={`${originSourceLabel(origin)}: ${origin.label}. Change starting point.`}
            >
              <View style={styles.originIcon} aria-hidden>
                <PinGlyph size={20} color={color.infoAccent} />
              </View>
              <View style={styles.originCopy}>
                <Text style={styles.fieldLabel}>Starting point</Text>
                <Text style={styles.originName} numberOfLines={1}>
                  {origin.label}
                </Text>
                <Text style={styles.originSource}>{originSourceLabel(origin)} · Tap to change</Text>
              </View>
              <ChevronRightGlyph size={20} color={color.muted} />
            </Pressable>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Direction</Text>
              <SegmentedControl
                options={DIRECTIONS}
                value={direction}
                onChange={onDirectionChange}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Travel mode</Text>
              <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={onModeChange} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const useStyles = makeStyles(({ color }) => ({
  card: {
    marginHorizontal: space.gutter,
    marginTop: space.sectionGap,
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: space.cardPad,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
  },
  cardPressed: { backgroundColor: color.inset },
  cardIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.iconTile,
  },
  cardCopy: { flex: 1, minWidth: 0, gap: 1 },
  eyebrow: { ...type.eyebrow, color: color.muted },
  cardTitle: { ...type.cardTitle, color: color.ink },
  cardSummary: { ...type.metadata, color: color.muted, flexShrink: 1 },

  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: color.navy,
    opacity: 0.56,
  },
  sheet: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingTop: 20,
    paddingHorizontal: space.gutter,
    gap: 20,
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: color.line,
  },
  sheetHeader: {
    minHeight: space.hitMin,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetHeading: { flex: 1, gap: 2 },
  sheetTitle: { ...type.screenTitle, color: color.ink },
  sheetNote: { ...caption, color: color.muted },
  done: {
    minWidth: 56,
    minHeight: space.hitMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  donePressed: { backgroundColor: color.inset },
  doneText: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.accent },

  originRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: color.inset,
    borderRadius: radius.md,
  },
  originRowPressed: { borderWidth: 1, borderColor: color.lineStrong, padding: 11 },
  originIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: color.surface,
  },
  originCopy: { flex: 1, minWidth: 0 },
  fieldLabel: { ...type.eyebrow, color: color.muted },
  originName: { ...type.cardTitle, color: color.ink },
  originSource: { ...caption, color: color.muted },
  field: { gap: 8 },
}));
