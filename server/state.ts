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

import type { Scanner, WSMessage } from './types';
import type { SocketStream } from '@fastify/websocket';

// ─── Shared in-memory state ───────────────────────────────────────────────────

export const connectedScanners = new Map<string, { ws: SocketStream['socket']; scanner: Scanner }>();
export const blockedScanners   = new Set<string>();

// ─── Broadcast helpers ────────────────────────────────────────────────────────

export function broadcast(message: WSMessage, excludeId?: string): void {
  const data = JSON.stringify(message);
  connectedScanners.forEach(({ ws }, id) => {
    if (id !== excludeId && ws.readyState === ws.OPEN) ws.send(data);
  });
}

export function sendToScanner(scannerId: string, message: WSMessage): void {
  const entry = connectedScanners.get(scannerId);
  if (entry && entry.ws.readyState === entry.ws.OPEN) entry.ws.send(JSON.stringify(message));
}
