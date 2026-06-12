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

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { connectedScanners, blockedScanners, broadcast, sendToScanner } from '../state';
import type { Scanner } from '../types';

/**
 * GET /ws  (WebSocket upgrade)
 *
 * Each connecting scanner device provides:
 *   ?scannerId=<id>&name=<display-name>
 *
 * On connect:  registers the device, notifies all peers via scanner_joined.
 * On disconnect: removes the device, notifies peers via scanner_left.
 *
 * Blocked scanners receive an immediate scanner_blocked message so they can
 * show the user a meaningful error screen.
 */
export function registerWebSocketRoutes(app: FastifyInstance): void {

  const wsHandler = (socket: SocketStream, req: FastifyRequest) => {
    const url         = new URL(req.url!, `https://localhost`);
    const scannerId   = url.searchParams.get('scannerId') || `scanner-${Date.now()}`;
    const scannerName = url.searchParams.get('name') || scannerId;

    const scanner: Scanner = {
      id:          scannerId,
      name:        scannerName,
      status:      blockedScanners.has(scannerId) ? 'blocked' : 'active',
      scanCount:   0,
      connectedAt: new Date().toISOString(),
      lastScanAt:  null,
    };

    connectedScanners.set(scannerId, { ws: socket.socket, scanner });

    if (blockedScanners.has(scannerId)) {
      sendToScanner(scannerId, { type: 'scanner_blocked', payload: { message: 'This scanner has been disabled by the admin.' } });
    }

    broadcast({ type: 'scanner_joined', payload: scanner });

    socket.socket.on('close', () => {
      connectedScanners.delete(scannerId);
      broadcast({ type: 'scanner_left', payload: { scannerId } });
    });
  };

  app.get('/ws', { websocket: true }, wsHandler);
}
