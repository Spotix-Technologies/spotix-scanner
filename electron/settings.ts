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

import fs from 'fs';
import { SETTINGS_PATH } from './paths';

export interface AppSettings {
  trayEnabled:            boolean;
  notificationsEnabled:   boolean;
  autoSyncDialogOnImport: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  trayEnabled:            true,
  notificationsEnabled:   true,
  autoSyncDialogOnImport: true,
};

export function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { /* corrupt file — use defaults */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2)); } catch { /* ignore */ }
}
