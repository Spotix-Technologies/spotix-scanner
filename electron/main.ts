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
 * -Module Map-
 * This file used to be ~770 lines doing everything itself which is like crazy asf. It's now just
 * app-lifecycle orchestration; the actual work lives in:
 *
 *   paths.ts               constants — ports, file paths, dev/win flags
 *   settings.ts             AppSettings load/save
 *   state.ts                 shared mutable state (windows, tray, server
 *                            handle, live broadcasting status)
 *   network.ts                getLocalIPs / freePort
 *   pocketbase-process.ts      spawn/stop the PocketBase child process;
 *                              createAdminAccount/loginAdmin for signup/login
 *   pocketbase-setup.ts         PocketBase v0.36.8 CLI/API + collection schema
 *   credentials.ts               locally-provisioned admin account storage
 *   server-lifecycle.ts          start/stop the Fastify HTTP+HTTPS layers
 *   tray.ts                       system tray (now event-name aware)
 *   window.ts                      splash + main BrowserWindow + auto-launch
 *   admin-auth.ts                   PocketBase admin token for IPC handlers
 *   ipc/                              one file per IPC handler group
 *                                     (ipc/auth.ts: login/signup — this is
 *                                     what kicks off schema provisioning and
 *                                     the auto-sync scheduler, not boot)
 *   menu.ts, updater.ts, notifications.ts, autosync.ts   (unchanged)
 */

import { app, BrowserWindow } from 'electron';

// Must be called BEFORE app is ready
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');

// Windows taskbar / toast identity
if (process.platform === 'win32') {
  app.setAppUserModelId('com.spotix.scanner');
}

import { ensureStaticDirExists, POCKETBASE_PORT, FASTIFY_PORT, FASTIFY_HTTP_PORT } from './paths';
import { mainWindow, appSettings } from './state';
import { freePort } from './network';
import { startPocketBase, stopPocketBase } from './pocketbase-process';
import { primeEnvFromDisk } from './credentials';
import { initFastifyServer, stopAllServers } from './server-lifecycle';
import { createTray, destroyTray } from './tray';
import { createSplash, createWindow, applyAutoLaunch } from './window';
import { buildAppMenu } from './menu';
import { checkForUpdates } from './updater';
import { setNotificationsEnabled } from './notifications';
import { stopAutoSyncScheduler } from './autosync';
import { registerIpcHandlers } from './ipc';

ensureStaticDirExists();

const IS_DEV = !app.isPackaged;

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    freePort(POCKETBASE_PORT);
    freePort(FASTIFY_PORT);
    freePort(FASTIFY_HTTP_PORT);

    createSplash();
    console.log('[App] Starting Spotix Scanner...');

    // If an admin account was already created on this machine (a prior
    // signup), make its credentials available to server/db.ts and
    // autosync.ts right away. The operator still has to log in each launch
    // (see ipc/auth.ts) — this just avoids "no admin configured" errors in
    // background code that might run before that.
    primeEnvFromDisk();

    // Start the PocketBase engine. No admin account or schema is
    // bootstrapped here anymore — that only happens once the operator signs
    // up or logs in from the UI (electron/ipc/auth.ts), which is also what
    // kicks off the auto-sync scheduler.
    await startPocketBase();

    // Build the Fastify server object and start the always-on HTTP admin
    // layer. The HTTPS (scanner-facing) layer stays down until the lobby
    // starts it for a specific event. See electron/server-lifecycle.ts.
    await initFastifyServer();

    registerIpcHandlers();

    // Create tray if enabled in settings
    if (appSettings.trayEnabled) {
      createTray();
      // Apply auto-launch
      await applyAutoLaunch(true);
    }

    setNotificationsEnabled(appSettings.notificationsEnabled);

    createWindow();
    buildAppMenu(mainWindow);

    if (!IS_DEV) setTimeout(() => checkForUpdates(mainWindow), 5000);

    // NOTE: the auto-sync scheduler is intentionally NOT started here.
    // It needs a working admin token, which only exists after the operator
    // signs up or logs in — ipc/auth.ts starts it at that point instead.
    console.log('[App] All set!');
  } catch (err) {
    console.error('[App] Startup failed:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // When tray is enabled the window is hidden not closed, so this fires only
  // when tray is disabled and the user closes the window.
  if (process.platform !== 'darwin') app.quit();
  // The major reason is to allow autosync in background if configured
});

app.on('before-quit', async () => {
  console.log('[App] Shutting down...');
  stopAutoSyncScheduler();
  await stopAllServers();
  stopPocketBase();
  destroyTray();
});

app.on('activate', () => {
  // macOS Only: re-open from dock
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else { mainWindow?.show(); mainWindow?.focus(); }
});
