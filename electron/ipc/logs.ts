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

import { ipcMain, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { FASTIFY_HTTP_PORT } from '../paths';
import { getAdminToken } from '../admin-auth';
import { getActiveEventInfo } from '../state';
import { stopBroadcastServer } from '../server-lifecycle';

type ExportFormat = 'csv' | 'json' | 'both';
type ExportResult = { success: boolean; paths?: string[]; error?: string };

async function exportLogsHandler(format: ExportFormat): Promise<ExportResult> {
  try {
    const pbToken = await getAdminToken();

    const logsRes  = await fetch('http://127.0.0.1:8090/api/collections/logs/records?perPage=500&sort=%2Btimestamp', {
      headers: { Authorization: pbToken },
    });
    const logsData = await logsRes.json() as { items: any[] };
    const logs     = logsData.items ?? [];

    const guestsRes  = await fetch('http://127.0.0.1:8090/api/collections/guests/records?perPage=1', {
      headers: { Authorization: pbToken },
    });
    const guestsData = await guestsRes.json() as { totalItems: number };
    const totalGuests = guestsData.totalItems ?? 0;
    const checkedIn   = logs.filter((l: any) => l.result === 'success').length;

    const summary = {
      exportedAt:     new Date().toISOString(),
      totalGuests,
      checkedIn,
      noShows:        totalGuests - checkedIn,
      invalidScans:   logs.filter((l: any) => l.result === 'invalid' || l.result === 'wrong_event').length,
      alreadyScanned: logs.filter((l: any) => l.result === 'already_scanned').length,
      logs,
    };

    const downloadsDir = app.getPath('downloads');
    const timestamp    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const savedPaths: string[] = [];

    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(downloadsDir, `spotix-logs-${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
      savedPaths.push(jsonPath);
    }

    if (format === 'csv' || format === 'both') {
      const csvPath = path.join(downloadsDir, `spotix-logs-${timestamp}.csv`);
      const headers = 'ticketId,guestName,scannerId,result,checkedInDate,checkedInTime,timestamp,note';
      const rows    = logs.map((l: any) =>
        `${l.ticketId},"${l.guestName}",${l.scannerId},${l.result},${l.checkedInDate},${l.checkedInTime},${l.timestamp},"${l.note ?? ''}"`
      );
      fs.writeFileSync(csvPath, [headers, ...rows].join('\n'));
      savedPaths.push(csvPath);
    }

    return { success: true, paths: savedPaths };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function registerLogsIpc(): void {
  ipcMain.handle('logs:export', async (_event, format: ExportFormat) => {
    return exportLogsHandler(format);
  });

  // Ending an event must NEVER wipe the database — it only exports logs,
  // marks the event record as closed, disconnects scanners, and stops the
  // scanner-facing HTTPS server. Guests/logs stay in PocketBase so past
  // events remain reviewable and re-syncable. (Previously this called
  // purgeDatabase(), which deleted every event's data, not just the one
  // being ended.)
  ipcMain.handle('event:end', async (_event, exportFormat: ExportFormat) => {
    try {
      const exportResult = await exportLogsHandler(exportFormat);
      if (!exportResult.success) console.error('[IPC] Log export failed:', exportResult.error);

      const active = getActiveEventInfo();

      await fetch(`http://localhost:${FASTIFY_HTTP_PORT}/api/event/end`, { method: 'POST' });

      if (active?.pbId) {
        try {
          const pbToken = await getAdminToken();
          await fetch(`http://127.0.0.1:8090/api/collections/events/records/${active.pbId}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: pbToken },
            body:    JSON.stringify({ closed: true, closedAt: new Date().toISOString() }),
          });
        } catch (err) {
          console.error('[IPC] Failed to mark event closed:', err);
        }
      }

      await stopBroadcastServer();

      return { success: true, paths: exportResult.paths ?? [] };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('logs:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Event Logs',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    });
    const filePath = result.filePaths[0];
    if (!filePath) return { cancelled: true };
    try {
      const raw  = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const logs = Array.isArray(data) ? data : (data.logs ?? []);
      return { success: true, data, logs, filePath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
