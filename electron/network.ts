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

import os from 'os';
import { execSync } from 'child_process';
import { IS_WIN } from './paths';

export function getLocalIPs(): string[] {
  const ips: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface ?? []) {
      if (config.family === 'IPv4' && !config.internal) ips.push(config.address);
    }
  }
  return ips;
}

/** Kills whatever process is bound to `port`, if any. Used on startup so a
 *  crashed previous instance doesn't leave the port unusable. 
 * Won't be a problem on a regular user's PC but will be for a techy person like me */
export function freePort(port: number): void {
  try {
    if (IS_WIN) {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
      const pids = new Set<string>();
      for (const line of result.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid   = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch { /* already dead lol*/ }
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9`, { stdio: 'ignore' });
    }
    console.log(`[App] Freed port ${port}`);
  } catch { /* port was already free */ }
}
