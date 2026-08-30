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
 * Replaces the previous hardcoded PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD.
 * The admin account is now created by the operator on first launch (Sign
 * Up) and stored locally, per-machine, in userData. On load we also mirror
 * the values onto process.env so that server/db.ts and autosync.ts — which
 * live in a separate TS project but run in the same Electron process — pick
 * them up transparently without any cross-project imports.
 */

import fs from 'fs';
import { ADMIN_CREDENTIALS_PATH, ADMIN_PROFILE_PATH } from './paths';

export interface AdminCredentials {
  email:    string;
  password: string;
}

export interface AdminProfile {
  username: string;
  email:    string;
}

export function loadCredentials(): AdminCredentials | null {
  try {
    if (!fs.existsSync(ADMIN_CREDENTIALS_PATH)) return null;
    const raw = fs.readFileSync(ADMIN_CREDENTIALS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AdminCredentials;
    if (!parsed.email || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Saves credentials to disk and mirrors them onto process.env immediately
 *  so every module in this process (electron/* and server/*) can auth. */
export function saveCredentials(creds: AdminCredentials): void {
  fs.writeFileSync(ADMIN_CREDENTIALS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 });
  applyCredentialsToEnv(creds);
}

export function applyCredentialsToEnv(creds: AdminCredentials): void {
  process.env.PB_ADMIN_EMAIL    = creds.email;
  process.env.PB_ADMIN_PASSWORD = creds.password;
}

/** Call once at boot so a returning operator's stored credentials are
 *  available to server/db.ts and autosync.ts immediately, even before they
 *  re-authenticate through the login screen. Does not mark the session as
 *  authenticated — that still requires a successful login. */
export function primeEnvFromDisk(): void {
  const creds = loadCredentials();
  if (creds) applyCredentialsToEnv(creds);
}

export function hasAdminAccount(): boolean {
  return loadCredentials() !== null;
}

export function loadProfile(): AdminProfile | null {
  try {
    if (!fs.existsSync(ADMIN_PROFILE_PATH)) return null;
    return JSON.parse(fs.readFileSync(ADMIN_PROFILE_PATH, 'utf-8')) as AdminProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: AdminProfile): void {
  fs.writeFileSync(ADMIN_PROFILE_PATH, JSON.stringify(profile, null, 2));
}
