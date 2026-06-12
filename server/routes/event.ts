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
import { connectedScanners, blockedScanners, broadcast } from '../state';
import { invalidateToken } from '../db';

/**
 * POST /api/event/end
 *
 * Gracefully ends the event session:
 * - Broadcasts event_ended to all connected clients
 * - Clears in-memory scanner state
 * - Invalidates the cached PocketBase admin token
 */
export function registerEventRoutes(app: FastifyInstance): void {

  app.post('/api/event/end', async (_req, reply) => {
    broadcast({ type: 'event_ended', payload: { message: 'The event has ended.' } });
    connectedScanners.clear();
    blockedScanners.clear();
    invalidateToken();
    return reply.send({ success: true });
  });
}
