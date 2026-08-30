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
} from '../server/db';
import { connectedScanners, blockedScanners, broadcast } from '../server/state';
import { getCheckedInDate, getCheckedInTime } from '../server/utils';
import type { ScanRequest } from '../server/types';

/**
 * POST /api/scan
 *
 * Core check-in endpoint. Now event-aware:
 * - Accepts optional `eventId` in the body; scopes the lookup to that event.
 * - Rejects scans when the event is locked (sync in progress).
 */
export function registerScanRoutes(app: FastifyInstance): void {

  app.post<{ Body: ScanRequest & { eventId?: string } }>('/api/scan', async (req, reply) => {
    const { ticketId, email, faceEmbedding, scannerId, eventId } = req.body;

    if (blockedScanners.has(scannerId))
      return reply.status(403).send({ result: 'blocked', message: 'Scanner is blocked.' });

    // Prevent check-ins during sync
    if (eventId) {
      const locked = await isEventLocked(eventId);
      if (locked) {
        return reply.status(423).send({
          result: 'locked',
          message: 'Check-ins are paused while syncing. Please wait for the sync to complete.',
        });
      }
    }

    // Scoped lookup — only search within the active event
    let guest = null;
    let crossEventGuest = null;

    if (ticketId) {
      guest = await getGuestByTicketId(ticketId, eventId);
      // If not found in active event, check if ticket exists in a different event
      if (!guest && eventId) crossEventGuest = await getGuestByTicketId(ticketId);
    } else if (email) {
      guest = await getGuestByEmail(email, eventId);
      if (!guest && eventId) crossEventGuest = await getGuestByEmail(email);
    } else if (faceEmbedding?.length) {
      guest = await findGuestByFace(faceEmbedding, eventId);
    }

    const now     = new Date();
    const logBase = {
      scannerId,
      timestamp:     now.toISOString(),
      checkedInDate: getCheckedInDate(),
      checkedInTime: getCheckedInTime(),
      note:          null,
      eventId:       eventId ?? null,
    };

    if (!guest) {
      // Check for cross-event mismatch
      if (crossEventGuest) {
        // Find the event name for the other event
        let otherEventName = crossEventGuest.eventId || 'another event';
        try {
          const { getEventByEventId } = await import('../server/db');
          const ev = await getEventByEventId(crossEventGuest.eventId);
          if (ev) otherEventName = ev.eventName;
        } catch {}


        // Error message for cross-event ticket 
        const msg = `This guest doesn't belong in this event. Ticket is from ${otherEventName}.`;
        await createLog({ ...logBase, ticketId: ticketId || crossEventGuest.ticketId, guestName: crossEventGuest.fullName, result: 'invalid', note: msg });
        broadcast({ type: 'scan_result', payload: { log: { ...logBase, result: 'invalid', note: msg }, guest: null } });
        return reply.send({ result: 'invalid', message: msg });
      }

      await createLog({ ...logBase, ticketId: ticketId || 'UNKNOWN', guestName: 'Unknown', result: 'invalid' });
      broadcast({ type: 'scan_result', payload: { log: { ...logBase, result: 'invalid' }, guest: null } });
      return reply.send({ result: 'invalid', message: 'Ticket not found.' });
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
