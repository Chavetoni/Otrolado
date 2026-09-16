import { setScheme, useTheme } from '../useTheme';
import { MoonGlyph, SunGlyph } from './glyphs';
import { IconButton } from './ui';

/**
 * The appearance button: one 44pt icon button in the tab headers that switches
 * between light and dark — two answers, no automatic third. The glyph shows
 * the CURRENT appearance (a sun or a moon), and the label says both the
 * current one and what a tap will do.
 *
 * A glyph in `muted`, not the accent: this is a preference, not the screen's
 * one most tappable thing.
 */
export function ThemeToggle() {
  const { color, scheme } = useTheme();
  const next = scheme === 'dark' ? 'light' : 'dark';
  const Glyph = scheme === 'dark' ? MoonGlyph : SunGlyph;
  return (
    <IconButton
      onPress={() => setScheme(next)}
      accessibilityLabel={`Appearance: ${scheme}. Switch to ${next}.`}
    >
      <Glyph size={22} color={color.muted} />
    </IconButton>
  );
}
