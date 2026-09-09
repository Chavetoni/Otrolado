import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The v4 cards' little icons, drawn once here. Stroke-only 24-unit viewboxes
 * scaled down, so they read at 12–16px without a dedicated icon font.
 */

export function ClockGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 7v5l3.2 2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CameraGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 8.5h3.4l1.8-2.5h6.6l1.8 2.5h3.4a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13.2} r={3.2} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/**
 * Pushpin for the favorites feature — deliberately not `PinGlyph`, which is a
 * MAP pin (a place). This one is a tack (a choice). `filled` is the pinned
 * state; the outline form is the affordance to pin.
 */
export function PushpinGlyph({
  size = 16,
  color,
  filled = false,
}: {
  size?: number;
  color: string;
  filled?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
        fill={filled ? color : 'none'}
        stroke={color}
        // Constant stroke: dropping it to 0 when filled shrank the silhouette
        // by the stroke's outward half, so the tack visibly jumped size on
        // every pin tap. Only the fill toggles — same as StarGlyph.
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PinGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21.5s-7-5.6-7-11.3A7 7 0 0 1 19 10.2c0 5.7-7 11.3-7 11.3z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={2.4} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/** Back arrow for dark headers. Poppins has no U+2190, so it is drawn, not typed. */
export function ArrowLeftGlyph({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12H5M11 6l-6 6 6 6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * "Opens elsewhere" arrow for the Directions hand-off. Poppins has no U+2197
 * either, so like the back arrow it is drawn rather than typed — a typed one
 * fell back to the system font mid-label.
 */
export function ArrowUpRightGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 17L17 7M9 7h8v8"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * The mockup layout's icon set. Same stroke-only 24-unit convention as above.
 */

export function ChevronRightGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5l7 7-7 7"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function NavigateGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 3L3 10.5l8 2.5 2.5 8L21 3z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BellGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3c-3 0-5 2.2-5 5v3.2L5.5 15h13L17 11.2V8c0-2.8-2-5-5-5z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M10 18a2 2 0 0 0 4 0" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CarGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 16v-3.2l1.8-4.3A2 2 0 0 1 7.1 7h9.8a2 2 0 0 1 1.8 1.5l1.8 4.3V16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M3.5 13h17" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={7.5} cy={16.5} r={1.6} stroke={color} strokeWidth={2} />
      <Circle cx={16.5} cy={16.5} r={1.6} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function WalkGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={13} cy={4.4} r={1.9} stroke={color} strokeWidth={2} />
      <Path
        d="M13 8.2l-3 2v4M13 8.2l2.6 1.8 1.6 2.6M10 14.2L8 21M13.4 13.6L15 21"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MapGlyph({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 4.5L3.5 6.6v12.9L9 17.4l6 2.1 5.5-2.1V4.5L15 6.6 9 4.5z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M9 4.5v12.9M15 6.6v12.9" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CalendarGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={5.5} width={17} height={15} rx={2.5} stroke={color} strokeWidth={2} />
      <Path
        d="M3.5 10h17M8 3.5v4M16 3.5v4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function StarGlyph({
  size = 20,
  color,
  filled = false,
}: {
  size?: number;
  color: string;
  filled?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9L12 3.2z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Rising bars — the "another crossing is faster" rule and the trend advisory. */
export function TrendGlyph({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 19v-5M12 19V8M19 19V4"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Downward arrow — a wait that improved. */
export function ArrowDownGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4v15M6 13.5l6 6 6-6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function WarningGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.8L21 19.5H3L12 3.8z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M12 9.6v4.2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={12} cy={16.6} r={1.05} fill={color} />
    </Svg>
  );
}

/**
 * The bridge the Crossings tab is named for. Replaces the three stacked bars,
 * which read as a generic list rather than as a border crossing.
 */
export function BridgeGlyph({ size = 21, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 16.5V13M21.5 16.5V13M2.5 13c4 0 5.5-3.5 9.5-3.5s5.5 3.5 9.5 3.5"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8 16.5v-4.1M12 16.5V9.5M16 16.5v-4.1M2 19.5h20"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}
