import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { ExpandHint, Legend, LEGEND_BOTTOM, ModeChip } from './MapChrome';
import {
  PIN,
  PIN_H_NAMED,
  PIN_TIP,
  pinColor,
  pinLabel,
  pinName,
  pinShowsName,
  pinTextColor,
  pinZIndex,
} from './map-pin';
import { boundsOf } from '../map-bounds';
import type { RankedPort } from '../ranking';
import type { Origin } from '../useOrigin';
import { font, radius, space, type Theme } from '../theme';
import { makeStyles, useTheme } from '../useTheme';
// Type-only, so Babel erases it and this file never pulls react-native-maps
// into the web bundle. tsc resolves the specifier to the native file, which
// holds the one declaration of the props both platforms implement.
import type { CrossingsMapProps } from './CrossingsMap';

/**
 * Web build of the inline Crossings map card: Leaflet + OpenStreetMap tiles.
 *
 * react-native-maps has no web renderer, so Metro's platform resolution swaps
 * this file in — the native bundle never sees Leaflet and this file never
 * loads react-native-maps. Free OSM tiles, no API key.
 *
 * Leaflet arrives at runtime from cdnjs rather than npm, so the app's
 * node_modules stay native-safe; the script/CSS pair is injected once per page.
 * Everything a pin says comes from `map-pin.ts`, shared with the native map, so
 * the two cannot drift apart.
 *
 * NOTE: adding this file while Metro is already running does not always
 * invalidate the cached resolution of `./CrossingsMap` in an open tab. If the
 * card renders as react-native-maps (i.e. blank) on web, restart with --clear.
 */

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.min.css`;
const LEAFLET_JS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.min.js`;

/** The prototype's map card: `height:260px`. */
const MAP_HEIGHT = 260;

/**
 * Full screen only: the route floats a back control over the map's top-left
 * corner, so Leaflet's zoom buttons drop below it instead of under it. Leaflet
 * only places controls in the four corners, and every other corner is taken —
 * mode chip, legend, attribution.
 */
const ZOOM_CONTROL_TOP = 52;

/**
 * OpenStreetMap only serves light tiles. In dark the tile pane — and ONLY the
 * tile pane, never the marker pane where the pins carry their own palette —
 * is inverted and hue-rotated back so land stays land-coloured, then dimmed
 * and desaturated to sit under dark chrome. Toggled by a class on the map's
 * container so the rule is injected once and the scheme just flips the class.
 */
const DARK_MAP_CLASS = 'otrolado-map-dark';
const DARK_MAP_STYLE_ID = 'otrolado-map-dark-style';
const DARK_MAP_CSS = `.${DARK_MAP_CLASS} .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.8); }`;

function ensureDarkTileStyle(): void {
  if (document.getElementById(DARK_MAP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DARK_MAP_STYLE_ID;
  style.textContent = DARK_MAP_CSS;
  document.head.appendChild(style);
}

/* Leaflet is loaded from a CDN, so `window.L` is untyped by design — this is
 * the one boundary where `any` is accepted rather than adding @types. */
type Leaflet = any;

let leafletPromise: Promise<Leaflet> | null = null;

function loadLeaflet(): Promise<Leaflet> {
  // Idempotent, and ahead of the early return so a hot reload that finds
  // Leaflet already on the page still has the dark tile rule.
  ensureDarkTileStyle();
  const existing = (globalThis as { L?: Leaflet }).L;
  if (existing) return Promise.resolve(existing);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise<Leaflet>((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => {
      const L = (globalThis as { L?: Leaflet }).L;
      if (L) resolve(L);
      else reject(new Error('Leaflet script loaded but window.L is missing'));
    };
    script.onerror = () => {
      // Allow a retry on remount rather than caching the failure forever.
      leafletPromise = null;
      reject(new Error('Leaflet failed to load from cdnjs'));
    };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

/** Crossing names are our own curated data, but a pin is still not a place for raw HTML. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * The prototype's pin, as a Leaflet divIcon: a coloured bubble carrying the
 * wait in tabular numerals, a caret, and the short crossing name beneath.
 */
function pinIcon(L: Leaflet, row: RankedPort, t: Theme): Leaflet {
  const { color } = t;
  const fill = pinColor(row, t);
  const fg = pinTextColor(row, t);
  const showName = pinShowsName(row);
  const nameHtml = showName
    ? `<div style="margin-top:${PIN.nameGap}px;height:${PIN.nameH}px;line-height:${PIN.nameH}px;font-family:${font.semibold},system-ui,sans-serif;font-size:9px;color:${color.ink};background:${color.overlay};border-radius:${radius.sm}px;padding:0 6px;white-space:nowrap">${escapeHtml(pinName(row))}</div>`
    : '';
  return L.divIcon({
    className: '',
    // Width is unconstrained so long names are not clipped; iconAnchor is what
    // places the caret tip on the crossing, and is the same either way.
    iconSize: [0, showName ? PIN_H_NAMED : PIN_TIP],
    iconAnchor: [0, PIN_TIP],
    html: `
      <div style="position:absolute;left:0;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;cursor:pointer">
        <div style="height:${PIN.bubbleH}px;display:flex;align-items:center;background:${fill};color:${fg};border-radius:${radius.pill}px;padding:0 8px;font-family:${font.bold},system-ui,sans-serif;font-size:13px;font-variant-numeric:tabular-nums;border:1px solid ${color.surface};white-space:nowrap">${escapeHtml(pinLabel(row))}</div>
        <div style="width:0;height:0;border-left:${PIN.caretW / 2}px solid transparent;border-right:${PIN.caretW / 2}px solid transparent;border-top:${PIN.caretH}px solid ${fill}"></div>
        ${nameHtml}
      </div>`,
  });
}

export default function CrossingsMap({
  rows,
  origin,
  modeLabel,
  variant = 'card',
  onExpand,
  insetBottom = 0,
}: CrossingsMapProps) {
  const t = useTheme();
  const styles = useStyles();
  const bounds = useMemo(() => boundsOf(rows, origin), [rows, origin]);
  const isCard = variant === 'card';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet>(null);
  const pinsRef = useRef<Leaflet>(null);
  const didFitRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);

  /*
   * The basemap click handler is registered once at init, so it reads the
   * latest callback through a ref rather than re-binding on every render.
   * Leaflet does not raise a map click for a click a marker handled, so pin
   * taps still open that crossing.
   */
  const onExpandRef = useRef(onExpand);
  onExpandRef.current = onExpand;

  // Init once: inject Leaflet, create the map, add OSM tiles.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        // Gesture options are creation-time in Leaflet. `variant` is fixed for
        // the life of a mount (the card and the full screen are separate
        // routes), so it never needs to change them afterwards.
        const map = L.map(containerRef.current, {
          // The card sits inside the Home ScrollView, where a pannable map
          // swallows the page scroll — so it stays static and a click opens
          // the full screen, which pans and zooms freely.
          dragging: !isCard,
          touchZoom: !isCard,
          scrollWheelZoom: !isCard,
          doubleClickZoom: !isCard,
          boxZoom: !isCard,
          keyboard: !isCard,
          zoomControl: !isCard,
        });
        if (isCard) {
          map.on('click', () => onExpandRef.current?.());
          // Leaflet leaves the grab cursor on a dragging:false map.
          map.getContainer().style.cursor = 'pointer';
        } else {
          map.zoomControl.getContainer().style.marginTop = `${ZOOM_CONTROL_TOP}px`;
        }
        // OSM's licence requires visible attribution. Bottom-left is the one
        // corner the mode chip and the legend leave free.
        map.attributionControl.setPosition('bottomleft');
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        pinsRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) setCdnFailed(true);
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pinsRef.current = null;
      setMapReady(false);
    };
  }, []);

  // The dark tile filter rides a class on the container (see DARK_MAP_CSS).
  // `classList`, not the `className` prop: Leaflet adds its own classes to
  // this element and a React-managed className would overwrite them.
  useEffect(() => {
    containerRef.current?.classList.toggle(DARK_MAP_CLASS, t.scheme === 'dark');
  }, [t.scheme]);

  // Redraw pins and refit whenever the ranked rows (or the origin) change —
  // or the theme, since the pins are baked into divIcon HTML.
  useEffect(() => {
    const L = (globalThis as { L?: Leaflet }).L;
    const map = mapRef.current;
    const pins = pinsRef.current;
    if (!mapReady || !L || !map || !pins || !bounds) return;
    pins.clearLayers();

    for (const row of rows) {
      const { lat, lng } = row.port;
      if (lat === null || lng === null) continue;
      pins.addLayer(
        L.marker([lat, lng], {
          icon: pinIcon(L, row, t),
          zIndexOffset: pinZIndex(row) * 100,
        }).on('click', () => router.push(`/port/${row.port.id}`)),
      );
    }

    // Origin: solid cobalt only when it is really the device's position. The
    // permission-denied fallback renders hollow and says what it is.
    pins.addLayer(
      L.circleMarker(
        [origin.lat, origin.lng],
        origin.isFallback
          ? { radius: 7, color: t.color.muted, weight: 2, fillOpacity: 0 }
          : { radius: 7, color: t.color.onAccent, weight: 2.5, fillColor: t.color.accent, fillOpacity: 1 },
      ).bindTooltip(
        origin.isFallback
          ? 'Approximate starting point — location off, not GPS'
          : 'Your location',
      ),
    );

    // The card re-fits whenever the ranking changes. The full screen fits once
    // and then leaves the view alone — refitting on every poll would yank the
    // map out from under someone who had panned away.
    if (isCard || !didFitRef.current) {
      didFitRef.current = true;
      map.fitBounds(
        [
          [bounds.minLat, bounds.minLng],
          [bounds.maxLat, bounds.maxLng],
        ],
        // Pins grow upward from their coordinate, so the top needs clearance
        // for a bubble; the sides only need enough for it to not be clipped.
        { paddingTopLeft: [22, PIN_TIP + 6], paddingBottomRight: [22, 20] },
      );
    }
  }, [mapReady, rows, origin, bounds, isCard, t]);

  if (!bounds) return null;

  if (cdnFailed) {
    return (
      <View style={[isCard ? styles.card : styles.full, styles.fallback]}>
        <Text style={styles.fallbackTitle}>Map unavailable</Text>
        <Text style={styles.fallbackBody}>
          Leaflet loads from cdnjs at runtime and didn’t arrive — likely no network. The
          ranked list has the same waits and drive estimates.
        </Text>
      </View>
    );
  }

  return (
    <View style={isCard ? styles.card : styles.full}>
      {createElement('div', {
        ref: containerRef,
        style: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
      })}
      <ModeChip label={modeLabel} />
      <Legend bottom={LEGEND_BOTTOM + insetBottom} />
      {isCard && onExpand ? <ExpandHint onPress={onExpand} /> : null}
    </View>
  );
}

const useStyles = makeStyles(({ color }) => {
  const frame = {
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.line,
  };
  return {
    card: {
      ...frame,
      marginHorizontal: space.gutter,
      marginTop: space.sectionGap,
      height: MAP_HEIGHT,
    },
    full: { ...frame, flex: 1, borderRadius: 0, borderWidth: 0 },
    fallback: { justifyContent: 'center', padding: space.cardPad, gap: 4, backgroundColor: color.surface },
    fallbackTitle: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.ink },
    fallbackBody: { fontSize: 13, lineHeight: 19, fontFamily: font.regular, color: color.muted },
  };
});
