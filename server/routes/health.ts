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

/**
 * GET /api/health
 * Basic liveness check used by the UI and electron main to confirm the server is up.
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/health', async (_req, reply) =>
    reply.send({ status: 'ok', timestamp: new Date().toISOString() })
  );
}
