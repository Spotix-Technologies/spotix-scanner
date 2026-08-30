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

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('spotix', {
  // Auth — login/signup for the local PocketBase admin account (replaces
  // the previous auto-prefilled hardcoded credentials)
  auth: {
    status: () =>
      ipcRenderer.invoke('auth:status'),
    signup: (payload: { username: string; email: string; password: string }) =>
      ipcRenderer.invoke('auth:signup', payload),
    login: (payload: { email: string; password: string }) =>
      ipcRenderer.invoke('auth:login', payload),
  },

  // Guest management
  importGuests: (filePath: string) =>
    ipcRenderer.invoke('guests:import', filePath),
  openGuestFileDialog: () =>
    ipcRenderer.invoke('dialog:openGuestFile'),

  // Logs
  exportLogs: (format: 'csv' | 'json' | 'both') =>
    ipcRenderer.invoke('logs:export', format),
  importLogs: () =>
    ipcRenderer.invoke('logs:import'),

  // Event lifecycle
  endEvent: (exportFormat: 'csv' | 'json' | 'both') =>
    ipcRenderer.invoke('event:end', exportFormat),

  // Shell
  openPath: (filePath: string) =>
    ipcRenderer.invoke('shell:openPath', filePath),

  // Resources
  openResource: (resource: 'terms' | 'guide') =>
    ipcRenderer.invoke('resources:open', resource),

  // Network
  getLocalIP: () =>
    ipcRenderer.invoke('network:getLocalIP'),
  getScannerUrl: () =>
    ipcRenderer.invoke('network:getScannerUrl'),

  // Settings 
  settings: {
    get: () =>
      ipcRenderer.invoke('settings:get'),
    set: (partial: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:set', partial),
  },

  // Lobby server controls 
  lobby: {
    startServer: (eventInfo: { eventId: string; pbId: string; eventName: string }) =>
      ipcRenderer.invoke('lobby:startServer', eventInfo),
    stopServer: () =>
      ipcRenderer.invoke('lobby:stopServer'),
    getStatus: () =>
      ipcRenderer.invoke('lobby:serverStatus'),
    // Live push from main whenever the broadcasting server starts/stops
    // fixed the lobby buttons staying stuck on "Start" until the page is
    // remounted, since the renderer no longer has to poll or wait for a
    // navigation to find out the server state changed.
    onStatusChanged: (callback: (status: { running: boolean; active: { eventId: string; pbId: string; eventName: string } | null }) => void) => {
      const handler = (_: unknown, status: any) => callback(status);
      ipcRenderer.on('lobby:statusChanged', handler);
      return () => { ipcRenderer.removeListener('lobby:statusChanged', handler); };
    },
  },

  // ── Menu event listeners (menu → React) ───────────────────────────────────
  onMenuAction: (callback: (action: string) => void) => {
    const handlers: Record<string, (...args: unknown[]) => void> = {
      'menu:import-guests': () => callback('import-guests'),
      'menu:export-logs':   () => callback('export-logs'),
      'menu:import-logs':   () => callback('import-logs'),
      'menu:end-event':     () => callback('end-event'),
    };
    for (const [channel, handler] of Object.entries(handlers)) {
      ipcRenderer.on(channel, handler);
    }
    return () => {
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcRenderer.removeListener(channel, handler);
      }
    };
  },

  // Navigation from menu
  onNavigate: (callback: (path: string) => void) => {
    const handler = (_: unknown, path: string) => callback(path);
    ipcRenderer.on('menu:navigate', handler);
    return () => { ipcRenderer.removeListener('menu:navigate', handler); };
  },

  // Auto-sync management
  autoSync: {
    create: (record: {
      eventId: string; eventName: string; syncUrl: string;
      syncKey: string; scheduledAt: string;
    }) => ipcRenderer.invoke('autosync:create', record),
    list: (eventId?: string) =>
      ipcRenderer.invoke('autosync:list', eventId),
    delete: (id: string) =>
      ipcRenderer.invoke('autosync:delete', id),
    reset: (id: string) =>
      ipcRenderer.invoke('autosync:reset', id),
  },

  // Sync error from notification click
  onSyncError: (callback: (data: { eventName: string; reason: string }) => void) => {
    const handler = (_: unknown, data: { eventName: string; reason: string }) => callback(data);
    ipcRenderer.on('sync:open-with-error', handler);
    return () => { ipcRenderer.removeListener('sync:open-with-error', handler); };
  },
});
