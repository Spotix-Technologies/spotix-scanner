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

import { ipcMain, shell } from 'electron';
import path from 'path';
import { IS_DEV, FASTIFY_PORT } from '../paths';
import { getLocalIPs } from '../network';

export function registerMiscIpc(): void {
  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    await shell.showItemInFolder(filePath);
  });

  ipcMain.handle('resources:open', async (_event, resource: 'terms' | 'guide') => {
    const resourcePath = IS_DEV
      ? path.join(__dirname, '../../resources', `${resource === 'terms' ? 'terms' : 'operation-guide'}.pdf`)
      : path.join(process.resourcesPath, `${resource === 'terms' ? 'terms' : 'operation-guide'}.pdf`);
    await shell.openPath(resourcePath);
  });

  ipcMain.handle('network:getLocalIP', () => {
    const ips = getLocalIPs();
    return ips[0] ?? 'localhost';
  });

  ipcMain.handle('network:getScannerUrl', () => {
    const ips = getLocalIPs();
    const ip  = ips[0] ?? 'localhost';
    return `https://${ip}:${FASTIFY_PORT}/scanner`;
  });
}
