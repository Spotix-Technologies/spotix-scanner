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
 * - Bug fix note in v2 of the scanner
 * Previously:
 *   - lobby:startServer re-called the same start() that already brought up
 *     the admin HTTP layer at boot, which could throw on the already-bound
 *     port. lobby:stopServer never called stop at all — it only told the
 *     Fastify route layer to clear the active event, leaving the HTTPS
 *     server (and the scanners connected to it) running.
 *   - Neither handler told the renderer anything changed, so the lobby's
 *     Start/Stop buttons looked frozen until the page was remounted.
 *
 * Now startBroadcastServer/stopBroadcastServer (server-lifecycle.ts) own
 * the actual HTTPS start/stop AND call setServerStatus(), which pushes
 * 'lobby:statusChanged' to the renderer and refreshes the tray — so the UI
 * updates the instant the operation finishes, regardless of which window
 * or code path triggered it.
 */

import { ipcMain } from 'electron';
import { FASTIFY_HTTP_PORT } from '../paths';
import { getServerRunning, getActiveEventInfo, type ActiveEventInfo } from '../state';
import { startBroadcastServer, stopBroadcastServer } from '../server-lifecycle';

export function registerLobbyIpc(): void {
  ipcMain.handle('lobby:startServer', async (_event, eventInfo: ActiveEventInfo) => {
    try {
      // Tell the Fastify layer which event is now active (this also
      // broadcasts active_event_changed to any connected scanner devices).
      await fetch(`http://localhost:${FASTIFY_HTTP_PORT}/api/event/active`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(eventInfo),
      });

      await startBroadcastServer(eventInfo);

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('lobby:stopServer', async () => {
    try {
      await fetch(`http://localhost:${FASTIFY_HTTP_PORT}/api/event/active/stop`, { method: 'POST' });
      await stopBroadcastServer();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('lobby:serverStatus', () => ({
    running: getServerRunning(),
    active:  getActiveEventInfo(),
  }));
}
