import type { FastifyInstance } from 'fastify';
import type { PortsResponse } from '@otrolado/shared';
import { db } from '../db/index.js';

export async function portsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Static port directory. Unauthenticated on purpose so the CDN can cache it
   * once for everyone; the app also ships a copy so first launch works offline.
   */
  app.get('/v1/ports', async (_req, reply) => {
    const rows = await db
      .selectFrom('ports')
      .selectAll()
      .orderBy('port_name')
      .orderBy('crossing_name')
      .execute();

    reply.header('cache-control', 'public, max-age=86400');
    const body: PortsResponse = {
      ports: rows.map((r) => ({
        id: r.id,
        crossingName: r.crossing_name,
        displayName: r.display_name,
        portName: r.port_name,
        border: r.border,
        lat: r.lat,
        lng: r.lng,
        feedTz: r.feed_tz,
        modes: r.modes,
        hours: { text: r.hours_text, open24h: r.open_24h },
        coordsApproximate: r.coords_approximate,
        routable: r.routable,
        webcamUrl: r.webcam_url,
        webcamLabel: r.webcam_label,
        lineStartLabel: r.line_start_label,
        lineStartLat: r.line_start_lat,
        lineStartLng: r.line_start_lng,
      })),
    };
    return body;
  });
}
