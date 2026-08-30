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
  getGuestByTicketId,
  getGuestByEmail,
  findGuestByFace,
  checkInGuest,
  createLog,
  isEventLocked,
} from '../db';
import { connectedScanners, blockedScanners, broadcast, getActiveEvent } from '../state';
import { getCheckedInDate, getCheckedInTime } from '../utils';
import type { ScanRequest } from '../types';

/**
 * POST /api/scan
 *
 * Core check-in endpoint. Strictly event-aware:
 * - The server's own `activeEvent` (set from the lobby "Start" button) is the
 *   single source of truth for which event is currently being scanned —
 *   NOT anything the scanner device sends. If no event is active, the scan
 *   is rejected with a `no_active_event` result.
 * - Rejects scans when the active event is locked (sync in progress).
 * - Looks the guest up GLOBALLY (across all imported events) by
 *   ticketId / email / face — then verifies the guest's own `eventId`
 *   matches the server's active event. If it doesn't, the scan is rejected
 *   with a `wrong_event` result instead of being silently treated as
 *   "not found" or, worse, checked in against the wrong event.
 */
export function registerScanRoutes(app: FastifyInstance): void {

  app.post<{ Body: ScanRequest }>('/api/scan', async (req, reply) => {
    const { ticketId, email, faceEmbedding, scannerId } = req.body;

    if (blockedScanners.has(scannerId))
      return reply.status(403).send({ result: 'blocked', message: 'Scanner is blocked.' });

    // ── The server (lobby Start/Stop), not the scanner device, decides which
    // event is "live". If nothing is active, refuse every scan.
    const activeEvent = getActiveEvent();
    if (!activeEvent) {
      return reply.status(409).send({
        result: 'no_active_event',
        message: 'No active event on this server.',
      });
    }
    const eventId = activeEvent.eventId;

    // Prevent check-ins during sync
    const locked = await isEventLocked(eventId);
    if (locked) {
      return reply.status(423).send({
        result: 'locked',
        message: 'Check-ins are paused while syncing. Please wait for the sync to complete.',
      });
    }

    // ── Look up the guest GLOBALLY (not scoped to eventId yet) ────────────────
    // This lets us distinguish "no such guest anywhere" (invalid) from
    // "this guest exists, but belongs to a different event" (wrong_event).
    let guest = null;
    if (ticketId)                   guest = await getGuestByTicketId(ticketId);
    else if (email)                 guest = await getGuestByEmail(email);
    else if (faceEmbedding?.length) guest = await findGuestByFace(faceEmbedding);

    const now     = new Date();
    const logBase = {
      scannerId,
      timestamp:     now.toISOString(),
      checkedInDate: getCheckedInDate(),
      checkedInTime: getCheckedInTime(),
      note:          null,
      eventId,
    };

    if (!guest) {
      await createLog({ ...logBase, ticketId: ticketId || 'UNKNOWN', guestName: 'Unknown', result: 'invalid' });
      broadcast({ type: 'scan_result', payload: { log: { ...logBase, result: 'invalid' }, guest: null } });
      return reply.send({ result: 'invalid', message: 'Ticket not found.' });
    }

    // ── Strict event scoping ────────────────────────────────────────────────
    // The guest exists, but does not belong to the event currently active on
    // this server. Reject the scan rather than checking them in or treating
    // them as a generic "invalid" ticket.
    if (guest.eventId !== eventId) {
      await createLog({ ...logBase, ticketId: guest.ticketId, guestName: guest.fullName, result: 'wrong_event' });
      broadcast({ type: 'scan_result', payload: { log: { ...logBase, result: 'wrong_event' }, guest: null } });
      return reply.send({
        result: 'wrong_event',
        message: `${guest.fullName} does not belong to this event.`,
      });
    }

    if (guest.checkedIn) {
      await createLog({ ...logBase, ticketId: guest.ticketId, guestName: guest.fullName, result: 'already_scanned' });
      broadcast({ type: 'scan_result', payload: { log: { ...logBase, result: 'already_scanned' }, guest } });
      return reply.send({ result: 'already_scanned', message: `${guest.fullName} has already been checked in.`, guest });
    }

    const updatedGuest = await checkInGuest(guest.id, scannerId);
    await createLog({ ...logBase, ticketId: guest.ticketId, guestName: guest.fullName, result: 'success' });

    const entry = connectedScanners.get(scannerId);
    if (entry) { entry.scanner.scanCount++; entry.scanner.lastScanAt = now.toISOString(); }

    broadcast({ type: 'scan_result', payload: { log: { ...logBase, result: 'success' }, guest: updatedGuest } });
    return reply.send({ result: 'success', message: `Welcome, ${guest.fullName}!`, guest: updatedGuest });
  });
}
