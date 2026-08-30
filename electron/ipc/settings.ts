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
import type { AppSettings } from '../settings';
import { saveSettings } from '../settings';
import { appSettings, setAppSettings, mainWindow } from '../state';
import { createTray, destroyTray } from '../tray';
import { applyAutoLaunch } from '../window';
import { setNotificationsEnabled } from '../notifications';

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => ({ ...appSettings }));

  ipcMain.handle('settings:set', async (_event, partial: Partial<AppSettings>) => {
    const prev = { ...appSettings };
    const next = { ...appSettings, ...partial };
    setAppSettings(next);
    saveSettings(next);

    // React to changes immediately
    if (partial.trayEnabled !== undefined && partial.trayEnabled !== prev.trayEnabled) {
      if (partial.trayEnabled) {
        createTray();
      } else {
        destroyTray();
        // If the window was hidden (tray mode), show it again
        if (!mainWindow?.isVisible()) mainWindow?.show();
      }
    }

    if (partial.notificationsEnabled !== undefined) {
      setNotificationsEnabled(partial.notificationsEnabled);
    }

    if (partial.trayEnabled !== undefined) {
      // Update the autolaunch registration to match tray preference
      await applyAutoLaunch(partial.trayEnabled);
    }

    return { success: true, settings: { ...next } };
  });
}
