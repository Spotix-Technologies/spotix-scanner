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

import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { IS_DEV, FASTIFY_HTTP_PORT } from './paths';
import { getLocalIPs } from './network';
import { mainWindow, setMainWindow, splashWindow, setSplashWindow, appSettings } from './state';

// ─── Splash ───────────────────────────────────────────────────────────────────

export function createSplash(): void {
  const version = app.getVersion();
  const win = new BrowserWindow({
    width: 480, height: 300,
    frame: false, transparent: false, resizable: false,
    center: true, alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  setSplashWindow(win);

  const splashPath = IS_DEV
    ? path.join(__dirname, '../../assets/splash.html')
    : path.join(process.resourcesPath, 'assets', 'splash.html');

  win.loadURL(`file://${splashPath}?v=${version}`);
  win.on('closed', () => { setSplashWindow(null); });
}

// ─── Main Window ──────────────────────────────────────────────────────────────

export function createWindow(): void {
  const trustedLocalIPs = new Set(['localhost', '127.0.0.1', ...getLocalIPs()]);

  session.defaultSession.setCertificateVerifyProc(
    (request: { hostname: string }, callback: (result: number) => void) => {
      trustedLocalIPs.has(request.hostname) ? callback(0) : callback(-3);
    }
  );

  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    title: 'Spotix Scanner',
    show: false,
  });
  setMainWindow(win);

  // When app starts, load via HTTP (server isn't started yet —
  // it's started on-demand from the lobby once an event is selected).
  // We load a static welcome page at startup using the local HTTP server
  // that serves the Next.js static output (this never goes down).
  const startUrl = `http://localhost:${FASTIFY_HTTP_PORT}/welcome`;
  win.loadURL(startUrl);

  win.once('ready-to-show', () => {
    splashWindow?.close();
    // Always start with a full, visible window — regardless of the
    // "Minimise to System Tray" setting. That setting only governs what
    // happens when the window is *closed* (see win.on('close') below); it
    // previously also hid the window on every launch, which made the app
    // look like it wasn't starting at all.
    win.show();
    win.focus();
  });

  // Close: minimise to tray (if tray is enabled), or actually just quit the mf
  win.on('close', (e) => {
    if (appSettings.trayEnabled) {
      e.preventDefault();
      win.hide();
    }
    // If tray is disabled, the default close behaviour terminates the window
    // and triggers window-all-closed then app.quit().
  });

  win.on('closed', () => { setMainWindow(null); });
}

// Auto-launch

export async function applyAutoLaunch(enabled: boolean): Promise<void> {
  try {
    const AutoLaunch = require('auto-launch');
    const launcher   = new AutoLaunch({ name: 'Spotix Scanner', path: app.getPath('exe') });
    if (enabled) await launcher.enable();
    else         await launcher.disable();
    console.log(`[AutoLaunch] ${enabled ? 'Enabled' : 'Disabled'}`);
  } catch (err) {
    console.warn('[AutoLaunch] Package not available or failed:', err);
  }
}
