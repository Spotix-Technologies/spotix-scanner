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
import { pbGet, getEventByEventId, setEventSyncing } from '../db';
import type { EventRecord } from '../db';

/**
 * Event management routes (used by the sync page and welcome page).
 *
 * GET  /api/events                     — list all imported events
 * POST /api/events/:eventId/lock       — set syncing=true (block check-ins)
 * POST /api/events/:eventId/unlock     — set syncing=false (resume check-ins)
 */
export function registerEventRecordRoutes(app: FastifyInstance): void {

  app.get('/api/events', async (_req, reply) => {
    const res = await pbGet('/api/collections/events/records?sort=-importedAt&perPage=50');
    if (!res.ok) return reply.status(500).send({ error: 'Failed to fetch events' });
    const data = await res.json() as { items: EventRecord[] };
    return reply.send(data.items ?? []);
  });

  app.post<{ Params: { eventId: string } }>('/api/events/:eventId/lock', async (req, reply) => {
    const ev = await getEventByEventId(req.params.eventId);
    if (!ev) return reply.status(404).send({ error: 'Event not found' });
    await setEventSyncing(ev.id, true);
    return reply.send({ success: true, syncing: true });
  });

  app.post<{ Params: { eventId: string } }>('/api/events/:eventId/unlock', async (req, reply) => {
    const ev = await getEventByEventId(req.params.eventId);
    if (!ev) return reply.status(404).send({ error: 'Event not found' });
    await setEventSyncing(ev.id, false);
    return reply.send({ success: true, syncing: false });
  });
}
