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
import { pbGet, pbPost, pbPatch, pbDelete, pbFilter, getToken, getGuestByTicketId, getOrCreateEvent, POCKETBASE_URL } from '../db';
import { broadcast } from '../state';
import type { Guest } from '../types';

/**
 * Guest CRUD + bulk import routes.
 *
 * GET    /api/guests               — list all (optionally ?eventId=)
 * POST   /api/guests               — create single guest
 * PATCH  /api/guests/:id           — edit guest fields
 * DELETE /api/guests/:id           — remove guest
 * POST   /api/guests/import        — bulk upsert from envelope { guests, eventId, eventName }
 */
export function registerGuestRoutes(app: FastifyInstance): void {

  // ─── GET guests (optionally filtered by eventId) ─────────────────────────

  app.get<{ Querystring: { eventId?: string } }>('/api/guests', async (req, reply) => {
    const { eventId } = req.query;
    const url = eventId
      ? `/api/collections/guests/records?filter=${pbFilter(`eventId='${eventId.replace(/'/g, "\\'")}'`)}&perPage=500&sort=+fullName`
      : `/api/collections/guests/records?perPage=500&sort=+fullName`;
    const res = await pbGet(url);
    if (!res.ok) return reply.status(500).send({ error: 'Failed to fetch guests' });
    const data = await res.json() as { items: Guest[] };
    return reply.send(data.items ?? []);
  });

  // ─── POST create single guest ─────────────────────────────────────────────

  app.post<{ Body: Omit<Guest, 'id'> & { eventId?: string } }>('/api/guests', async (req, reply) => {
    const { fullName, email, ticketId, ticketType, checkedIn, checkedInAt, checkedInBy, faceEmbedding, eventId } = req.body;

    if (!fullName?.trim() || !email?.trim() || !ticketId?.trim() || !ticketType?.trim()) {
      return reply.status(400).send({ error: 'fullName, email, ticketId, and ticketType are required' });
    }

    const existing = await getGuestByTicketId(ticketId.trim(), (eventId as any)?.trim());
    if (existing) {
      return reply.status(409).send({ error: `Ticket ID "${ticketId}" already exists` });
    }

    const res = await pbPost('/api/collections/guests/records', {
      fullName:      fullName.trim(),
      email:         email.trim(),
      ticketId:      ticketId.trim(),
      ticketType:    ticketType.trim(),
      checkedIn:     checkedIn ?? false,
      checkedInAt:   checkedInAt ?? null,
      checkedInBy:   checkedInBy ?? null,
      faceEmbedding: Array.isArray(faceEmbedding) && faceEmbedding.length > 0 ? faceEmbedding : null,
      eventId:       (eventId as any) ?? '',
    });

    if (!res.ok) {
      console.error('[Server] Create guest failed:', await res.text());
      return reply.status(500).send({ error: 'Failed to create guest' });
    }

    const created = await res.json() as Guest;
    broadcast({ type: 'guests_imported', payload: { imported: 1, skipped: 0 } });
    return reply.status(201).send(created);
  });

  // ─── PATCH update guest ───────────────────────────────────────────────────

  app.patch<{ Params: { id: string }; Body: Partial<Guest> }>('/api/guests/:id', async (req, reply) => {
    const { id } = req.params;
    const { fullName, email, ticketType, checkedIn, checkedInAt, checkedInBy, faceEmbedding } = req.body;

    const update: Record<string, unknown> = {};
    if (fullName    !== undefined) update.fullName    = fullName.trim();
    if (email       !== undefined) update.email       = email.trim();
    if (ticketType  !== undefined) update.ticketType  = ticketType.trim();
    if (checkedIn   !== undefined) update.checkedIn   = checkedIn;
    if (checkedInAt !== undefined) update.checkedInAt = checkedInAt;
    if (checkedInBy !== undefined) update.checkedInBy = checkedInBy;
    if (faceEmbedding !== undefined) {
      update.faceEmbedding = Array.isArray(faceEmbedding) && faceEmbedding.length > 0 ? faceEmbedding : null;
    }

    const res = await pbPatch(`/api/collections/guests/records/${id}`, update);
    if (!res.ok) {
      console.error('[Server] Update guest failed:', await res.text());
      return reply.status(500).send({ error: 'Failed to update guest' });
    }

    return reply.send(await res.json() as Guest);
  });

  // ─── DELETE guest ─────────────────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>('/api/guests/:id', async (req, reply) => {
    const { id } = req.params;
    const res = await pbDelete(`/api/collections/guests/records/${id}`);
    if (!res.ok && res.status !== 404) {
      return reply.status(500).send({ error: 'Failed to delete guest' });
    }
    return reply.status(204).send();
  });

  // ─── POST bulk import ─────────────────────────────────────────────────────
  // Accepts:  { guests: GuestImportRow[], eventId?: string, eventName?: string }
  // eventId + eventName come from the Booker export envelope and are stored
  // against every guest so scans can be scoped to a specific event.

  // Accepts EITHER:
  //   a) Envelope: { guests: [], eventId?, eventName? }  — from Booker export / welcome import
  //   b) Legacy bare array: []                           — from old GuestImport component
  app.post<{ Body: Record<string, unknown> | unknown[] }>(
    '/api/guests/import',
    async (req, reply) => {
      const raw: unknown = req.body;
      let guests: (Guest & { eventId?: string })[];
      let eventId   = '';
      let eventName = '';

      if (Array.isArray(raw)) {
        guests = raw as (Guest & { eventId?: string })[];
      } else if (raw && typeof raw === 'object' && Array.isArray((raw as any).guests)) {
        guests    = (raw as any).guests as (Guest & { eventId?: string })[];
        eventId   = (raw as any).eventId   ?? '';
        eventName = (raw as any).eventName ?? '';
      } else {
        return reply.status(400).send({ error: 'Body must be a guest array or envelope { guests: [] }' });
      }

      console.log(`[Server] Import started: ${guests.length} guests, eventId="${eventId}", eventName="${eventName}"`);

      let token: string;
      try {
        token = await getToken();
      } catch (e) {
        return reply.status(500).send({ error: 'PocketBase authentication failed' });
      }

      // Upsert the event record (so welcome page can list it)
      if (eventId) {
        try {
          await getOrCreateEvent(eventId, eventName || eventId);
        } catch (e) {
          console.error('[Server] Could not upsert event record:', e);
        }
      }

      // Fetch existing ticketIds scoped to this event to avoid duplicates
      let existingTicketIds: Set<string>;
      try {
        const filter = eventId
          ? `&filter=${pbFilter(`eventId='${eventId.replace(/'/g, "\\'")}'`)}`
          : '';
        const res = await fetch(
          `${POCKETBASE_URL}/api/collections/guests/records?perPage=500&fields=ticketId${filter}`,
          { headers: { Authorization: token } }
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json() as { items: { ticketId: string }[] };
        existingTicketIds = new Set((data.items ?? []).map(g => g.ticketId));
        console.log(`[Server] ${existingTicketIds.size} existing tickets for this event`);
      } catch (e) {
        console.error('[Server] Could not load existing guests:', e);
        return reply.status(500).send({ error: 'Failed to load existing guest list' });
      }

      let imported = 0, skipped = 0;

      for (const guest of guests) {
        if (!guest.fullName || !guest.email || !guest.ticketId || !guest.ticketType) {
          skipped++; continue;
        }
        if (existingTicketIds.has(guest.ticketId)) { skipped++; continue; }

        try {
          const res = await fetch(`${POCKETBASE_URL}/api/collections/guests/records`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({
              fullName:      guest.fullName,
              email:         guest.email,
              ticketId:      guest.ticketId,
              ticketType:    guest.ticketType,
              checkedIn:     false,
              checkedInAt:   null,
              checkedInBy:   null,
              faceEmbedding: Array.isArray(guest.faceEmbedding) && guest.faceEmbedding.length > 0
                ? guest.faceEmbedding : null,
              eventId: eventId || (guest.eventId ?? ''),
            }),
          });

          if (res.ok) {
            imported++;
            existingTicketIds.add(guest.ticketId);
          } else {
            console.error(`[Server] Failed to import ${guest.ticketId}: ${res.status} ${await res.text()}`);
            skipped++;
          }
        } catch (e) {
          console.error(`[Server] Exception importing ${guest.ticketId}:`, e);
          skipped++;
        }
      }

      console.log(`[Server] Import done: ${imported} imported, ${skipped} skipped`);
      broadcast({ type: 'guests_imported', payload: { imported, skipped } });
      return reply.send({ imported, skipped });
    }
  );
}
