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
 * Central place for every filesystem path, port number, and platform flag
 * the main process needs. Nothing in here has side effects except ensuring
 * NEXT_OUT_DIR exists (mirrors the previous main.ts behaviour).
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export const POCKETBASE_PORT   = 8090;
export const FASTIFY_PORT      = 2005; // HTTPS — for scanner devices over LAN
export const FASTIFY_HTTP_PORT = 2006; // HTTP  — for the Electron window

export const IS_DEV = !app.isPackaged;
export const IS_WIN = process.platform === 'win32';

export const USER_DATA     = app.getPath('userData');
export const PB_DATA_DIR   = path.join(USER_DATA, 'pb_data');
export const CERT_DIR      = path.join(USER_DATA, 'certs');
export const SETTINGS_PATH = path.join(USER_DATA, 'settings.json');

export const NEXT_OUT_DIR = IS_DEV
  ? path.join(__dirname, '../../UI/out')
  : path.join(process.resourcesPath, 'app', 'UI', 'out');

export const PB_BINARY = IS_DEV
  ? path.join(__dirname, '../../electron/pocketbase-win', IS_WIN ? 'pocketbase.exe' : 'pocketbase')
  : path.join(process.resourcesPath, 'pocketbase', IS_WIN ? 'pocketbase.exe' : 'pocketbase');

export const ICON_PATH = IS_DEV
  ? path.join(__dirname, '../../assets/icon.ico')
  : path.join(process.resourcesPath, 'assets', 'icon.ico');

// The admin account is no longer hardcoded/prefilled — it's created by the
// operator on first launch via the Sign Up screen (see ipc/auth.ts +
// credentials.ts) and stored locally in ADMIN_CREDENTIALS_PATH. These
// process.env values are only ever set at runtime, after signup/login, by
// credentials.ts — never shipped as defaults.
export const PB_ADMIN_EMAIL    = process.env.PB_ADMIN_EMAIL    || '';
export const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || '';

/** Local, per-machine store for the admin account created via Sign Up.
 *  Holds { email, password } so the server layer (same process) and the
 *  autosync scheduler can silently re-authenticate with PocketBase without
 *  prompting the operator again on every launch. Never shipped/hardcoded. */
export const ADMIN_CREDENTIALS_PATH = path.join(USER_DATA, 'admin-credentials.json');

/** Local-only profile info (username) for display purposes. PocketBase's
 *  PocketBase's `_superusers` auth collection has no custom-field support, so the username
 *  entered at signup is kept here instead of in PocketBase. */
export const ADMIN_PROFILE_PATH = path.join(USER_DATA, 'admin-profile.json');

/** Ensures the UI's static export dir exists so the HTTP server has
 *  something to serve even on a totally fresh checkout (dev convenience). This should NEVER happen in prod!!!!!!!!!! */
export function ensureStaticDirExists(): void {
  if (!fs.existsSync(NEXT_OUT_DIR)) {
    fs.mkdirSync(NEXT_OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(NEXT_OUT_DIR, 'index.html'),
      '<html><body><p>Spotix Scanner needs the UI to be built. If you are a dev in Spotix just build UI only with pnpm build:UI. If you are a user, kindly <a href="https://booker.spotix.com.ng/scanner/report">report</a> this issue</p></body></html>');
  }
}
