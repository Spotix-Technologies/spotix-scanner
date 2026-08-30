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
 * Auth IPC — backs the UI's Login/Sign Up pages. Replaces the previous
 * behaviour of silently bootstrapping PocketBase with a hardcoded
 * admin@spotix.local / Sp0tix@Scanner2024! account on every launch.
 *
 *  - auth:status  — does an admin account exist on this machine yet, and is
 *                   the current session already authenticated?
 *  - auth:signup  — first-run only: create the admin account (username,
 *                   email, password), then log in.
 *  - auth:login   — authenticate an existing admin account.
 */

import { ipcMain } from 'electron';
import { createAdminAccount, loginAdmin } from '../pocketbase-process';
import { hasAdminAccount, saveCredentials, loadProfile, saveProfile } from '../credentials';
import { getAuthenticated, setAuthenticated } from '../state';
import { startAutoSyncScheduler } from '../autosync';

interface SignupPayload { username: string; email: string; password: string; }
interface LoginPayload  { email: string; password: string; }

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function registerAuthIpc(): void {
  ipcMain.handle('auth:status', async () => {
    const profile = loadProfile();
    return {
      hasAdmin:      hasAdminAccount(),
      authenticated: getAuthenticated(),
      username:      profile?.username ?? null,
    };
  });

  ipcMain.handle('auth:signup', async (_event, payload: SignupPayload) => {
    const { username, email, password } = payload ?? ({} as SignupPayload);

    if (hasAdminAccount()) {
      return { success: false, error: 'An admin account already exists on this machine — please log in instead.' };
    }
    if (!username?.trim()) return { success: false, error: 'Username is required.' };
    if (!isValidEmail(email ?? '')) return { success: false, error: 'Enter a valid email address.' };
    if (!password || password.length < 8) return { success: false, error: 'Password must be at least 8 characters.' };

    const result = await createAdminAccount(email.trim(), password);
    if (!result.success) return { success: false, error: result.error ?? 'Could not create the admin account.' };

    saveCredentials({ email: email.trim(), password });
    saveProfile({ username: username.trim(), email: email.trim() });
    setAuthenticated(true);
    startAutoSyncScheduler();

    return { success: true, username: username.trim() };
  });

  ipcMain.handle('auth:login', async (_event, payload: LoginPayload) => {
    const { email, password } = payload ?? ({} as LoginPayload);

    if (!hasAdminAccount()) {
      return { success: false, error: 'No admin account exists yet — please sign up first.' };
    }
    if (!isValidEmail(email ?? '') || !password) {
      return { success: false, error: 'Enter your email and password.' };
    }

    const result = await loginAdmin(email.trim(), password);
    if (!result.success) return { success: false, error: result.error ?? 'Invalid email or password.' };

    // Keep the local credential store in sync in case the password was
    // rotated directly in PocketBase's own dashboard.
    saveCredentials({ email: email.trim(), password });
    const profile = loadProfile();
    if (!profile || profile.email !== email.trim()) {
      saveProfile({ username: profile?.username ?? email.trim(), email: email.trim() });
    }

    setAuthenticated(true);
    startAutoSyncScheduler();

    return { success: true, username: (loadProfile()?.username) ?? null };
  });
}
