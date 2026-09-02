import type { FastifyInstance } from 'fastify';
import type { TypicalLane, TypicalResponse } from '@otrolado/shared';
import { db } from '../db/index.js';

/** Current calendar month (1-12) in the given zone; UTC if the zone is bad. */
function currentMonthIn(tz: string): number {
  try {
    const m = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(new Date()),
    );
    if (Number.isInteger(m) && m >= 1 && m <= 12) return m;
  } catch {
    // fall through
  }
  return new Date().getUTCMonth() + 1;
}

export async function typicalRoutes(app: FastifyInstance): Promise<void> {
  /**
   * CBP's previous-year hour-by-weekday averages for one crossing and month,
   * from the typical_waits table (see migration 011 and import-typical-waits).
   *
   * Same-for-everyone data like /v1/waits, so unauthenticated and CDN-cached —
   * but it only changes when the importer re-runs, so the TTL is an hour, not
   * 30 s. No freshness verdict here on purpose: these are not current numbers
   * and must never be judged (or rendered) as if they could be "live". The
   * `source` field is the contract's way of forcing attribution instead.
   */
  app.get<{ Params: { portId: string }; Querystring: { month?: string } }>(
    '/v1/typical/:portId',
    async (req, reply) => {
      const port = await db
        .selectFrom('ports')
        .select(['id', 'feed_tz'])
        .where('id', '=', req.params.portId)
        .executeTakeFirst();
      if (!port) return reply.code(404).send({ error: 'unknown port' });

      let month: number;
      if (req.query.month !== undefined) {
        month = Number(req.query.month);
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          return reply.code(400).send({ error: 'month must be 1-12' });
        }
      } else {
        // Port-local month, not server month: the averages describe hours at
        // the crossing, and near a month boundary those can disagree.
        month = currentMonthIn(port.feed_tz);
      }

      const rows = await db
        .selectFrom('typical_waits')
        .select(['mode', 'lane', 'dow', 'hour', 'avg_wait_minutes', 'imported_at'])
        .where('port_id', '=', port.id)
        .where('month', '=', month)
        .orderBy('mode')
        .orderBy('lane')
        .orderBy('dow')
        .orderBy('hour')
        .execute();

      const lanes: TypicalLane[] = [];
      let importedAt: Date | null = null;
      for (const r of rows) {
        if (importedAt === null || r.imported_at > importedAt) importedAt = r.imported_at;
        const last = lanes[lanes.length - 1];
        const cell = { dow: r.dow, hour: r.hour, avgWaitMinutes: r.avg_wait_minutes };
        if (last && last.mode === r.mode && last.lane === r.lane) {
          (last.cells as Array<typeof cell>).push(cell);
        } else {
          lanes.push({ mode: r.mode, lane: r.lane, cells: [cell] });
        }
      }

      reply.header('cache-control', 'public, max-age=3600');
      const body: TypicalResponse = {
        portId: port.id,
        month,
        source: 'cbp-previous-year-average',
        importedAt: importedAt ? importedAt.toISOString() : null,
        lanes,
      };
      return body;
    },
  );
}
