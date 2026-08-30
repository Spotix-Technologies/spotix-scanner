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
 * Admin-token helper for IPC handlers that talk to PocketBase directly
 * (logs export, auto-sync CRUD, ending an event). The server has its own
 * copy of this logic in server/db.ts — kept separate since the two run in
 * different layers and don't share module state — but both now read the
 * same locally-provisioned credentials (see credentials.ts) instead of a
 * hardcoded fallback, and both target only the bundled PocketBase v0.36.8's
 * `_superusers` auth collection/endpoint.
 */

import { POCKETBASE_PORT } from './paths';
import { loadCredentials } from './credentials';

export async function getAdminToken(): Promise<string> {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error('No admin account configured yet — please sign in.');
  }

  const res = await fetch(`http://127.0.0.1:${POCKETBASE_PORT}/api/collections/_superusers/auth-with-password`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ identity: creds.email, password: creds.password }),
  });
  if (!res.ok) throw new Error(`PocketBase superuser auth failed (${res.status})`);
  return ((await res.json()) as { token: string }).token;
}
