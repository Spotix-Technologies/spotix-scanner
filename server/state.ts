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

import type { Scanner, WSMessage, ActiveEventInfo } from './types';
import type { SocketStream } from '@fastify/websocket';

// Shared in-memory state 

export const connectedScanners = new Map<string, { ws: SocketStream['socket']; scanner: Scanner }>();
export const blockedScanners   = new Set<string>();

// Active event (set from the lobby "Start" / "Stop" controls) 
//
// The broadcasting/scanning server only treats scans as valid for this event.
// `null` means no event is currently being scanned — scanner devices should
// show "No active events on this server".

let _activeEvent: ActiveEventInfo | null = null;

export function getActiveEvent(): ActiveEventInfo | null {
  return _activeEvent;
}

export function setActiveEvent(event: ActiveEventInfo): void {
  _activeEvent = event;
}

export function clearActiveEvent(): void {
  _activeEvent = null;
}

// Broadcast helpers 

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
