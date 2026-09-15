/**
 * WCAG 2.x contrast ratio between two opaque hex colours. Test-only: the app
 * never computes contrast at runtime, it just must not ship a failing pair.
 * (Named `.test-helpers.ts` so vitest's `*.test.ts` glob does not run it.)
 */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string): number => {
    const h = hex.replace('#', '');
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ];
    const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal-size text. Every caveat in this app is normal-size text. */
export const AA = 4.5;
