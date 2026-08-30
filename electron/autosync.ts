/**
 * Spotix Scanner — Professional Event Check-in System
 * Copyright © 2026 Spotix Technologies. All rights reserved.
 *
 * Auto-sync scheduler — reads auto_sync records from PocketBase,
 * fires 1-hour warnings, runs syncs at the scheduled time,
 * stores results back to PocketBase.
 */

import {
  notifyAutoSyncSoon,
  notifyAutoSyncDone,
  notifyAutoSyncFailed,
} from './notifications';
import { FASTIFY_HTTP_PORT } from './paths';
import { getAdminToken } from './admin-auth';

const PB_URL          = 'http://127.0.0.1:8090';
const FASTIFY_URL     = `http://127.0.0.1:${FASTIFY_HTTP_PORT}`;
const CHECK_INTERVAL  = 60 * 1000; // check every minute

interface AutoSyncRecord {
  id:          string;
  eventId:     string;
  eventName:   string;
  syncUrl:     string;
  syncKey:     string;
  scheduledAt: string;   // ISO timestamp
  status:      'pending' | 'running' | 'done' | 'failed';
  lastError:   string | null;
  warned:      boolean;  // true once the 1-hour warning has fired
}

// Uses the same locally-provisioned admin credentials as everything else
// (see credentials.ts) instead of a hardcoded fallback — previously this
// module kept its own duplicate auth logic with a real-looking default
// password baked in, which meant auto-sync would silently "work" against
// that default even on a machine where the operator had never signed up.
async function getToken(): Promise<string> {
  return getAdminToken();
}

async function pbPatch(id: string, data: object): Promise<void> {
  const token = await getToken();
  await fetch(`${PB_URL}/api/collections/auto_sync/records/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body:    JSON.stringify(data),
  });
}

async function runSync(record: AutoSyncRecord): Promise<void> {
  await pbPatch(record.id, { status: 'running' });

  // Lock the event
  try {
    await fetch(`${FASTIFY_URL}/api/events/${record.eventId}/lock`, { method: 'POST' });
  } catch {}

  try {
    // Fetch checked-in guests
    const filter = encodeURIComponent(`(eventId='${record.eventId}' && checkedIn=true)`);
    const gRes   = await fetch(
      `${PB_URL}/api/collections/guests/records?filter=${filter}&perPage=500&fields=ticketId,checkedInAt`,
      { headers: { Authorization: await getToken() } }
    );
    if (!gRes.ok) throw new Error(`Could not fetch guests: ${gRes.status}`);

    const guests = ((await gRes.json()) as { items: { ticketId: string; checkedInAt: string }[] }).items ?? [];

    if (guests.length === 0) {
      await pbPatch(record.id, { status: 'done', lastError: null });
      notifyAutoSyncDone(record.eventName, 0);
      return;
    }

    // POST to the server which is basically the sync url sha
    const sRes = await fetch(record.syncUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId:          record.eventId,
        key:              record.syncKey,
        checkedInTickets: guests,
      }),
    });

    const body = await sRes.json().catch(() => ({})) as any;

    if (!sRes.ok) {
      const reason = body?.error ?? `HTTP ${sRes.status}`;
      await pbPatch(record.id, { status: 'failed', lastError: reason });
      notifyAutoSyncFailed(record.eventName, reason);
      return;
    }

    await pbPatch(record.id, { status: 'done', lastError: null });
    notifyAutoSyncDone(record.eventName, body.synced ?? guests.length);

  } catch (err) {
    const reason = String(err);
    await pbPatch(record.id, { status: 'failed', lastError: reason });
    notifyAutoSyncFailed(record.eventName, reason);
  } finally {
    // Always unlock after posting
    try {
      await fetch(`${FASTIFY_URL}/api/events/${record.eventId}/unlock`, { method: 'POST' });
    } catch {}
  }
}

async function tick(): Promise<void> {
  let token: string;
  try { token = await getToken(); } catch { return; }

  const filter = encodeURIComponent(`(status='pending')`);
  const res    = await fetch(
    `${PB_URL}/api/collections/auto_sync/records?filter=${filter}&perPage=50`,
    { headers: { Authorization: token } }
  ).catch(() => null);

  if (!res?.ok) return;

  const records: AutoSyncRecord[] = ((await res.json()) as { items: AutoSyncRecord[] }).items ?? [];
  const now = Date.now();

  for (const record of records) {
    const scheduledMs = new Date(record.scheduledAt).getTime();
    const diffMs      = scheduledMs - now;

    // 1-hour warning (between 60–61 minutes out, not yet warned)
    if (!record.warned && diffMs > 0 && diffMs <= 61 * 60 * 1000 && diffMs > 59 * 60 * 1000) {
      notifyAutoSyncSoon(record.eventName);
      await pbPatch(record.id, { warned: true });
    }

    // Time to sync (within 1 minute window)
    if (diffMs <= 60 * 1000 && diffMs > -60 * 1000) {
      runSync(record); // fire-and-forget; status tracked in PB
    }
  }
}

let _interval: ReturnType<typeof setInterval> | null = null;

export function startAutoSyncScheduler(): void {
  if (_interval) return;
  console.log('[AutoSync] Scheduler started');
  _interval = setInterval(() => { tick().catch(console.error); }, CHECK_INTERVAL);
  tick().catch(console.error); // immediate first check
}

export function stopAutoSyncScheduler(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
}
