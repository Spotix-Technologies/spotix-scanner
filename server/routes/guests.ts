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
import { pbGet, pbPost, pbPatch, pbDelete, pbFilter, getToken, getGuestByTicketId, POCKETBASE_URL } from '../db';
import { broadcast } from '../state';
import type { Guest } from '../types';

/**
 * Guest CRUD + bulk import routes.
 *
 * GET    /api/guests              — list all (Manage Registry)
 * POST   /api/guests              — create single guest
 * PATCH  /api/guests/:id          — edit guest fields
 * DELETE /api/guests/:id          — remove guest
 * POST   /api/guests/import       — bulk upsert from JSON array
 */
export function registerGuestRoutes(app: FastifyInstance): void {

  // ─── GET all guests ──────────────────────────────────────────────────────────

  app.get('/api/guests', async (_req, reply) => {
    const res = await pbGet('/api/collections/guests/records?perPage=500&sort=+fullName');
    if (!res.ok) return reply.status(500).send({ error: 'Failed to fetch guests' });
    const data = await res.json() as { items: Guest[] };
    return reply.send(data.items ?? []);
  });

  // ─── POST create single guest ────────────────────────────────────────────────

  app.post<{ Body: Omit<Guest, 'id'> }>('/api/guests', async (req, reply) => {
    const { fullName, email, ticketId, ticketType, checkedIn, checkedInAt, checkedInBy, faceEmbedding } = req.body;

    if (!fullName?.trim() || !email?.trim() || !ticketId?.trim() || !ticketType?.trim()) {
      return reply.status(400).send({ error: 'fullName, email, ticketId, and ticketType are required' });
    }

    const existing = await getGuestByTicketId(ticketId.trim());
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
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Server] Create guest failed:', err);
      return reply.status(500).send({ error: 'Failed to create guest' });
    }

    const created = await res.json() as Guest;
    broadcast({ type: 'guests_imported', payload: { imported: 1, skipped: 0 } });
    return reply.status(201).send(created);
  });

  // ─── PATCH update guest ──────────────────────────────────────────────────────

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
      update.faceEmbedding = Array.isArray(faceEmbedding) && faceEmbedding.length > 0
        ? faceEmbedding
        : null;
    }

    const res = await pbPatch(`/api/collections/guests/records/${id}`, update);
    if (!res.ok) {
      const err = await res.text();
      console.error('[Server] Update guest failed:', err);
      return reply.status(500).send({ error: 'Failed to update guest' });
    }

    const updated = await res.json() as Guest;
    return reply.send(updated);
  });

  // ─── DELETE guest ────────────────────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>('/api/guests/:id', async (req, reply) => {
    const { id } = req.params;
    const res = await pbDelete(`/api/collections/guests/records/${id}`);
    if (!res.ok && res.status !== 404) {
      console.error('[Server] Delete guest failed:', res.status, await res.text());
      return reply.status(500).send({ error: 'Failed to delete guest' });
    }
    return reply.status(204).send();
  });

  // ─── POST bulk import ────────────────────────────────────────────────────────
  // NOTE: must be registered BEFORE the generic POST /api/guests handler but
  // Fastify matches by full path so order here does not matter — exact paths
  // always win over parameterised ones.

  app.post<{ Body: { guests: Guest[] } }>('/api/guests/import', async (req, reply) => {
    const { guests } = req.body;
    if (!Array.isArray(guests)) return reply.status(400).send({ error: 'guests must be an array' });

    console.log(`[Server] Import started: ${guests.length} attendees recorded`);

    let token: string;
    try {
      token = await getToken();
    } catch (e) {
      console.error('[Server] Import aborted — auth failed:', e);
      return reply.status(500).send({ error: 'PocketBase authentication failed' });
    }

    // Fetch all existing ticketIds in one shot to avoid N queries
    let existingTicketIds: Set<string>;
    try {
      const res = await fetch(
        `${POCKETBASE_URL}/api/collections/guests/records?perPage=500&fields=ticketId`,
        { headers: { Authorization: token } }
      );
      if (!res.ok) throw new Error(`Failed to fetch existing guests: ${res.status}`);
      const data = await res.json() as { items: { ticketId: string }[] };
      existingTicketIds = new Set((data.items ?? []).map(g => g.ticketId));
      console.log(`[Server] Found ${existingTicketIds.size} existing ticket IDs`);
    } catch (e) {
      console.error('[Server] Import aborted — could not load existing guests:', e);
      return reply.status(500).send({ error: 'Failed to load existing guest list' });
    }

    let imported = 0, skipped = 0;

    for (const guest of guests) {
      if (!guest.fullName || !guest.email || !guest.ticketId || !guest.ticketType) {
        console.log(`[Server] Skipped (missing fields): ${JSON.stringify(guest)}`);
        skipped++; continue;
      }

      if (existingTicketIds.has(guest.ticketId)) {
        console.log(`[Server] Skipped (duplicate ticketId): ${guest.ticketId}`);
        skipped++; continue;
      }

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
              ? guest.faceEmbedding
              : null,
          }),
        });

        if (res.ok) {
          imported++;
          existingTicketIds.add(guest.ticketId); // guard against dupes within same batch
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
  });
}
