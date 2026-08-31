import type { Port } from './types.js';

/**
 * Pilot region: the Rio Grande Valley (Brownsville / Harlingen / McAllen).
 *
 * Ships in the app bundle so first launch works offline — the app's ports
 * query serves it as placeholder data until /v1/ports answers (see
 * packages/app/src/queries.ts) — and seeds `ports`.
 * CBP's feed carries no geodata, so coordinates come from OpenStreetMap: the
 * centroid of the named international bridge way, matched by name rather than
 * by proximity. Donna–Rio Bravo is the one exception — OSM has no named bridge
 * there, so its `barrier=border_control` node is used instead.
 *
 * One source and one rule for all eleven, deliberately. This is a ranking
 * product, so a consistent measurement across crossings matters more than
 * absolute precision at any single one — mixing surveyed plazas with bridge
 * centroids would put a systematic offset between rows that are meant to be
 * compared.
 *
 * Cross-checked against the US DOT / BTS "Border Crossing Entry Data" port
 * coordinates: the five single-bridge ports agree to five decimal places.
 * Multi-bridge ports differ by 7-13 km, as expected — BTS publishes one point
 * per port of entry, not per bridge.
 *
 * Still flagged `coordsApproximate`, and that flag stays until someone eyeballs
 * each plaza on satellite imagery. A bridge centroid sits mid-span, a few
 * hundred metres from where a northbound driver actually stops. That is fine
 * for the straight-line estimate in `drive.ts` and NOT fine for Google Routes,
 * which measures to the point we give it and would produce a confidently wrong
 * door-to-door number with nothing on screen to suggest anything is off.
 *
 * `id` is the CBP port_number, verified present and reporting in the live feed.
 * `modes` reflects what CBP actually reports at each crossing, not what the
 * bridge physically has.
 */
export const PILOT_REGION = {
  name: 'Rio Grande Valley',
  shortName: 'Rio Grande Valley, TX',
} as const;

/**
 * Ground-truth fields (webcam, queue line-start) are a curator research task,
 * per-port and verifiable-source-only. The UI hides the corresponding row for
 * a null field, so an entry missing here is a designed omission, not a bug.
 *
 * Surveyed 2026-08-31. Webcams: only the City of McAllen operates a usable
 * official public cam page (Hidalgo + Anzalduas, curated below). Recorded so
 * the rest aren't re-litigated: Pharr's city cam is live but points SOUTHBOUND
 * (wrong direction for this row); Donna's northbound cam is app-only ("Puente
 * Donna" app, no web URL); starrbridge.com/live-camera is a dead page serving
 * no stream; Cameron County (ccibstx.us), Progreso's operator and Roma have no
 * official cam; TxDOT PHR cams are US-side freeways with no stable per-camera
 * URL. Matamoros approaches (Gateway/B&M) are covered by two live cams from
 * COMTODO, a private local ISP — attributable but not an official operator, so
 * excluded under the current bar. McAllen's legacy per-camera iframe pages
 * (mcallen.net/IFrames/*.htm) are ActiveX and render nothing on any modern
 * browser — never link those, only the bridge-cameras landing page.
 *
 * Line-starts: nothing met the bar. Closest was Matamoros/B&M coverage of an
 * express-lane access at C. Sexta y Hidalgo (Milenio, 2023) — express-users
 * only, no coordinates, so not shipped as "the line usually starts" claim.
 */
const NO_GROUND_TRUTH = {
  webcamUrl: null,
  webcamLabel: null,
  lineStartLabel: null,
  lineStartLat: null,
  lineStartLng: null,
} as const;

export const PILOT_PORTS: readonly Port[] = [
  // ---- Cameron County (Brownsville / Los Indios) ----
  {
    id: '535504',
    crossingName: 'Gateway',
    displayName: 'Gateway Intl',
    portName: 'Brownsville',
    border: 'mexican',
    lat: 25.89837, lng: -97.49774,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'pedestrian'],
    hours: { text: '24 hrs/day', open24h: true },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },
  {
    id: '535501',
    crossingName: 'B&M',
    displayName: 'B&M Bridge',
    portName: 'Brownsville',
    border: 'mexican',
    lat: 25.89176, lng: -97.50439,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'pedestrian'],
    hours: { text: '24 hrs/day', open24h: true },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },
  {
    id: '535502',
    crossingName: 'Veterans International',
    displayName: 'Veterans Intl · Los Tomates',
    portName: 'Brownsville',
    border: 'mexican',
    lat: 25.88471, lng: -97.47643,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'pedestrian', 'commercial'],
    hours: { text: '6 am-Midnight', open24h: false },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },
  {
    id: '535503',
    crossingName: 'Los Indios',
    displayName: 'Free Trade Bridge · Los Indios',
    portName: 'Brownsville',
    border: 'mexican',
    lat: 26.03915, lng: -97.73714,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'commercial'],
    hours: { text: '6 am-10 pm', open24h: false },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },

  // ---- Hidalgo County (McAllen / Pharr / Mission / Donna) ----
  {
    id: '230501',
    crossingName: 'Hidalgo',
    displayName: 'McAllen–Hidalgo–Reynosa',
    portName: 'Hidalgo/Pharr',
    border: 'mexican',
    lat: 26.09536, lng: -98.27110,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'pedestrian'],
    hours: { text: '24 hrs/day', open24h: true },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
    // City-operated, states northbound ("FROM Mexico") coverage; live video,
    // no stated refresh cadence. The landing page carries the viewer link.
    webcamUrl: 'https://www.mcallen.net/bridge-cameras',
    webcamLabel: 'City of McAllen cam · Hidalgo Intl Bridge · live video',
  },
  {
    id: '230502',
    crossingName: 'Pharr',
    displayName: 'Pharr–Reynosa Intl',
    portName: 'Hidalgo/Pharr',
    border: 'mexican',
    lat: 26.07672, lng: -98.20349,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'commercial'],
    hours: { text: '6 am-Midnight', open24h: false },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },
  {
    id: '230503',
    crossingName: 'Anzalduas International Bridge',
    displayName: 'Anzalduas Intl',
    portName: 'Hidalgo/Pharr',
    border: 'mexican',
    lat: 26.10868, lng: -98.34958,
    feedTz: 'America/Chicago',
    modes: ['passenger'],
    hours: { text: '6 am-10 pm', open24h: false },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
    // Same City of McAllen page; its Anzalduas cams are the northbound approach.
    webcamUrl: 'https://www.mcallen.net/bridge-cameras',
    webcamLabel: 'City of McAllen cam · Anzalduas Intl Bridge · live video',
  },
  {
    id: '230902',
    crossingName: 'Donna International Bridge',
    displayName: 'Donna–Rio Bravo',
    portName: 'Progreso',
    border: 'mexican',
    lat: 26.05610, lng: -98.08327,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'pedestrian'],
    hours: { text: '6 am-10 pm', open24h: false },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },
  {
    id: '230901',
    crossingName: 'Progreso International Bridge',
    displayName: 'Progreso Intl',
    portName: 'Progreso',
    border: 'mexican',
    lat: 26.06185, lng: -97.94959,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'pedestrian', 'commercial'],
    hours: { text: '24 hrs/day', open24h: true },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },

  // ---- Starr County (Rio Grande City / Roma) ----
  {
    id: '230701',
    crossingName: 'Rio Grande City',
    displayName: 'Rio Grande City–Camargo',
    portName: 'Rio Grande City',
    border: 'mexican',
    lat: 26.36563, lng: -98.80270,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'commercial'],
    hours: { text: '7 am-11 pm', open24h: false },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },
  {
    id: '231001',
    crossingName: 'Roma',
    displayName: 'Roma–Cd. Miguel Alemán',
    portName: 'Roma',
    border: 'mexican',
    lat: 26.40386, lng: -99.01915,
    feedTz: 'America/Chicago',
    modes: ['passenger', 'commercial'],
    hours: { text: '24 hrs/day', open24h: true },
    coordsApproximate: true,
    routable: true,
    ...NO_GROUND_TRUTH,
  },
];

/**
 * CBP publishes duplicate records for three of these bridges under legacy port
 * numbers. The legacy rows sit permanently on "Update Pending" with no
 * update_time while their counterparts report live figures, so showing both
 * would list the same bridge twice — once with real data, once blank.
 *
 * Nothing consumes this list at runtime. The actual exclusion mechanism is the
 * seed: any crossing not in PILOT_PORTS — these included — is marked
 * `routable: false` (see packages/api/scripts/seed-ports.ts), and the app
 * ranks only routable ports. This export is documentation of WHICH feed ids
 * are duplicates and where their live counterparts are, so the mapping isn't
 * rediscovered the next time someone diffs the feed against the directory.
 * They are still archived — collection covers every crossing.
 */
export const SUPERSEDED_PORT_IDS: readonly string[] = [
  '230103', // legacy Gateway      -> 535504
  '230106', // legacy B&M Bridge   -> 535501
  '231002', // "ROMA TEXAS"        -> 231001
];

/** Fallback zone for crossings not yet in the directory. */
export const DEFAULT_TZ = 'America/Chicago';
