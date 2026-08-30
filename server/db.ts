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

import type { Guest, Log } from './types';
import { cosineSimilarity, FACE_SIMILARITY_THRESHOLD } from './utils';

export const POCKETBASE_URL = 'http://127.0.0.1:8090';

// No hardcoded fallback anymore — these are set at runtime by
// electron/credentials.ts once the operator signs up or logs in via the
// UI (same Node process, so process.env is shared with electron/*).

// ─── PocketBase Auth ──────────────────────────────────────────────────────────

let _adminToken: string | null = null;
let _tokenExpiry: number = 0;

export async function getToken(): Promise<string> {
  const now = Date.now();
  if (_adminToken && now < _tokenExpiry) return _adminToken;

  const email    = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('[Server] No admin account configured yet — please sign in.');
  }

  // v0.36.8's `_superusers` auth collection/endpoint — this binary is
  // pinned (confirmed via `pocketbase.exe -v`), no fallback to the older
  // pre-0.23 `admins` naming (see pocketbase-setup.ts).
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    });
    const text = await res.text();
    if (res.ok) {
      const data = JSON.parse(text) as { token: string };
      _adminToken  = data.token;
      _tokenExpiry = now + 55 * 60 * 1000;
      console.log('[Server] Database auth OK');
      return _adminToken;
    }
    console.error(`[Server] Auth failed: ${res.status} ${text}`);
  } catch (e) {
    console.error('[Server] Auth exception:', e);
  }
  throw new Error('[Server] Database authentication failed');
}

export function invalidateToken(): void {
  _adminToken = null;
  _tokenExpiry = 0;
}

// PocketBase REST helpers

export async function pbGet(urlPath: string): Promise<Response> {
  const token   = await getToken();
  const fullUrl = `${POCKETBASE_URL}${urlPath}`;
  console.log(`[DB] GET ${fullUrl}`);
  return fetch(fullUrl, { headers: { Authorization: token } });
}

export async function pbPost(pbPath: string, body: unknown): Promise<Response> {
  const token = await getToken();
  return fetch(`${POCKETBASE_URL}${pbPath}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body:    JSON.stringify(body),
  });
}

export async function pbPatch(pbPath: string, body: unknown): Promise<Response> {
  const token = await getToken();
  return fetch(`${POCKETBASE_URL}${pbPath}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body:    JSON.stringify(body),
  });
}

export async function pbDelete(pbPath: string): Promise<Response> {
  const token = await getToken();
  return fetch(`${POCKETBASE_URL}${pbPath}`, {
    method:  'DELETE',
    headers: { Authorization: token },
  });
}

// Filter helper 

export function pbFilter(expr: string): string {
  return encodeURIComponent(`(${expr})`);
}

// Event collection helpers 

export interface EventRecord {
  id:         string;
  eventId:    string;
  eventName:  string;
  importedAt: string;
  syncing:    boolean;
}

export async function getEventByEventId(eventId: string): Promise<EventRecord | null> {
  const safe = eventId.replace(/'/g, "\\'");
  const res  = await pbGet(
    `/api/collections/events/records?filter=${pbFilter(`eventId='${safe}'`)}&perPage=1`
  );
  if (!res.ok) return null;
  const data = await res.json() as { items: EventRecord[] };
  return data.items?.[0] ?? null;
}

export async function getOrCreateEvent(eventId: string, eventName: string): Promise<EventRecord> {
  const existing = await getEventByEventId(eventId);
  if (existing) return existing;

  const res = await pbPost('/api/collections/events/records', {
    eventId,
    eventName,
    importedAt: new Date().toISOString(),
    syncing:    false,
  });
  if (!res.ok) throw new Error(`Failed to create event record: ${await res.text()}`);
  return res.json() as Promise<EventRecord>;
}

export async function setEventSyncing(pbRecordId: string, syncing: boolean): Promise<void> {
  const res = await pbPatch(`/api/collections/events/records/${pbRecordId}`, { syncing });
  if (!res.ok) console.error('[DB] setEventSyncing failed:', await res.text());
}

export async function isEventLocked(eventId: string): Promise<boolean> {
  const ev = await getEventByEventId(eventId);
  return ev?.syncing ?? false;
}

// Guest helpers

export async function getGuestByTicketId(ticketId: string, eventId?: string): Promise<Guest | null> {
  const safe = ticketId.replace(/'/g, "\\'");
  const filter = eventId
    ? `ticketId='${safe}' && eventId='${eventId.replace(/'/g, "\\'")}'`
    : `ticketId='${safe}'`;
  const res = await pbGet(
    `/api/collections/guests/records?filter=${pbFilter(filter)}&perPage=1`
  );
  if (!res.ok) { console.error(`[Server] getGuestByTicketId failed: ${res.status}`); return null; }
  const data = await res.json() as { items: Guest[] };
  return data.items?.[0] ?? null;
}

export async function getGuestByEmail(email: string, eventId?: string): Promise<Guest | null> {
  const safe = email.replace(/'/g, "\\'");
  const filter = eventId
    ? `email='${safe}' && eventId='${eventId.replace(/'/g, "\\'")}'`
    : `email='${safe}'`;
  const res = await pbGet(
    `/api/collections/guests/records?filter=${pbFilter(filter)}&perPage=1`
  );
  if (!res.ok) { console.error(`[Server] getGuestByEmail failed: ${res.status}`); return null; }
  const data = await res.json() as { items: Guest[] };
  return data.items?.[0] ?? null;
}

export async function getAllGuests(eventId?: string): Promise<Guest[]> {
  const url = eventId
    ? `/api/collections/guests/records?filter=${pbFilter(`eventId='${eventId.replace(/'/g, "\\'")}'`)}&perPage=500`
    : `/api/collections/guests/records?perPage=500`;
  const res = await pbGet(url);
  if (!res.ok) { console.error('[Server] getAllGuests failed:', res.status); return []; }
  const data = await res.json() as { items: Guest[] };
  return data.items ?? [];
}

export async function checkInGuest(guestId: string, scannerId: string): Promise<Guest> {
  const res = await pbPatch(`/api/collections/guests/records/${guestId}`, {
    checkedIn:   true,
    checkedInAt: new Date().toISOString(),
    checkedInBy: scannerId,
  });
  if (!res.ok) throw new Error(`checkInGuest failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Guest>;
}

export async function createLog(log: Omit<Log, 'id'>): Promise<void> {
  const res = await pbPost(`/api/collections/logs/records`, log);
  if (!res.ok) console.error('[Server] createLog failed:', res.status, await res.text());
}

export async function findGuestByFace(embedding: number[], eventId?: string): Promise<Guest | null> {
  const guests = await getAllGuests(eventId);
  let bestMatch: Guest | null = null;
  let bestScore = 0;
  for (const guest of guests) {
    if (!guest.faceEmbedding) continue;
    const score = cosineSimilarity(embedding, guest.faceEmbedding);
    if (score > bestScore && score >= FACE_SIMILARITY_THRESHOLD) {
      bestScore = score;
      bestMatch = guest;
    }
  }
  return bestMatch;
}
