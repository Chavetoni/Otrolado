/**
 * Import CBP's historical hour-by-weekday wait averages into typical_waits.
 *
 * Source is the undocumented-but-public API behind bwt.cbp.gov/historical:
 *
 *   GET /api/historicalwaittimes/{bwtId}/{POV|PED|COV}/GEN/{month}/{day}
 *
 * Recovered from the site's JS bundle, so the contract is CBP's UI, not a
 * spec. Three verified quirks this script is shaped around:
 *
 *   - The lane path segment is a real filter: the same field (e.g.
 *     pv_time_avg) comes back slightly different under POV vs PED, because it
 *     restricts which underlying observations enter the average. So each mode
 *     is fetched with its own lane code and only that mode's columns are read
 *     from the response — exactly what CBP's own UI does.
 *   - `bwt_day` is 0 = Monday .. 6 = Sunday (per the site's dropdown ids);
 *     day=7 in the URL means "all days". We convert to ISO dow on write.
 *   - Lane classes a port does not have come back as all-zero series, not as
 *     absent fields. Stored as-is they would read "0 min" for a lane that
 *     does not exist, so an all-zero (mode, lane, month) is dropped. Per
 *     MONTH, not per year: a lane that existed for only part of the year (or
 *     a CBP collection gap) would otherwise keep zero months that render as
 *     real "0 min" data. A real lane with a genuinely zero month loses that
 *     month too — that fails toward "no typical data", never toward a wrong
 *     number.
 *
 * Scope is routable ports only: unlike wait history, this data is not lost by
 * waiting — it can be fetched for any port the day we expand.
 *
 * Idempotent: each port's rows are replaced in one transaction, so re-running
 * refreshes (CBP's "previous year" window rolls) and never duplicates.
 */
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/index.js';
import type { LaneType, TravelMode } from '@otrolado/shared';

const BWT_BASE = process.env['CBP_BWT_BASE_URL'] ?? 'https://bwt.cbp.gov';
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** CBP lane code per mode, and which response columns belong to that mode. */
const MODE_PLAN: Record<TravelMode, { cbpLane: string; columns: ReadonlyArray<readonly [LaneType, string]> }> = {
  passenger: {
    cbpLane: 'POV',
    columns: [
      ['standard', 'pv_time_avg'],
      ['nexus_sentri', 'xpv_time_avg'],
      ['ready', 'pv_ready_lanes_time_avg'],
    ],
  },
  pedestrian: {
    cbpLane: 'PED',
    columns: [
      ['standard', 'ped_time_avg'],
      ['ready', 'ped_ready_lanes_time_avg'],
    ],
  },
  commercial: {
    cbpLane: 'COV',
    columns: [
      ['standard', 'cv_time_avg'],
      ['fast', 'xcv_time_avg'],
    ],
  },
};

interface HistoricalRow {
  bwt_day: string;
  time_slot: string;
  [column: string]: string | null;
}

async function fetchJson(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error(`${url}: ${String(lastErr)}`);
}

/**
 * Our port ids are CBP's 6-digit port numbers; the historical API keys on an
 * 8-digit bwtId that prefixes a field-office code (230501 -> 07230501). The
 * mapping is not derivable, so resolve it from the site's own crossing list.
 */
async function resolveBwtIds(portIds: string[]): Promise<Map<string, string>> {
  const data = (await fetchJson(`${BWT_BASE}/api/bwtmodern/crossingslist`)) as {
    portCrossings?: Array<{ bwtId?: string }>;
  };
  const bwtIds = (data.portCrossings ?? []).map((c) => c.bwtId ?? '').filter(Boolean);
  const out = new Map<string, string>();
  for (const id of portIds) {
    const matches = bwtIds.filter((b) => b.endsWith(id));
    if (matches.length === 1) out.set(id, matches[0]!);
    else console.log(`  ! ${id}: ${matches.length} bwtId matches (${matches.join(', ') || 'none'}) — skipping`);
  }
  return out;
}

interface TypicalRow {
  port_id: string;
  mode: TravelMode;
  lane: LaneType;
  month: number;
  dow: number;
  hour: number;
  avg_wait_minutes: number;
}

const ports = await db
  .selectFrom('ports')
  .select(['id', 'display_name', 'modes'])
  .where('routable', '=', true)
  .orderBy('id')
  .execute();
if (ports.length === 0) throw new Error('No routable ports — run seed first.');

const bwtIds = await resolveBwtIds(ports.map((p) => p.id));

let totalRows = 0;
let emptyMonths = 0;
const droppedLanes: string[] = [];

for (const port of ports) {
  const bwtId = bwtIds.get(port.id);
  if (!bwtId) continue;

  // Keyed so a duplicate (day, slot) row in a response cannot violate the PK.
  const rows = new Map<string, TypicalRow>();
  const laneHasSignal = new Map<string, boolean>();

  for (const mode of port.modes) {
    const plan = MODE_PLAN[mode];
    const responses = await Promise.all(
      MONTHS.map((m) =>
        fetchJson(`${BWT_BASE}/api/historicalwaittimes/${bwtId}/${plan.cbpLane}/GEN/${m}/7`),
      ),
    );
    for (const [i, resp] of responses.entries()) {
      const month = MONTHS[i]!;
      const waitTimes = (resp as { wait_times?: HistoricalRow[] }).wait_times;
      if (!waitTimes || waitTimes.length === 0) {
        emptyMonths++;
        continue;
      }
      for (const r of waitTimes) {
        const cbpDay = Number(r.bwt_day);
        const hour = Number(r.time_slot);
        if (!Number.isInteger(cbpDay) || cbpDay < 0 || cbpDay > 6) continue;
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
        for (const [lane, column] of plan.columns) {
          // A null cell is CBP having no figure, which must stay a gap:
          // Number(null) is 0 and would render as "Typically 0 min".
          if (r[column] == null) continue;
          const avg = Number(r[column]);
          if (!Number.isFinite(avg) || avg < 0) continue;
          const laneKey = `${mode}/${lane}/${month}`;
          if (avg > 0) laneHasSignal.set(laneKey, true);
          else laneHasSignal.set(laneKey, laneHasSignal.get(laneKey) ?? false);
          rows.set(`${laneKey}/${cbpDay}/${hour}`, {
            port_id: port.id,
            mode,
            lane,
            month,
            dow: cbpDay + 1, // CBP 0=Monday -> ISO 1=Monday
            hour,
            avg_wait_minutes: Math.round(avg),
          });
        }
      }
    }
  }

  const kept = [...rows.values()].filter((r) =>
    laneHasSignal.get(`${r.mode}/${r.lane}/${r.month}`),
  );
  // Log per lane with a month count, not per lane-month — 16 fully-absent
  // lanes would otherwise print 192 lines.
  const droppedMonthsByLane = new Map<string, number>();
  for (const [laneKey, hasSignal] of laneHasSignal) {
    if (hasSignal) continue;
    const lane = laneKey.slice(0, laneKey.lastIndexOf('/'));
    droppedMonthsByLane.set(lane, (droppedMonthsByLane.get(lane) ?? 0) + 1);
  }
  for (const [lane, months] of droppedMonthsByLane) {
    droppedLanes.push(`${port.id} ${lane} (${months === 12 ? 'all' : months} month(s))`);
  }

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('typical_waits').where('port_id', '=', port.id).execute();
    for (let i = 0; i < kept.length; i += 1000) {
      await trx.insertInto('typical_waits').values(kept.slice(i, i + 1000)).execute();
    }
  });

  totalRows += kept.length;
  console.log(`  ${port.display_name}: ${kept.length} rows`);
}

const distinct = await db
  .selectFrom('typical_waits')
  .select([
    sql<string>`count(distinct port_id)`.as('ports'),
    sql<string>`count(*)`.as('rows'),
  ])
  .executeTakeFirstOrThrow();
console.log(`imported ${distinct.rows} typical-wait rows across ${distinct.ports} port(s)`);
if (emptyMonths > 0) console.log(`  ${emptyMonths} port-mode-month(s) had no historical data`);
if (droppedLanes.length > 0) {
  console.log('  dropped all-zero lane-months (lane absent at port, or absent those months):');
  for (const l of droppedLanes) console.log(`      ${l}`);
}
await closeDb();
