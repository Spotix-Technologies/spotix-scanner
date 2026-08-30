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
 * Central, mutable main-process state. Every other electron/* module reads
 * or writes through here instead of holding its own module-level globals —
 * this is what lets the tray, the lobby IPC handlers, and the renderer all
 * agree on "is the server running, and for which event" without circular
 * imports between window.ts / tray.ts / ipc/lobby.ts.
 */

import type { BrowserWindow, Tray } from 'electron';
import type { ChildProcess } from 'child_process';
import type { AppSettings } from './settings';
import { loadSettings } from './settings';

// Windows / tray / processes 

export let mainWindow:   BrowserWindow | null = null;
export let splashWindow: BrowserWindow | null = null;
export let tray:         Tray | null = null;
export let pbProcess:    ChildProcess | null = null;

export function setMainWindow(win: BrowserWindow | null)   { mainWindow = win; }
export function setSplashWindow(win: BrowserWindow | null) { splashWindow = win; }
export function setTray(t: Tray | null)                    { tray = t; }
export function setPbProcess(p: ChildProcess | null)       { pbProcess = p; }

// Fastify server handle
//
// Shape matches the return type of createServer() in server/server.ts.
export interface FastifyServerHandle {
  startHttp:      () => Promise<string>;
  stopHttp:       () => Promise<void>;
  startHttps:     () => Promise<string>;
  stopHttps:      () => Promise<void>;
  isHttpsRunning: () => boolean;
  httpAddress:    string;
}

export let fastifyServer: FastifyServerHandle | null = null;
export function setFastifyServer(handle: FastifyServerHandle | null) { fastifyServer = handle; }

// Broadcasting (HTTPS / scanner-facing) server status 
//
// Tracks whether the fastify HTTPS server is running, and for which event —
// set only when an event is selected in the lobby (see ipc/lobby.ts).

export interface ActiveEventInfo {
  eventId:   string;
  pbId:      string;
  eventName: string;
}

let _serverRunning = false;
let _activeEvent: ActiveEventInfo | null = null;

export function getServerRunning(): boolean { return _serverRunning; }
export function getActiveEventInfo(): ActiveEventInfo | null { return _activeEvent; }

/**
 * Single place that updates broadcasting status AND notifies every renderer
 * window (currently just the main window, but this stays correct even if
 * more windows are added later) so the lobby UI reacts immediately instead
 * of staying stale until the page remounts. Also keeps the tray in sync.
 */
export function setServerStatus(running: boolean, eventInfo: ActiveEventInfo | null): void {
  _serverRunning = running;
  _activeEvent   = running ? eventInfo : null;

  mainWindow?.webContents.send('lobby:statusChanged', {
    running: _serverRunning,
    active:  _activeEvent,
  });
}

// App settings (in-memory cache, persisted via settings.ts)

export let appSettings: AppSettings = loadSettings();
export function setAppSettings(next: AppSettings): void { appSettings = next; }

// Auth session (in-memory only — cleared on every app restart, so the
// operator must log in again each launch even though the admin account
// itself persists on disk via credentials.ts)

let _authenticated = false;
export function getAuthenticated(): boolean { return _authenticated; }
export function setAuthenticated(v: boolean): void { _authenticated = v; }
