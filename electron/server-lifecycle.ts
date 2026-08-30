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
 * - Bug fix note in v2 of the scanner
 * Previously, "Start" in the lobby called the same fastifyServer.start()
 * that already ran once at app boot to bring up the admin HTTP layer — so
 * calling it again from the lobby tried to re-listen on a port that was
 * already bound, and "Stop" never actually closed the HTTPS server at all
 * (it only cleared the active-event record in PocketBase). Combined with no
 * push notification to the renderer, the lobby buttons looked frozen until
 * the page was remounted.
 *
 * server/server.ts now exposes independent startHttp/stopHttp (admin layer,
 * started once at boot) and startHttps/stopHttps (scanner-facing layer,
 * toggled here). setServerStatus() pushes the new status straight to the
 * renderer and refreshes the tray every time it changes.
 */

import { createServer } from '../server/server';
import { fastifyServer, setFastifyServer, setServerStatus, type ActiveEventInfo } from './state';
import { CERT_DIR, NEXT_OUT_DIR, FASTIFY_PORT, FASTIFY_HTTP_PORT } from './paths';
import { updateTrayMenu } from './tray';

/** Builds the Fastify server object and starts the always-on HTTP admin
 *  layer. Called once during app startup. The HTTPS (scanner) layer is left
 *  stopped until the lobby explicitly starts it. */
export async function initFastifyServer(): Promise<void> {
  const server = await createServer({
    certDir:   CERT_DIR,
    staticDir: NEXT_OUT_DIR,
    port:      FASTIFY_PORT,
    httpPort:  FASTIFY_HTTP_PORT,
  });
  setFastifyServer(server);
  await server.startHttp();
}

/** Starts the HTTPS (scanner-facing) server for the given event and
 *  notifies the renderer + tray immediately. No-op if already running. */
export async function startBroadcastServer(eventInfo: ActiveEventInfo): Promise<void> {
  if (!fastifyServer) throw new Error('Fastify server not initialised');
  if (!fastifyServer.isHttpsRunning()) {
    await fastifyServer.startHttps();
  }
  setServerStatus(true, eventInfo);
  updateTrayMenu();
  console.log(`[Server] Broadcasting server started for "${eventInfo.eventName}"`);
}

/** Stops the HTTPS (scanner-facing) server and notifies the renderer + tray
 *  immediately. No-op if already stopped. */
export async function stopBroadcastServer(): Promise<void> {
  if (!fastifyServer) return;
  if (fastifyServer.isHttpsRunning()) {
    await fastifyServer.stopHttps();
  }
  setServerStatus(false, null);
  updateTrayMenu();
  console.log('[Server] Broadcasting server stopped');
}

/** Full shutdown of both layers — used on app quit. */
export async function stopAllServers(): Promise<void> {
  if (!fastifyServer) return;
  await fastifyServer.stopHttps();
  await fastifyServer.stopHttp();
}
