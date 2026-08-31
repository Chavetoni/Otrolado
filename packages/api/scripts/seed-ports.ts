/**
 * Seed the port directory from the live CBP feed, then overlay curated data.
 *
 * Two tiers on purpose:
 *   - Every crossing CBP reports gets a row, so ingest can archive it. Name,
 *     border and hours come from the feed; timezone is inferred from the
 *     feed's own local timestamps; coordinates are unknown.
 *   - Pilot-region crossings are then overlaid with curated values (display
 *     names, coordinates, mode lists) and marked routable.
 */
import { PILOT_PORTS, type TravelMode } from '@otrolado/shared';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/index.js';
import { config } from '../src/config.js';
import { firstUpdateTime, inferTimezone } from '../src/ingest/infer-tz.js';
import type { RawCbpPort } from '../src/ingest/cbp-parse.js';

const fetchedAt = new Date();
const res = await fetch(config.cbpFeedUrl, { headers: { accept: 'application/json' } });
if (!res.ok) throw new Error(`CBP feed returned HTTP ${res.status}`);
const feed = (await res.json()) as RawCbpPort[];

/** Which modes a crossing actually has, judged by whether CBP ever reports them. */
function modesFor(raw: RawCbpPort): TravelMode[] {
  const pairs: ReadonlyArray<readonly [keyof RawCbpPort & string, TravelMode]> = [
    ['passenger_vehicle_lanes', 'passenger'],
    ['pedestrian_lanes', 'pedestrian'],
    ['commercial_vehicle_lanes', 'commercial'],
  ];
  const out: TravelMode[] = [];
  for (const [key, mode] of pairs) {
    const group = raw[key] as Record<string, unknown> | undefined;
    if (!group) continue;
    const present = Object.values(group).some(
      (v) =>
        v && typeof v === 'object' && 'operational_status' in v &&
        !['n/a', ''].includes(
          String((v as { operational_status?: string }).operational_status ?? '').trim().toLowerCase(),
        ),
    );
    if (present) out.push(mode);
  }
  return out;
}

let inferred = 0;
let ambiguous = 0;
const skipped: string[] = [];
const rows = [];

for (const raw of feed) {
  const tzResult = inferTimezone({
    date: raw.date,
    time: raw.time,
    abbreviationHint: firstUpdateTime(raw as unknown as Record<string, unknown>),
    fetchedAt,
  });
  if (!tzResult) {
    // No zone fits: writing this row would mean guessing, and a guessed zone
    // shifts every timestamp for the crossing by whole hours.
    skipped.push(`${raw.port_number} ${raw.port_name}/${raw.crossing_name}`);
    continue;
  }
  inferred++;
  if (tzResult.ambiguous) ambiguous++;

  const hours = (raw.hours ?? '').trim();
  rows.push({
    id: raw.port_number,
    crossing_name: raw.crossing_name,
    display_name: `${raw.port_name} · ${raw.crossing_name}`,
    port_name: raw.port_name,
    border: raw.border.toLowerCase().includes('canad') ? ('canadian' as const) : ('mexican' as const),
    lat: null,
    lng: null,
    feed_tz: tzResult.tz,
    feed_tz_source: 'inferred' as const,
    feed_tz_ambiguous: tzResult.ambiguous,
    routable: false,
    modes: modesFor(raw) as never,
    hours_text: hours,
    open_24h: /24\s*hrs?/i.test(hours),
    coords_approximate: true,
  });
}

await db
  .insertInto('ports')
  .values(rows)
  .onConflict((oc) =>
    oc.column('id').doUpdateSet((eb) => ({
      crossing_name: eb.ref('excluded.crossing_name'),
      port_name: eb.ref('excluded.port_name'),
      border: eb.ref('excluded.border'),
      modes: eb.ref('excluded.modes'),
      hours_text: eb.ref('excluded.hours_text'),
      open_24h: eb.ref('excluded.open_24h'),
      updated_at: new Date(),
      // Provenance decides, rather than a blanket "never overwrite": curated
      // values must survive a reseed, but a re-inferred value must be free to
      // CORRECT an earlier bad inference. A blanket skip pins mistakes in place.
      feed_tz: sql`CASE WHEN ports.feed_tz_source = 'curated'
                        THEN ports.feed_tz ELSE excluded.feed_tz END`,
      feed_tz_ambiguous: sql`CASE WHEN ports.feed_tz_source = 'curated'
                                  THEN ports.feed_tz_ambiguous
                                  ELSE excluded.feed_tz_ambiguous END`,
      // Coordinates and display names stay curated-only; the feed has neither.
    })),
  )
  .execute();

// Retire crossings that were curated for a previous pilot region. Without
// this, switching regions leaves the old ones routable and they keep showing
// up in the app alongside the new ones.
await db
  .updateTable('ports')
  .set({ routable: false, feed_tz_source: 'inferred', updated_at: new Date() })
  .where('id', 'not in', PILOT_PORTS.map((p) => p.id))
  .where('routable', '=', true)
  .execute();

// Overlay curated pilot-region data on top.
for (const p of PILOT_PORTS) {
  await db
    .updateTable('ports')
    .set({
      display_name: p.displayName,
      lat: p.lat,
      lng: p.lng,
      feed_tz: p.feedTz,
      feed_tz_source: 'curated',
      feed_tz_ambiguous: false,
      routable: p.routable,
      coords_approximate: p.coordsApproximate,
      webcam_url: p.webcamUrl,
      webcam_label: p.webcamLabel,
      line_start_label: p.lineStartLabel,
      line_start_lat: p.lineStartLat,
      line_start_lng: p.lineStartLng,
      updated_at: new Date(),
    })
    .where('id', '=', p.id)
    .execute();
}

console.log(`seeded ${rows.length} crossing(s) from the feed`);
console.log(`  timezone inferred for ${inferred}${ambiguous > 0 ? `, ${ambiguous} ambiguous` : ''}`);
console.log(`  curated overlay applied to ${PILOT_PORTS.length} pilot crossing(s)`);
if (skipped.length > 0) {
  console.log(`  ! skipped ${skipped.length} with an unresolvable timezone:`);
  for (const s of skipped) console.log(`      ${s}`);
}
await closeDb();
