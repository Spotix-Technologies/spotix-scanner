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
 * The tray previously only ever read a local `serverRunning` boolean that
 * was never updated by the lobby Stop flow, and it never showed which event
 * was live. updateTrayMenu() now reads from state.ts (the single source of
 * truth, kept current by server-lifecycle.ts) and renders
 * "Server online (eventName)" / "Server offline" accordingly. Call sites
 * that change server status call updateTrayMenu() right after, so the tray
 * is always in sync — no polling needed.
 */

import { app, Tray, Menu, nativeImage } from 'electron';
import fs from 'fs';
import { ICON_PATH } from './paths';
import { tray, setTray, mainWindow, getServerRunning, getActiveEventInfo, appSettings } from './state';

function getIconImage() {
  try {
    if (fs.existsSync(ICON_PATH)) return nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 });
  } catch { /* fallback */ }
  return nativeImage.createEmpty();
}

export function updateTrayMenu(): void {
  if (!tray) return;

  const running = getServerRunning();
  const active  = getActiveEventInfo();

  const statusLabel = running
    ? `🟢 Server online${active?.eventName ? ` (${active.eventName})` : ''}`
    : '🔴 Server offline';

  const contextMenu = Menu.buildFromTemplate([
    {
      label:   'Spotix Scanner',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: statusLabel,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open Spotix Scanner',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label:   appSettings.trayEnabled ? 'Minimise to Tray' : 'Tray Disabled',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // Keep the OS tooltip in sync too, so hovering the icon shows the same
  // status without needing to open the context menu.
  tray.setToolTip(running
    ? `Spotix Scanner is Online${active?.eventName ? ` (${active.eventName})` : ''}`
    : 'Spotix Scanner is Offline');
}

export function createTray(): void {
  if (tray) return;
  const t = new Tray(getIconImage());
  setTray(t);
  t.setToolTip('Spotix Scanner');
  updateTrayMenu();

  t.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

export function destroyTray(): void {
  if (tray) { tray.destroy(); setTray(null); }
}
