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
} from '../db';
import { connectedScanners, blockedScanners, broadcast } from '../state';
import { getCheckedInDate, getCheckedInTime } from '../utils';
import type { ScanRequest } from '../types';

/**
 * POST /api/scan
 *
 * Core check-in endpoint.  Accepts a ticketId, email, or face embedding,
 * looks up the guest, marks them checked-in, writes a log record, and
 * broadcasts the result to all connected admin/scanner WebSocket clients.
 */
export function registerScanRoutes(app: FastifyInstance): void {

  app.post<{ Body: ScanRequest }>('/api/scan', async (req, reply) => {
    const { ticketId, email, faceEmbedding, scannerId } = req.body;

    if (blockedScanners.has(scannerId))
      return reply.status(403).send({ result: 'blocked', message: 'Scanner is blocked.' });

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
    };

    if (!guest) {
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
