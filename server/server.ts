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

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';

import { getOrCreateCert } from './ssl';
import { getToken } from './db';

import { registerHealthRoutes }    from './routes/health';
import { registerGuestRoutes }     from './routes/guests';
import { registerScannerRoutes }   from './routes/scanners';
import { registerLogRoutes }       from './routes/logs';
import { registerScanRoutes }      from './routes/scan';
import { registerEventRoutes }     from './routes/event';
import { registerWebSocketRoutes } from './routes/websocket';

// Re-export for electron/main.ts which calls getOrCreateCert directly
export { getOrCreateCert } from './ssl';

// ─── Route registration ───────────────────────────────────────────────────────

function applyRoutes(app: FastifyInstance): void {
  // Global CORS hook — must run before any route handler
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') reply.status(204).send();
  });

  registerHealthRoutes(app);
  registerGuestRoutes(app);
  registerScannerRoutes(app);
  registerLogRoutes(app);
  registerScanRoutes(app);
  registerEventRoutes(app);
  registerWebSocketRoutes(app);
}

// ─── Static file + SPA fallback helper ───────────────────────────────────────

async function applyStatic(app: FastifyInstance, staticDir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root:     staticDir,
    prefix:   '/',
    index:    'index.html',
    wildcard: false,
    setHeaders: (res, filePath) => {
      if (!path.extname(filePath)) {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
    },
  });

  // SPA fallback — serve index.html for extensionless routes (page navigations)
  app.setNotFoundHandler(async (req: FastifyRequest, reply: FastifyReply) => {
    const url          = req.url.split('?')[0];
    const hasExtension = path.extname(url) !== '';
    if (hasExtension) return reply.status(404).send({ error: 'Not found' });
    return reply.sendFile('index.html');
  });
}

// ─── Server factory ───────────────────────────────────────────────────────────

/**
 * Creates and configures two Fastify instances:
 *   - HTTPS on `port`      → used by scanner devices on the LAN (camera requires HTTPS)
 *   - HTTP  on `httpPort`  → used by the local admin Electron window (localhost only)
 *
 * Both instances share the same routes and the same in-memory state (state.ts).
 */
export async function createServer(options: {
  certDir: string;
  staticDir: string;
  port: number;
  httpPort: number;
}): Promise<{ start: () => Promise<string>; stop: () => Promise<void>; httpAddress: string }> {
  const { cert, key, localIPs } = getOrCreateCert(options.certDir);

  // HTTPS — for scanner devices
  const httpsApp = Fastify({ https: { cert, key }, logger: false });
  await httpsApp.register(fastifyWebsocket);
  await applyStatic(httpsApp, options.staticDir);
  applyRoutes(httpsApp);

  // HTTP — for local admin window (127.0.0.1 only, no SSL overhead)
  const httpApp = Fastify({ logger: false });
  await httpApp.register(fastifyWebsocket);
  await applyStatic(httpApp, options.staticDir);
  applyRoutes(httpApp);

  let _httpAddress = '';

  return {
    start: async () => {
      const address = await httpsApp.listen({ port: options.port, host: '0.0.0.0' });
      console.log(`[Server] HTTPS (scanners) → ${address}`);
      console.log(`[Server] Reachable at: ${localIPs.map(ip => `https://${ip}:${options.port}`).join(', ')}`);

      _httpAddress = await httpApp.listen({ port: options.httpPort, host: '127.0.0.1' });
      console.log(`[Server] HTTP  (admin)   → ${_httpAddress}`);

      try {
        await getToken();
        console.log('[Server] Database auth verified');
      } catch (e) {
        console.error('[Server] WARNING: Database auth failed on startup:', e);
      }

      return address;
    },
    stop: async () => {
      await httpsApp.close();
      await httpApp.close();
    },
    get httpAddress() { return _httpAddress; },
  };
}
