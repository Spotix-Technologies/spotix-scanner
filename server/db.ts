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
const PB_EMAIL    = process.env.PB_ADMIN_EMAIL    || 'admin@spotix.local';
const PB_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'Sp0tix@Scanner2024!';

// ─── PocketBase Auth ──────────────────────────────────────────────────────────

let _adminToken: string | null = null;
let _tokenExpiry: number = 0;

export async function getToken(): Promise<string> {
  const now = Date.now();
  if (_adminToken && now < _tokenExpiry) return _adminToken;

  const endpoints = [
    '/api/collections/_superusers/auth-with-password',
    '/api/admins/auth-with-password',
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${POCKETBASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
      });
      const text = await res.text();
      if (res.ok) {
        const data = JSON.parse(text) as { token: string };
        _adminToken  = data.token;
        _tokenExpiry = now + 55 * 60 * 1000;
        console.log(`[Server] Database auth OK via ${endpoint}`);
        return _adminToken;
      }
    } catch (e) {
      console.error(`[Server] Auth ${endpoint} exception:`, e);
    }
  }
  throw new Error('[Server] Database authentication failed on all endpoints');
}

export function invalidateToken(): void {
  _adminToken = null;
  _tokenExpiry = 0;
}

// ─── PocketBase REST helpers ──────────────────────────────────────────────────

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

// ─── Filter helper ────────────────────────────────────────────────────────────

export function pbFilter(expr: string): string {
  return encodeURIComponent(`(${expr})`);
}

// ─── Guest helpers ────────────────────────────────────────────────────────────

export async function getGuestByTicketId(ticketId: string): Promise<Guest | null> {
  const safe      = ticketId.replace(/'/g, "\\'");
  const filterUrl = `/api/collections/guests/records?filter=${pbFilter(`ticketId='${safe}'`)}&perPage=1`;
  const res       = await pbGet(filterUrl);
  if (!res.ok) { console.error(`[Server] getGuestByTicketId failed: ${res.status} ${await res.text()}`); return null; }
  const data = await res.json() as { items: Guest[] };
  return data.items?.[0] ?? null;
}

export async function getGuestByEmail(email: string): Promise<Guest | null> {
  const safe      = email.replace(/'/g, "\\'");
  const filterUrl = `/api/collections/guests/records?filter=${pbFilter(`email='${safe}'`)}&perPage=1`;
  const res       = await pbGet(filterUrl);
  if (!res.ok) { console.error(`[Server] getGuestByEmail failed: ${res.status} ${await res.text()}`); return null; }
  const data = await res.json() as { items: Guest[] };
  return data.items?.[0] ?? null;
}

export async function getAllGuests(): Promise<Guest[]> {
  const res = await pbGet(`/api/collections/guests/records?perPage=500`);
  if (!res.ok) { console.error('[Server] getAllGuests failed:', res.status, await res.text()); return []; }
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

export async function findGuestByFace(embedding: number[]): Promise<Guest | null> {
  const guests = await getAllGuests();
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
