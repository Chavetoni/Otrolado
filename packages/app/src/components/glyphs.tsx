import type { ReactNode } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

/**
 * The icon family, locked (design system v2 §05).
 *
 * One family: 24px grid, 2px stroke, round caps and joins, `currentColor`,
 * outline only. Every glyph is built from the gate mark's vocabulary — flat
 * pitched roof angle, a stroke matching the barrier arm, hinge dots at 1.4r —
 * and strokes end on the grid at whole or half pixels. No filled variants, no
 * emoji, no second family: the logo is the only expressive mark in the product,
 * icons stay quiet. A toggled state (pinned, watching) is therefore carried by
 * COLOUR and by the button behind the glyph, never by filling it in.
 *
 * Paths for the eighteen spec glyphs are verbatim from the v2 sheet. The rest
 * (camera, pushpin, map pin, arrows, calendar, star, expand, plus/minus) are
 * the app's own, drawn to the same rules — Poppins has none of these as
 * characters, and a typed "⤢" or "−" fell back to the system font mid-label.
 *
 * Optical size in the app is 22–24px for standalone icons, 15–18px inline
 * with text, 12px inside a pill (where the stroke steps up to 2.4 so it still
 * reads as a line rather than a hair).
 */

interface GlyphProps {
  size?: number;
  color: string;
  /** 2 on the 24-grid; 2.4 at 12px pill size. */
  strokeWidth?: number;
}

function Glyph({
  size = 24,
  color,
  strokeWidth = 2,
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {children}
      </G>
    </Svg>
  );
}

/* ── The spec's eighteen ─────────────────────────────────────────────── */

/** "now" — a clock. Ages, leave-by times, the Plan tab. */
export function ClockGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.2V12l3.6 2.1" />
    </Glyph>
  );
}

export function MapGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M3.2 6.4 9 4.2l6 2.2 5.8-2.2v13.4L15 19.8l-6-2.2-5.8 2.2Z" />
      <Path d="M9 4.2v13.4" />
      <Path d="M15 6.4v13.4" />
    </Glyph>
  );
}

/** "alerts" — a bell. */
export function BellGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M18 9.5a6 6 0 1 0-12 0c0 5.2-2.2 6.8-2.2 6.8h16.4S18 14.7 18 9.5Z" />
      <Path d="M10.2 19.4a2.2 2.2 0 0 0 3.6 0" />
    </Glyph>
  );
}

/** "you" — a person. */
export function PersonGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Circle cx={12} cy={8.2} r={3.7} />
      <Path d="M4.8 20.2c0-3.9 3.2-5.9 7.2-5.9s7.2 2 7.2 5.9" />
    </Glyph>
  );
}

export function NavigateGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M12 3.6 20 20.4l-8-3.9-8 3.9Z" />
    </Glyph>
  );
}

/**
 * "crossing" — the booth with its arm, the mark itself as a glyph. The
 * Crossings tab, and the border half of a drive/border split.
 */
export function CrossingGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M4 20.2V10.4l5-3.4 5 3.4v9.8" />
      <Path d="M2.6 20.2h12.8" />
      <Path d="M14 13h6.5" />
      <Circle cx={14} cy={13} r={1.4} />
    </Glyph>
  );
}

/** "falling" — a wait that shortened. */
export function ArrowDownGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M12 4.8v14.4" />
      <Path d="M6.4 13.6 12 19.2l5.6-5.6" />
    </Glyph>
  );
}

/** "rising" — a wait that lengthened. */
export function ArrowUpGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M12 19.2V4.8" />
      <Path d="M6.4 10.4 12 4.8l5.6 5.6" />
    </Glyph>
  );
}

export function SearchGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Circle cx={10.8} cy={10.8} r={6.6} />
      <Path d="M15.6 15.6 20.4 20.4" />
    </Glyph>
  );
}

export function ChevronRightGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M9.5 5 16.5 12l-7 7" />
    </Glyph>
  );
}

export function RefreshGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M20.4 12a8.4 8.4 0 1 1-2.5-6" />
      <Path d="M20.4 4.2v4.4h-4.4" />
    </Glyph>
  );
}

/**
 * "offline" — a struck-through signal. The no-connection freshness state.
 * `compact` is the sheet's pill variant (§07): the two inner arcs drop out so
 * the glyph still reads at 12px.
 */
export function OfflineGlyph({ compact = false, ...p }: GlyphProps & { compact?: boolean }) {
  return (
    <Glyph {...p}>
      <Path d="M5.6 10.4a9 9 0 0 1 4.2-2.2" />
      {!compact && <Path d="M8.6 13.8a5 5 0 0 1 2-1.2" />}
      <Path d="M12 17.6h0.01" />
      {!compact && <Path d="M14.4 12.4a5 5 0 0 1 1.2 0.8" />}
      <Path d="M18.4 10.4a9 9 0 0 0-4-2.1" />
      <Path d="M3.8 4.4 20.2 20.4" />
    </Glyph>
  );
}

export function WarningGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M12 4 21.5 20.5H2.5Z" />
      <Path d="M12 10.5v3.8" />
      <Path d="M12 17.4h0.01" />
    </Glyph>
  );
}

/** "closed" — a lock. A closed lane or crossing; never a red dot alone. */
export function LockGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Rect x={4.6} y={10.6} width={14.8} height={9.6} rx={2.4} />
      <Path d="M8.2 10.6V7.8a3.8 3.8 0 0 1 7.6 0v2.8" />
    </Glyph>
  );
}

/** "vehicle". */
export function CarGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M3.8 15.2V11l1.8-4a2 2 0 0 1 1.8-1.2h9.2a2 2 0 0 1 1.8 1.2l1.8 4v4.2" />
      <Path d="M3.8 15.2h16.4v3.2H3.8Z" />
      <Path d="M7.4 11h9.2" />
    </Glyph>
  );
}

/** "pedestrian". */
export function WalkGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Circle cx={12} cy={4.9} r={2.1} />
      <Path d="M12 8.4v5.2" />
      <Path d="M8.4 10.4 12 9l3.6 1.4" />
      <Path d="M12 13.6 9.4 20.4" />
      <Path d="M12 13.6 14.6 20.4" />
    </Glyph>
  );
}

/** "port" — the plaza building. */
export function PortGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M4.4 19.6V9.2a2 2 0 0 1 1-1.7l5.6-3.2a2 2 0 0 1 2 0l5.6 3.2a2 2 0 0 1 1 1.7v10.4" />
      <Path d="M2.8 19.6h18.4" />
      <Path d="M9.6 19.6v-5.2h4.8v5.2" />
    </Glyph>
  );
}

/** "pattern" — rising bars. The typical-waits chart, the trend rules. */
export function PatternGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M4.4 19.2v-4.4" />
      <Path d="M9.6 19.2V9.6" />
      <Path d="M14.8 19.2v-7" />
      <Path d="M20 19.2V5.2" />
    </Glyph>
  );
}

/* ── The app's own, to the same rules ────────────────────────────────── */

/** Back arrow for headers. */
export function ArrowLeftGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M19 12H5" />
      <Path d="M11 6l-6 6 6 6" />
    </Glyph>
  );
}

/** "Opens elsewhere" — the maps hand-off and the webcam link. */
export function ArrowUpRightGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M7 17 17 7" />
      <Path d="M9 7h8v8" />
    </Glyph>
  );
}

/** Expand the map card to the full screen. */
export function ExpandGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M14 4h6v6" />
      <Path d="M20 4l-7 7" />
      <Path d="M10 20H4v-6" />
      <Path d="M4 20l7-7" />
    </Glyph>
  );
}

export function MinusGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M6 12h12" />
    </Glyph>
  );
}

export function PlusGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M12 6v12" />
      <Path d="M6 12h12" />
    </Glyph>
  );
}

export function CameraGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M3.5 8.5h3.4l1.8-2.5h6.6l1.8 2.5h3.4a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <Circle cx={12} cy={13.2} r={3.2} />
    </Glyph>
  );
}

/** A place on the map. Not `PushpinGlyph`, which is a choice. */
export function PinGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M12 21.5s-7-5.6-7-11.3A7 7 0 0 1 19 10.2c0 5.7-7 11.3-7 11.3z" />
      <Circle cx={12} cy={10} r={2.4} />
    </Glyph>
  );
}

/**
 * A tack — the "pin this crossing" action. Drawn on the family's grid (it
 * used to be a filled Material shape traced as an outline): a cap, a body
 * that flares to a flat shoulder like the booth's pitched roof, and the
 * needle. Outline only, like every glyph here; the pinned state is the colour
 * it is drawn in and the tile behind it.
 */
export function PushpinGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M8.6 3.6h6.8" />
      <Path d="M9.8 3.6v5.6L6.4 13.4h11.2L14.2 9.2V3.6" />
      <Path d="M12 13.4v7" />
    </Glyph>
  );
}

export function CalendarGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Rect x={3.5} y={5.5} width={17} height={15} rx={2.5} />
      <Path d="M3.5 10h17" />
      <Path d="M8 3.5v4" />
      <Path d="M16 3.5v4" />
    </Glyph>
  );
}

export function StarGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9L12 3.2z" />
    </Glyph>
  );
}

/* ── Appearance ───────────────────────────────────────────────────────── */

/** Light appearance — a sun: a disc and eight short rays. */
export function SunGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2.8v2.2M12 19v2.2M2.8 12h2.2M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M5.5 18.5l1.6-1.6M16.9 7.1l1.6-1.6" />
    </Glyph>
  );
}

/** Dark appearance — a crescent. */
export function MoonGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </Glyph>
  );
}
