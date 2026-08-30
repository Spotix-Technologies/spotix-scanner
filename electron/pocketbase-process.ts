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
 * Spawns/stops the PocketBase v0.36.8 child process, and provides the
 * signup/login entry points that create or authenticate the single admin
 * account. Schema creation lives in pocketbase-setup.ts.
 *
 * Note: startPocketBase() no longer bootstraps a hardcoded admin account.
 * The DB engine comes up empty of any admin until the operator signs up or
 * logs in from the UI — see ipc/auth.ts.
 */

import { spawn } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { PB_BINARY, PB_DATA_DIR, POCKETBASE_PORT } from './paths';
import { pbProcess, setPbProcess } from './state';
import { upsertAdminCli, authenticateAdmin, provisionCollections } from './pocketbase-setup';

export async function startPocketBase(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[DB] IS_DEV=${!app.isPackaged}`);
    console.log(`[DB] Looking for binary at: ${PB_BINARY}`);

    if (!fs.existsSync(PB_BINARY)) {
      reject(new Error('PocketBase binary not found'));
      return;
    }

    const proc = spawn(PB_BINARY, [
      'serve',
      `--http=127.0.0.1:${POCKETBASE_PORT}`,
      `--dir=${PB_DATA_DIR}`,
    ]);
    setPbProcess(proc);

    proc.stdout?.on('data', (d: Buffer) => console.log(`[DB] ${d.toString().trim()}`));
    proc.stderr?.on('data', (d: Buffer) => console.error(`[DB] ${d.toString().trim()}`));
    proc.on('exit', (code) => console.log(`[DB] Killed with code ${code}`));

    const checkReady = async (retries: number): Promise<boolean> => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${POCKETBASE_PORT}/api/health`);
          if (res.ok) return true;
        } catch { /* not ready yet */ }
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    };

    checkReady(30).then((ready) => {
      ready ? resolve() : reject(new Error('PocketBase failed to start'));
    });
  });
}

export interface AuthResult {
  success: boolean;
  token?:  string;
  error?:  string;
}

/** First-run Sign Up: creates the superuser account via the v0.36.8 CLI, then
 *  authenticates and provisions every collection Spotix Scanner needs. */
export async function createAdminAccount(email: string, password: string): Promise<AuthResult> {
  try {
    const created = await upsertAdminCli(PB_BINARY, PB_DATA_DIR, email, password);
    if (!created) {
      return { success: false, error: 'PocketBase rejected the account (check the bundled binary is v0.36.8).' };
    }
    const token = await authenticateAdmin(email, password);
    await provisionCollections(token);
    return { success: true, token };
  } catch (err) {
    return { success: false, error: String(err instanceof Error ? err.message : err) };
  }
}

/** Returning-operator Login: just authenticates + re-provisions (idempotent,
 *  cheap) so schema drift never blocks a normal login. */
export async function loginAdmin(email: string, password: string): Promise<AuthResult> {
  try {
    const token = await authenticateAdmin(email, password);
    await provisionCollections(token);
    return { success: true, token };
  } catch (err) {
    return { success: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export function stopPocketBase(): void {
  if (pbProcess) {
    pbProcess.kill();
    setPbProcess(null);
    console.log('[DB] Stopped');
  }
}

/** Full factory reset — wipes every collection and record. Kept for a
 *  future explicit "Reset App Data" settings action. NEVER call this from
 *  the normal "End Event" flow — ending an event must only mark it closed,
 *  not destroy data (see ipc/logs.ts). */
export async function purgeDatabase(): Promise<void> {
  if (pbProcess) {
    const proc = pbProcess;
    proc.kill();
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      proc.on('exit', () => { clearTimeout(timeout); resolve(); });
    });
    setPbProcess(null);
  }
  await new Promise(r => setTimeout(r, 500));

  const dbFile    = path.join(PB_DATA_DIR, 'data.db');
  const dbWalFile = path.join(PB_DATA_DIR, 'data.db-wal');
  const dbShmFile = path.join(PB_DATA_DIR, 'data.db-shm');

  try {
    if (fs.existsSync(dbFile))    fs.rmSync(dbFile,    { force: true });
    if (fs.existsSync(dbWalFile)) fs.rmSync(dbWalFile, { force: true });
    if (fs.existsSync(dbShmFile)) fs.rmSync(dbShmFile, { force: true });
    console.log('[DB] Database purged');
  } catch (err) {
    console.error('[DB] Failed to delete database files:', err);
    throw err;
  }

  await startPocketBase();
  console.log('[DB] Fresh database ready — admin account and schema must be re-created');
}
