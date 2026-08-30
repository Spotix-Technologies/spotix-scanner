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
import {
  connectedScanners, blockedScanners, broadcast,
  getActiveEvent, setActiveEvent, clearActiveEvent,
} from '../state';
import { invalidateToken } from '../db';
import type { ActiveEventInfo } from '../types';

/**
 * Event lifecycle + lobby "Start"/"Stop" controls.
 *
 * GET  /api/event/active       — the event currently being scanned (or null)
 * POST /api/event/active       — lobby "Start": begin scanning for an event
 * POST /api/event/active/stop  — lobby "Stop": stop scanning entirely
 * POST /api/event/end          — fully end the event session (existing)
 */
export function registerEventRoutes(app: FastifyInstance): void {

  // ── Active event (broadcasting) state ──────────────────────────────────────

  app.get('/api/event/active', async (_req, reply) => {
    return reply.send({ active: getActiveEvent() });
  });

  app.post<{ Body: ActiveEventInfo }>('/api/event/active', async (req, reply) => {
    const { eventId, eventName, pbId } = req.body ?? {};
    if (!eventId || !pbId) {
      return reply.status(400).send({ error: 'eventId and pbId are required' });
    }

    const active: ActiveEventInfo = { eventId, eventName: eventName ?? '', pbId };
    setActiveEvent(active);

    broadcast({ type: 'active_event_changed', payload: { active } });
    return reply.send({ success: true, active });
  });

  app.post('/api/event/active/stop', async (_req, reply) => {
    clearActiveEvent();
    broadcast({ type: 'active_event_changed', payload: { active: null } });
    return reply.send({ success: true, active: null });
  });

  // ── End event ────────────────────────────────────────────────────────────

  /**
   * POST /api/event/end
   *
   * Gracefully ends the event session:
   * - Broadcasts event_ended to all connected clients
   * - Clears in-memory scanner + active-event state
   * - Invalidates the cached PocketBase admin token
   */
  app.post('/api/event/end', async (_req, reply) => {
    broadcast({ type: 'event_ended', payload: { message: 'The event has ended.' } });
    connectedScanners.clear();
    blockedScanners.clear();
    clearActiveEvent();
    invalidateToken();
    return reply.send({ success: true });
  });
}
