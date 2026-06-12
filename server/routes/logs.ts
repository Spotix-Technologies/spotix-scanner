/**
 * Spotix Scanner — Professional Event Check-in System
 * Copyright © 2026 Spotix Technologies. All rights reserved.
 *
 * This source code is proprietary and confidential.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited without the express written
 * permission of Spotix Technologies.
 *
 * For licensing inquiries, contact: legal@spotix.com.ng
 */

import type { FastifyInstance } from 'fastify';
import { pbGet, pbFilter } from '../db';
import type { Log } from '../types';

/**
 * Log routes.
 *
 * GET /api/logs?scannerId=<id>&limit=<n>
 *   Returns scan history for a specific scanner device (no cross-device leakage).
 *   Used by the scanner history page and admin logs view.
 */
export function registerLogRoutes(app: FastifyInstance): void {

  app.get<{ Querystring: { scannerId: string; limit?: string } }>('/api/logs', async (req, reply) => {
    const { scannerId, limit } = req.query;

    if (!scannerId?.trim()) {
      return reply.status(400).send({ error: 'scannerId query parameter is required' });
    }

    const safe      = scannerId.replace(/'/g, "\\'");
    const perPage   = Math.min(parseInt(limit ?? '200', 10) || 200, 500);
    const filterUrl = `/api/collections/logs/records?filter=${pbFilter(`scannerId='${safe}'`)}&sort=-timestamp&perPage=${perPage}`;

    const res = await pbGet(filterUrl);
    if (!res.ok) {
      console.error('[Server] GET /api/logs failed:', res.status, await res.text());
      return reply.status(500).send({ error: 'Failed to fetch logs' });
    }

    const data = await res.json() as { items: Log[] };
    return reply.send(data.items ?? []);
  });
}
