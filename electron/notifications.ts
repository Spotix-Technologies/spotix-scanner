/**
 * Spotix Scanner — Professional Event Check-in System
 * Copyright © 2026 Spotix Technologies. All rights reserved.
 *
 * Central notification handler as all Electron Notification calls go through here.
 * Notifications can be globally enabled/disabled via setNotificationsEnabled().
 */

import { Notification, BrowserWindow } from 'electron';
import { ICON_PATH } from './paths';

let _notificationsEnabled = true;

export function setNotificationsEnabled(enabled: boolean): void {
  _notificationsEnabled = enabled;
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

function navigate(page: string): void {
  const win = getMainWindow();
  if (win) win.webContents.send('menu:navigate', page);
}

function canNotify(): boolean {
  return _notificationsEnabled && Notification.isSupported();
}

// Public APIs

/** Generic notification — used by settings and one-off alerts */
export function notifyGeneral(title: string, body: string): void {
  if (!canNotify()) return;
  const n = new Notification({ title, body, icon: ICON_PATH, silent: false });
  n.on('click', () => getMainWindow()?.focus());
  n.show();
}

/** Import complete — shown after guest list import finishes */
export function notifyImportDone(eventName: string, imported: number, skipped: number): void {
  if (!canNotify()) return;
  const n = new Notification({
    title:  'Guest List Imported',
    body:   `${imported} guests imported for "${eventName}"${skipped > 0 ? ` (${skipped} skipped)` : ''}.`,
    icon:   ICON_PATH,
    silent: false,
  });
  n.on('click', () => { getMainWindow()?.focus(); navigate('/welcome'); });
  n.show();
}

/** Auto-sync warning — fires 1 hour before a scheduled auto-sync */
export function notifyAutoSyncSoon(eventName: string): void {
  if (!canNotify()) return;
  const n = new Notification({
    title:   'Auto Sync in 1 Hour',
    body:    `Auto Sync for "${eventName}" is happening in about 1 hour. Check-ins will be paused during that time as Spotix scanner syncs the check-in.`,
    icon:    ICON_PATH,
    silent:  false,
    urgency: 'normal',
  });
  n.on('click', () => { getMainWindow()?.focus(); navigate('/sync'); });
  n.show();
}

/** Auto-sync succeeded */
export function notifyAutoSyncDone(eventName: string, synced: number): void {
  if (!canNotify()) return;
  const n = new Notification({
    title:  'Auto Sync Completed',
    body:   `${synced} check-in${synced !== 1 ? 's' : ''} synced for "${eventName}".`,
    icon:   ICON_PATH,
    silent: false,
  });
  n.on('click', () => { getMainWindow()?.focus(); navigate('/sync'); });
  n.show();
}

/** Auto-sync failed — user can click to open sync page */
export function notifyAutoSyncFailed(eventName: string, reason: string): void {
  if (!canNotify()) return;
  const n = new Notification({
    title:   `Sync Failed — ${eventName}`,
    body:    `Auto Sync failed. Check the sync logs for details. Reason: ${reason}`,
    icon:    ICON_PATH,
    silent:  false,
    urgency: 'critical',
  });
  n.on('click', () => {
    getMainWindow()?.focus();
    getMainWindow()?.webContents.send('sync:open-with-error', { eventName, reason });
    navigate('/sync');
  });
  n.show();
}
