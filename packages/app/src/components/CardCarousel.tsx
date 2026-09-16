import { Children, useState, type ReactNode } from 'react';
import {
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { font, radius, space, tabular } from '../theme';
import { makeStyles } from '../useTheme';

/**
 * A windowed, vertically-scrolling card list: shows `visibleCount` cards plus a
 * sliver of the next one, and draws its own position rail so a reader can see
 * how much list is left without scrolling to the end to find out.
 *
 * Why a nested scroller rather than a "show more" expander: the ask was a
 * vertical carousel — the ranking stays complete, it just stops owning the
 * whole page. The cost is real and worth stating: iOS does not chain an inner
 * ScrollView's momentum to its parent, so a drag that starts inside the window
 * and runs past the last card stops there rather than carrying the page on.
 * The window is kept deliberately short so there is always page above and below
 * it to grab instead.
 *
 * Row height is derived from measured content, never hardcoded: a PortRow's
 * height changes with its freshness badge and chip row, and a wrong constant
 * would park the peek in the middle of a card instead of at its edge.
 */

/** Only used for the first frame, before the content reports its real size. */
const ESTIMATED_ROW_HEIGHT = 92;
/** Visible sliver of the next card — the affordance that says "keep going". */
const PEEK = 22;
/** Below this the thumb stops reading as a thumb on a long list. */
const MIN_THUMB = 26;
/** Track and thumb share a width so the pill sits in its groove, not beside it. */
const RAIL_WIDTH = 5;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function CardCarousel({
  children,
  visibleCount = 4,
  gap = space.stackGap,
  unit = 'crossings',
}: {
  children: ReactNode;
  visibleCount?: number;
  gap?: number;
  unit?: string;
}) {
  const styles = useStyles();
  const items = Children.toArray(children);
  const total = items.length;

  const [contentHeight, setContentHeight] = useState(0);
  const [scroll, setScroll] = useState({ y: 0, layout: 0 });

  // Average row height. The rows are near-uniform, so an average places the
  // peek correctly without measuring each child individually.
  const rowHeight =
    contentHeight > 0 && total > 0
      ? (contentHeight - gap * (total - 1)) / total
      : ESTIMATED_ROW_HEIGHT;

  // visibleCount whole cards, the gaps between and after them, then the peek.
  const windowHeight = rowHeight * visibleCount + gap * visibleCount + PEEK;

  const scrollable = Math.max(0, contentHeight - scroll.layout);
  const progress = scrollable > 0 ? clamp(scroll.y / scrollable, 0, 1) : 0;

  // Thumb length is the proportion of the list on screen — the standard
  // scrollbar contract, so its size reads as "how much of the list this is".
  const thumbHeight =
    contentHeight > 0 && scroll.layout > 0
      ? Math.max(MIN_THUMB, (scroll.layout / contentHeight) * windowHeight)
      : windowHeight;
  const thumbTop = progress * (windowHeight - thumbHeight);

  // Cards fully above the window's bottom edge. The peeked card is deliberately
  // not counted — it is the "there is more" signal, not a row you can read.
  const shown =
    scroll.layout > 0
      ? clamp(Math.floor((scroll.y + scroll.layout + gap) / (rowHeight + gap)), 1, total)
      : Math.min(visibleCount, total);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    setScroll({ y: contentOffset.y, layout: layoutMeasurement.height });
  };

  return (
    <View>
      <View style={{ height: windowHeight, marginTop: 8 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.gutter, gap }}
          onScroll={onScroll}
          onLayout={(e) => {
            const { height } = e.nativeEvent.layout;
            setScroll((s) => (s.layout === height ? s : { ...s, layout: height }));
          }}
          onContentSizeChange={(_w, h) => setContentHeight(h)}
          scrollEventThrottle={16}
          // We draw our own rail; the platform one would sit on top of it.
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          // No rubber-band: on a nested scroller the bounce reads as the page
          // failing to move rather than as the list ending.
          bounces={false}
          aria-label={`${total} ${unit}, scrollable list`}
        >
          {items}
        </ScrollView>
        <View style={styles.rail}>
          <View
            style={[styles.thumb, { height: thumbHeight, transform: [{ translateY: thumbTop }] }]}
          />
        </View>
      </View>
      <Text style={styles.caption}>
        <Text style={tabular}>{shown}</Text> of <Text style={tabular}>{total}</Text> {unit}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ color }) => ({
  // Sits in the 20px gutter, clear of the cards themselves.
  rail: {
    position: 'absolute',
    // In style, not as a prop: react-native-web 0.21 deprecates the prop form.
    pointerEvents: 'none',
    right: 6,
    top: 0,
    bottom: 0,
    width: RAIL_WIDTH,
    borderRadius: radius.pill,
    backgroundColor: color.line,
  },
  /*
   * The `accent` role (cobalt in light, the lifted blue in dark), deliberately
   * — a second cobalt in the viewport alongside the hero. theme.ts's "one
   * cobalt per viewport" rule is real and this is a considered exception to
   * it, not an oversight: the thumb is the only moving element on the screen
   * and reads as inert in muted grey. It is `accent` rather than `cobalt`
   * because nothing sits on top of it — a mark, not a fill. Do not "restore"
   * this to a neutral without checking first.
   */
  thumb: { width: RAIL_WIDTH, borderRadius: radius.pill, backgroundColor: color.accent },
  caption: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    fontFamily: font.regular,
    color: color.muted,
  },
}));
