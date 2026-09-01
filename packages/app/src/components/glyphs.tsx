import Svg, { Circle, Path } from 'react-native-svg';

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
