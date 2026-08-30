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

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import { FASTIFY_HTTP_PORT } from '../paths';
import { appSettings } from '../state';
import { notifyImportDone } from '../notifications';

export function registerGuestsIpc(): void {
  ipcMain.handle('guests:import', async (_event, filePath: string) => {
    try {
      const raw    = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const payload = Array.isArray(parsed) ? { guests: parsed } : parsed;
      const response = await fetch(`http://localhost:${FASTIFY_HTTP_PORT}/api/guests/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { imported: number; skipped: number };
      const eventName = (payload as any).eventName || 'Event';

      if (appSettings.notificationsEnabled) {
        notifyImportDone(eventName, result.imported ?? 0, result.skipped ?? 0);
      }

      return { ...result, autoSyncDialog: appSettings.autoSyncDialogOnImport };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('dialog:openGuestFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Guest List',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    });
    return result.filePaths[0] ?? null;
  });
}
