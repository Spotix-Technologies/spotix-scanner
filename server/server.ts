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

import { registerHealthRoutes }       from './routes/health';
import { registerGuestRoutes }        from './routes/guests';
import { registerScannerRoutes }      from './routes/scanners';
import { registerLogRoutes }          from './routes/logs';
import { registerScanRoutes }         from './routes/scan';
import { registerEventRoutes }        from './routes/event';
import { registerEventRecordRoutes }  from './routes/events';
import { registerWebSocketRoutes }    from './routes/websocket';

export { getOrCreateCert } from './ssl';

// Route registration 

function applyRoutes(app: FastifyInstance): void {
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
  registerEventRecordRoutes(app);
  registerWebSocketRoutes(app);
}

// Static file + SPA fallback 

async function applyStatic(app: FastifyInstance, staticDir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root:     staticDir,
    prefix:   '/',
    index:    'index.html',
    wildcard: false,
  });

  app.setNotFoundHandler(async (req: FastifyRequest, reply: FastifyReply) => {
    const url          = req.url.split('?')[0];
    const hasExtension = path.extname(url) !== '';
    if (hasExtension) return reply.status(404).send({ error: 'Not found' });
    return reply.sendFile('index.html');
  });
}

// Server factory 
// Here's the gist:
//
// Two independent Fastify instances share the same routes:
//   - httpApp  (127.0.0.1, options.httpPort) — the Electron window + Next.js UI
//     talk to this. It starts once at app boot and stays up for the whole
//     app session.
//   - httpsApp (0.0.0.0, options.port) — scanner devices over WiFi talk
//     to this. It is only listening while an event is "live" — started by
//     the lobby's Start button, stopped by Stop. Each has its own start/stop
//     so toggling the broadcast layer never touches the already-bound admin
//     HTTP port.

export async function createServer(options: {
  certDir:   string;
  staticDir: string;
  port:      number;
  httpPort:  number;
}): Promise<{
  startHttp:  () => Promise<string>;
  stopHttp:   () => Promise<void>;
  startHttps: () => Promise<string>;
  stopHttps:  () => Promise<void>;
  isHttpsRunning: () => boolean;
  httpAddress: string;
}> {
  const { cert, key, localIPs } = getOrCreateCert(options.certDir);

  const httpsApp = Fastify({ https: { cert, key }, logger: false });
  await httpsApp.register(fastifyWebsocket);
  await applyStatic(httpsApp, options.staticDir);
  applyRoutes(httpsApp);

  const httpApp = Fastify({ logger: false });
  await httpApp.register(fastifyWebsocket);
  await applyStatic(httpApp, options.staticDir);
  applyRoutes(httpApp);

  let _httpAddress    = '';
  let _httpsRunning   = false;

  return {
    startHttp: async () => {
      _httpAddress = await httpApp.listen({ port: options.httpPort, host: '127.0.0.1' });
      console.log(`[Server] HTTP  (admin)   → ${_httpAddress}`);

      try {
        await getToken();
        console.log('[Server] Database auth verified');
      } catch (e) {
        console.error('[Server] WARNING: Database auth failed on startup:', e);
      }

      return _httpAddress;
    },
    stopHttp: async () => {
      await httpApp.close();
    },

    startHttps: async () => {
      if (_httpsRunning) return `https://0.0.0.0:${options.port}`;
      const address = await httpsApp.listen({ port: options.port, host: '0.0.0.0' });
      _httpsRunning = true;
      console.log(`[Server] HTTPS (scanners) → ${address}`);
      console.log(`[Server] Reachable at: ${localIPs.map(ip => `https://${ip}:${options.port}`).join(', ')}`);
      return address;
    },
    stopHttps: async () => {
      if (!_httpsRunning) return;
      await httpsApp.close();
      _httpsRunning = false;
      console.log('[Server] HTTPS (scanners) stopped');
    },

    isHttpsRunning: () => _httpsRunning,
    get httpAddress() { return _httpAddress; },
  };
}
