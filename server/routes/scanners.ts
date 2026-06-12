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
import { connectedScanners, blockedScanners, broadcast, sendToScanner } from '../state';

/**
 * Scanner management routes (admin dashboard).
 *
 * GET  /api/scanners                       — list connected scanners
 * POST /api/scanners/:scannerId/block      — block a scanner device
 * POST /api/scanners/:scannerId/unblock    — re-enable a scanner device
 */
export function registerScannerRoutes(app: FastifyInstance): void {

  app.get('/api/scanners', async (_req, reply) => {
    const scanners = Array.from(connectedScanners.values()).map(e => ({
      ...e.scanner,
      status: blockedScanners.has(e.scanner.id) ? 'blocked' : 'active',
    }));
    return reply.send(scanners);
  });

  app.post<{ Params: { scannerId: string } }>('/api/scanners/:scannerId/block', async (req, reply) => {
    const { scannerId } = req.params;
    blockedScanners.add(scannerId);
    sendToScanner(scannerId, { type: 'scanner_blocked', payload: { message: 'This scanner has been disabled by the admin.' } });
    broadcast({ type: 'scanner_blocked', payload: { scannerId } }, scannerId);
    return reply.send({ success: true });
  });

  app.post<{ Params: { scannerId: string } }>('/api/scanners/:scannerId/unblock', async (req, reply) => {
    const { scannerId } = req.params;
    blockedScanners.delete(scannerId);
    sendToScanner(scannerId, { type: 'scanner_unblocked', payload: { message: 'Scanner has been re-enabled.' } });
    broadcast({ type: 'scanner_unblocked', payload: { scannerId } }, scannerId);
    return reply.send({ success: true });
  });
}
