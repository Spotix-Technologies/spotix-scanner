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
 *
 * - PocketBase version note -
 * Pinned to PocketBase v0.36.8 (confirmed via `pocketbase.exe -v` against the
 * actual bundled binary), deliberately and exclusively. v0.36.8 is well past
 * the v0.23.0 rewrite, so:
 *   - the admin user is a `_superusers` auth-collection record, NOT `admins`
 *   - the CLI command is `superuser upsert`, NOT `admin upsert`
 *   - the login endpoint is `/api/collections/_superusers/auth-with-password`,
 *     NOT `/api/admins/auth-with-password`
 *   - a collection's fields are sent as a flat `fields` array, where each
 *     field is `{ name, type, required, ...type-specific options inlined }`
 *     — NOT the pre-0.23 nested `schema: [{ name, type, required, options }]`
 *     shape.
 */

import { spawn } from 'child_process';

const POCKETBASE_URL = 'http://127.0.0.1:8090';

// v0.23+ (incl. v0.36.8) flat field shape — options such as `min`/`max`/
// `maxSize` are inlined directly on the field object, no nested `options`.
interface SchemaField {
  name:     string;
  type:     'text' | 'bool' | 'json' | 'number' | 'email' | 'date';
  required: boolean;
  [extra: string]: unknown;
}

function field(
  name: string,
  type: SchemaField['type'],
  required = false,
  extra: Record<string, unknown> = {}
): SchemaField {
  return { name, type, required, ...extra };
}

/**
 * Creates (or updates the password of) the PocketBase superuser account via
 * the v0.36.8 CLI (`superuser upsert`). Returns true on success. This is the
 * ONLY place a password ever touches disk via a CLI arg — callers should
 * invoke this only from the Sign Up / Login flow, never automatically with
 * a hardcoded value.
 */
export function upsertAdminCli(
  pbBinaryPath: string,
  pbDataDir: string,
  email: string,
  password: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(pbBinaryPath, [
      'superuser', 'upsert', email, password,
      `--dir=${pbDataDir}`,
    ]);
    let failed = false;
    proc.stdout?.on('data', (d: Buffer) => console.log(`[DB Setup] ${d.toString().trim()}`));
    proc.stderr?.on('data', (d: Buffer) => {
      console.error(`[DB Setup] ${d.toString().trim()}`);
      failed = true;
    });
    proc.on('error', () => { failed = true; });
    proc.on('close', (code) => resolve(code === 0 && !failed));
  });
}

/** Authenticates against the v0.36.8 `_superusers` auth collection. Throws
 *  with a clear message on bad credentials or an incompatible binary. */
export async function authenticateAdmin(email: string, password: string): Promise<string> {
  const res = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ identity: email, password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PocketBase superuser auth failed (${res.status}): ${body || 'invalid credentials'}`);
  }
  const data = await res.json() as { token: string };
  return data.token;
}

/** Creates/patches every collection Spotix Scanner needs. Idempotent — safe
 *  to call on every login, not just once. Requires a superuser token, so
 *  this can only run after the admin account exists and has authenticated. */
export async function provisionCollections(token: string): Promise<void> {
  console.log('[DB Setup] Provisioning collections...');

  const openRules = {
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  };

  // ── events collection — one record per imported guest list ──────────────────
  await ensureCollection(token, 'events', {
    name: 'events',
    type: 'base',
    ...openRules,
    fields: [
      field('eventId',    'text', true),
      field('eventName',  'text', true),
      field('importedAt', 'text'),
      // syncing: true means a sync is in progress — block new check-ins for this event
      field('syncing',    'bool'),
      // closed: true means the event has been ended by the operator. Guests
      // and logs for this event are kept — closing an event must NEVER
      // delete data, only mark it as finished. See ipc/logs.ts `event:end`.
      field('closed',     'bool'),
      field('closedAt',   'text'),
    ],
  });

  // ── guests collection — tickets keyed by event 
  await ensureCollection(token, 'guests', {
    name: 'guests',
    type: 'base',
    ...openRules,
    fields: [
      field('fullName',      'text', true),
      field('email',         'text', true),
      field('ticketId',      'text', true),
      field('ticketType',    'text', true),
      field('checkedIn',     'bool'),
      field('checkedInAt',   'text'),
      field('checkedInBy',   'text'),
      field('faceEmbedding', 'json', false, { maxSize: 5000000 }),
      // Foreign key back to the events collection record
      field('eventId',       'text', true),
    ],
  });

  // ── logs collection ─────────────────────────────────────────────────────────
  await ensureCollection(token, 'logs', {
    name: 'logs',
    type: 'base',
    ...openRules,
    fields: [
      field('ticketId',      'text', true),
      field('guestName',     'text', true),
      field('scannerId',     'text', true),
      field('result',        'text', true),
      field('timestamp',     'text', true),
      field('checkedInDate', 'text', true),
      field('checkedInTime', 'text', true),
      field('note',          'text'),
      field('eventId',       'text'),
    ],
  });

  // auto_sync collection — scheduled sync jobs 
  await ensureCollection(token, 'auto_sync', {
    name: 'auto_sync',
    type: 'base',
    ...openRules,
    fields: [
      field('eventId',     'text', true),
      field('eventName',   'text', true),
      field('syncUrl',     'text', true),
      field('syncKey',     'text', true),
      field('scheduledAt', 'text', true),
      field('status',      'text'), // pending|running|done|failed
      field('lastError',   'text'),
      field('warned',      'bool'),
    ],
  });

  console.log('[DB Setup] Collections ready');
}

// ─── Helpers 

async function ensureCollection(
  token: string,
  name: string,
  schema: object
): Promise<void> {
  const check = await fetch(`${POCKETBASE_URL}/api/collections/${name}`, {
    headers: { Authorization: token },
  });

  if (check.ok) {
    console.log(`[DB Setup] Collection "${name}" exists — patching fields + rules...`);
    const update = await fetch(`${POCKETBASE_URL}/api/collections/${name}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify(schema),
    });
    if (update.ok) {
      console.log(`[DB Setup] Collection "${name}" updated`);
    } else {
      console.error(`[DB Setup] Failed to update "${name}": ${await update.text()}`);
    }
    return;
  }

  const create = await fetch(`${POCKETBASE_URL}/api/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(schema),
  });

  if (create.ok) {
    console.log(`[DB Setup] Created collection "${name}"`);
  } else {
    const err = await create.text();
    console.error(`[DB Setup] Failed to create "${name}": ${err}`);
  }
}
