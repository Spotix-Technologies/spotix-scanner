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

import { ipcMain } from 'electron';
import { getAdminToken } from '../admin-auth';

const PB_URL = 'http://127.0.0.1:8090';

export function registerAutoSyncIpc(): void {
  ipcMain.handle('autosync:create', async (_event, record: {
    eventId: string; eventName: string; syncUrl: string;
    syncKey: string; scheduledAt: string;
  }) => {
    try {
      const token = await getAdminToken();
      const res   = await fetch(`${PB_URL}/api/collections/auto_sync/records`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body:    JSON.stringify({ ...record, status: 'pending', warned: false, lastError: null }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { success: true, record: await res.json() };
    } catch (err) { return { success: false, error: String(err) }; }
  });

  ipcMain.handle('autosync:list', async (_event, eventId?: string) => {
    try {
      const token  = await getAdminToken();
      const filter = eventId ? `&filter=${encodeURIComponent(`(eventId='${eventId}')`)}` : '';
      const res    = await fetch(
        `${PB_URL}/api/collections/auto_sync/records?sort=-scheduledAt&perPage=50${filter}`,
        { headers: { Authorization: token } }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { items: unknown[] };
      return { success: true, records: data.items ?? [] };
    } catch (err) { return { success: false, error: String(err) }; }
  });

  ipcMain.handle('autosync:delete', async (_event, id: string) => {
    try {
      const token = await getAdminToken();
      const res   = await fetch(`${PB_URL}/api/collections/auto_sync/records/${id}`, {
        method: 'DELETE', headers: { Authorization: token },
      });
      if (!res.ok && res.status !== 404) throw new Error(await res.text());
      return { success: true };
    } catch (err) { return { success: false, error: String(err) }; }
  });

  ipcMain.handle('autosync:reset', async (_event, id: string) => {
    try {
      const token = await getAdminToken();
      const res   = await fetch(`${PB_URL}/api/collections/auto_sync/records/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body:    JSON.stringify({ status: 'pending', lastError: null, warned: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { success: true };
    } catch (err) { return { success: false, error: String(err) }; }
  });
}
