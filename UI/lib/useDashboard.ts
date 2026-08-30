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

'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import PocketBase from 'pocketbase';
import type { Log } from '../types/log';
import type { Guest } from '../types/guest';
import type { Scanner } from '../types/scanner';
import type { ActiveEvent } from './useActiveEvent';

const POCKETBASE_URL = 'http://127.0.0.1:8090';
const FASTIFY_URL    = 'http://127.0.0.1:2006'; // admin HTTP layer — NOT the scanner HTTPS port (2005)

export interface DashboardState {
  logs:        Log[];
  wsLogs:      Log[];
  guests:      Guest[];
  scanners:    Scanner[];
  totalGuests: number;
  checkedIn:   number;
  pending:     number;
  invalidScans: number;
  isLoading:   boolean;
  lastUpdated: Date | null;
}

function mergeLogs(existing: Log[], incoming: Log[]): Log[] {
  const seen = new Set<string>();
  const merged: Log[] = [];
  for (const log of [...incoming, ...existing]) {
    const key = `${log.ticketId}-${log.result}-${log.checkedInTime}-${log.scannerId}`;
    if (!seen.has(key)) { seen.add(key); merged.push(log); }
  }
  merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return merged;
}

export function useDashboard(activeEvent: ActiveEvent | null) {
  const [state, setState] = useState<DashboardState>({
    logs: [], wsLogs: [], guests: [], scanners: [],
    totalGuests: 0, checkedIn: 0, pending: 0, invalidScans: 0,
    isLoading: true, lastUpdated: null,
  });

  const pbRef = useRef<PocketBase | null>(null);
  if (!pbRef.current) pbRef.current = new PocketBase(POCKETBASE_URL);
  const pb = pbRef.current;

  const refreshStats = useCallback(async () => {
    try {
      // Scope queries to active event if one is selected
      const eventFilter = activeEvent?.eventId
        ? `eventId="${activeEvent.eventId}"`
        : null;

      const guestsQuery = eventFilter
        ? pb.collection('guests').getFullList<Guest>({ filter: eventFilter })
        : pb.collection('guests').getFullList<Guest>();

      const logsQuery = eventFilter
        ? pb.collection('logs').getFullList<Log>({ sort: '-timestamp', filter: eventFilter })
        : pb.collection('logs').getFullList<Log>({ sort: '-timestamp' });

      const [logsResult, guestsResult] = await Promise.all([logsQuery, guestsQuery]);

      const checkedIn    = guestsResult.filter(g => g.checkedIn).length;
      const invalidScans = logsResult.filter(l => l.result === 'invalid').length;

      setState(prev => ({
        ...prev,
        logs: logsResult,
        guests: guestsResult,
        totalGuests: guestsResult.length,
        checkedIn,
        pending: guestsResult.length - checkedIn,
        invalidScans,
        isLoading: false,
        lastUpdated: new Date(),
      }));
    } catch (err) {
      console.error('[Dashboard] Failed to load data:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [pb, activeEvent?.eventId]);

  const refreshScanners = useCallback(async () => {
    try {
      const res = await fetch(`${FASTIFY_URL}/api/scanners`);
      if (res.ok) {
        const scanners = await res.json();
        setState(prev => ({ ...prev, scanners }));
      }
    } catch {}
  }, []);

  const blockScanner   = useCallback(async (id: string) => {
    await fetch(`${FASTIFY_URL}/api/scanners/${id}/block`,   { method: 'POST' });
    refreshScanners();
  }, [refreshScanners]);

  const unblockScanner = useCallback(async (id: string) => {
    await fetch(`${FASTIFY_URL}/api/scanners/${id}/unblock`, { method: 'POST' });
    refreshScanners();
  }, [refreshScanners]);

  useEffect(() => {
    refreshStats();
    refreshScanners();

    let guestsUnsub: (() => void) | null = null;
    let logsUnsub:   (() => void) | null = null;

    const setupSubscriptions = async () => {
      try {
        guestsUnsub = await pb.collection('guests').subscribe<Guest>('*', (e) => {
          // Only react to records belonging to the active event
          if (activeEvent?.eventId && e.record.eventId !== activeEvent.eventId) return;

          if (e.action === 'update' && e.record.checkedIn) {
            setState(prev => {
              const updated   = prev.guests.map(g => g.id === e.record.id ? e.record : g);
              const checkedIn = updated.filter(g => g.checkedIn).length;
              return { ...prev, guests: updated, checkedIn, pending: updated.length - checkedIn, lastUpdated: new Date() };
            });
          }
          if (e.action === 'create') {
            setState(prev => {
              const guests    = [...prev.guests, e.record];
              const checkedIn = guests.filter(g => g.checkedIn).length;
              return { ...prev, guests, totalGuests: guests.length, checkedIn, pending: guests.length - checkedIn, lastUpdated: new Date() };
            });
          }
        });

        logsUnsub = await pb.collection('logs').subscribe<Log>('*', (e) => {
          if (activeEvent?.eventId && e.record.eventId !== activeEvent.eventId) return;
          if (e.action === 'create') {
            setState(prev => {
              const newLogs      = [e.record, ...prev.logs];
              const invalidScans = newLogs.filter(l => l.result === 'invalid').length;
              return { ...prev, logs: newLogs, invalidScans, lastUpdated: new Date() };
            });
          }
        });
      } catch (err) {
        console.error('[Dashboard] PocketBase SSE error:', err);
      }
    };

    setupSubscriptions();

    // WebSocket — live feed
    let ws: WebSocket | null = null;
    const connectWS = () => {
      try {
        ws = new WebSocket('ws://127.0.0.1:2006/ws?scannerId=admin-dashboard&name=Admin');
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
              case 'scan_result': {
                const { log } = msg.payload as { log: Log; guest: Guest | null };
                if (activeEvent?.eventId && log.eventId !== activeEvent.eventId) break;
                const wsLog: Log = { ...log, id: `ws-${Date.now()}` };
                setState(prev => ({ ...prev, wsLogs: mergeLogs(prev.wsLogs, [wsLog]).slice(0, 100) }));
                break;
              }
              case 'scanner_joined':
                setTimeout(refreshScanners, 200);
                break;
              case 'scanner_left': {
                const { scannerId } = msg.payload as { scannerId: string };
                setState(prev => ({ ...prev, scanners: prev.scanners.filter(s => s.id !== scannerId) }));
                break;
              }
              case 'scanner_blocked':
              case 'scanner_unblocked':
                refreshScanners();
                break;
              case 'guests_imported':
                refreshStats();
                break;
              case 'event_ended':
                setState(prev => ({
                  ...prev, logs: [], wsLogs: [], guests: [],
                  totalGuests: 0, checkedIn: 0, pending: 0, invalidScans: 0,
                  lastUpdated: new Date(),
                }));
                break;
            }
          } catch {}
        };
        ws.onclose = () => setTimeout(connectWS, 3000);
        ws.onerror = () => ws?.close();
      } catch {
        setTimeout(connectWS, 3000);
      }
    };

    connectWS();

    const statsInterval   = setInterval(refreshStats,    10_000);
    const scannerInterval = setInterval(refreshScanners,  5_000);

    return () => {
      guestsUnsub?.();
      logsUnsub?.();
      try { pb.collection('guests').unsubscribe('*'); } catch {}
      try { pb.collection('logs').unsubscribe('*');   } catch {}
      ws?.close();
      clearInterval(statsInterval);
      clearInterval(scannerInterval);
    };
  }, [activeEvent?.eventId]);

  return {
    ...state,
    feedLogs: mergeLogs(state.logs, state.wsLogs),
    blockScanner,
    unblockScanner,
    refresh: refreshStats,
  };
}
