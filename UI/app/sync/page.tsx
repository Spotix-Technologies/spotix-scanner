'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AutoSyncDialog from '../../components/admin/AutoSyncDialog';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, ArrowLeft, ChevronDown, Edit2, AlertTriangle,
  CheckCircle, XCircle, Wifi, WifiOff, Send, Clock, Loader2,
  ShieldAlert, Info,
} from 'lucide-react';

const FASTIFY_URL = 'http://127.0.0.1:2006'; // admin HTTP layer — NOT the scanner HTTPS port (2005)
const PB_URL      = 'http://127.0.0.1:8090';
const DEFAULT_SYNC_URL = 'https://booker.spotix.com.ng/api/sync';

interface EventRecord {
  id: string;
  eventId: string;
  eventName: string;
  importedAt: string;
}

interface SyncLog {
  time: string;
  level: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

type SyncState = 'idle' | 'syncing' | 'done' | 'error';

function timestamp() {
  return new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date());
}

export default function SyncPage() {
  const router = useRouter();

  const [events, setEvents]       = useState<EventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [selectedEventId, setSelectedEventId] = useState('');  // PB record eventId value
  const [syncUrl, setSyncUrl]     = useState(DEFAULT_SYNC_URL);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft]   = useState(DEFAULT_SYNC_URL);
  const [syncKey, setSyncKey]     = useState('');

  const [syncState, setSyncState]   = useState<SyncState>('idle');
  const [autoSyncOpen, setAutoSyncOpen] = useState(false);
  const [syncError, setSyncError]   = useState<{ eventName: string; reason: string } | null>(null);
  const [logs, setLogs]           = useState<SyncLog[]>([]);
  const [online, setOnline]       = useState(true);

  const logsEndRef  = useRef<HTMLDivElement>(null);
  const retryTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Notification click handler (sync error from tray notification) ─────────
  useEffect(() => {
    const spotix = (window as any).spotix;
    if (!spotix?.onSyncError) return;
    const cleanup = spotix.onSyncError((data: { eventName: string; reason: string }) => {
      setSyncError(data);
      addLog('error', `Notification: Sync for "${data.eventName}" failed — ${data.reason}`);
    });
    return cleanup;
  }, []);

  // ── Online detection ───────────────────────────────────────────────────────
  useEffect(() => {
    const up   = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online',  up);
    window.addEventListener('offline', down);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // ── Auto-scroll logs ───────────────────────────────────────────────────────
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // ── Load events ────────────────────────────────────────────────────────────
  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res  = await fetch(`${PB_URL}/api/collections/events/records?sort=-importedAt&perPage=50`);
      const data = await res.json() as { items: EventRecord[] };
      setEvents(data.items ?? []);
    } catch {
      // PB not ready
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Append log ─────────────────────────────────────────────────────────────
  const addLog = useCallback((level: SyncLog['level'], message: string) => {
    setLogs(prev => [...prev, { time: timestamp(), level, message }]);
  }, []);

  // ── Core sync logic ────────────────────────────────────────────────────────
  const doSync = useCallback(async () => {
    if (!selectedEventId || !syncKey.trim() || !syncUrl.trim()) return;
    if (!online) {
      addLog('warn', 'No internet connection — will retry when back online');
      return;
    }

    setSyncState('syncing');
    addLog('info', `Starting sync for event: ${selectedEventId}`);

    // 1. Lock event in scanner (prevents new check-ins)
    try {
      await fetch(`${FASTIFY_URL}/api/events/${selectedEventId}/lock`, { method: 'POST' });
      addLog('info', 'Event locked — check-ins paused for this event');
    } catch {
      addLog('warn', 'Could not lock event via local server — continuing anyway');
    }

    // 2. Fetch checked-in guests from PocketBase
    let checkedInTickets: Array<{ ticketId: string; checkedInAt: string }> = [];
    try {
      addLog('info', 'Fetching checked-in guests from local database...');
      const filter = encodeURIComponent(`(eventId='${selectedEventId}' && checkedIn=true)`);
      const res    = await fetch(
        `${PB_URL}/api/collections/guests/records?filter=${filter}&perPage=500&fields=ticketId,checkedInAt`
      );
      if (!res.ok) throw new Error(`PocketBase error ${res.status}`);
      const data = await res.json() as { items: Array<{ ticketId: string; checkedInAt: string }> };
      checkedInTickets = data.items ?? [];
      addLog('info', `Found ${checkedInTickets.length} checked-in ticket${checkedInTickets.length !== 1 ? 's' : ''} to sync`);
    } catch (e) {
      addLog('error', `Failed to fetch local check-ins: ${e}`);
      setSyncState('error');
      unlockEvent();
      return;
    }

    if (checkedInTickets.length === 0) {
      addLog('warn', 'No checked-in tickets found — nothing to sync');
      setSyncState('done');
      unlockEvent();
      return;
    }

    // 3. POST to Booker sync endpoint
    addLog('info', `Sending ${checkedInTickets.length} records to ${syncUrl}...`);
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    const attemptSync = async (): Promise<void> => {
      attempts++;
      if (!navigator.onLine) {
        addLog('warn', `Offline — waiting for connection (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        await new Promise<void>(resolve => {
          const handler = () => { window.removeEventListener('online', handler); resolve(); };
          window.addEventListener('online', handler);
        });
      }

      try {
        addLog('info', `POST attempt ${attempts}...`);
        const res = await fetch(syncUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            eventId: selectedEventId,
            key:     syncKey.trim(),
            checkedInTickets,
          }),
        });

        const body = await res.json().catch(() => ({})) as any;

        if (res.status === 403) {
          addLog('error', 'Invalid sync key — verify it matches what was generated in Booker');
          setSyncState('error');
          unlockEvent();
          return;
        }

        if (!res.ok) {
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }

        addLog('success', `Synced ${body.synced ?? checkedInTickets.length} record${(body.synced ?? 1) !== 1 ? 's' : ''} successfully`);
        if (body.failed > 0) {
          addLog('warn', `${body.failed} ticket${body.failed !== 1 ? 's' : ''} failed to sync: ${(body.failedTicketIds ?? []).join(', ')}`);
        }
        setSyncState('done');
        addLog('success', 'Sync complete ✓');
        unlockEvent();
      } catch (e) {
        if (attempts < MAX_ATTEMPTS) {
          const delay = Math.min(2000 * attempts, 15000);
          addLog('warn', `Attempt ${attempts} failed: ${e} — retrying in ${delay / 1000}s`);
          await new Promise(r => { retryTimer.current = setTimeout(r, delay); });
          return attemptSync();
        } else {
          addLog('error', `All ${MAX_ATTEMPTS} attempts failed: ${e}`);
          setSyncState('error');
          unlockEvent();
        }
      }
    };

    await attemptSync();
  }, [selectedEventId, syncKey, syncUrl, online, addLog]);

  const unlockEvent = useCallback(async () => {
    if (!selectedEventId) return;
    try {
      await fetch(`${FASTIFY_URL}/api/events/${selectedEventId}/unlock`, { method: 'POST' });
      addLog('info', 'Event unlocked — check-ins resumed');
    } catch {
      addLog('warn', 'Could not unlock event automatically — restart scanner if needed');
    }
  }, [selectedEventId, addLog]);

  // ── Retry when coming back online during error ─────────────────────────────
  useEffect(() => {
    if (online && syncState === 'error') {
      addLog('info', 'Internet restored — you can retry the sync');
    }
  }, [online]);

  const canSync = selectedEventId && syncKey.trim() && syncUrl.trim() && syncState !== 'syncing';
  const selectedEvent = events.find(e => e.eventId === selectedEventId);

  return (
    <>
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">

      {/* ── Topbar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/welcome')}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          <span className="text-sm font-semibold text-white/80">Sync Check-ins</span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
          online
            ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
            : 'bg-red-400/10 text-red-400 border border-red-400/20'
        }`}>
          {online ? <Wifi size={11} /> : <WifiOff size={11} />}
          {online ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: form ── */}
        <div className="w-96 flex-shrink-0 border-r border-white/[0.05] overflow-y-auto px-6 py-7 flex flex-col gap-6">

          {/* Event selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Event</label>
            {eventsLoading ? (
              <div className="h-11 rounded-xl bg-white/[0.04] animate-pulse" />
            ) : events.length === 0 ? (
              <div className="flex items-center gap-2 bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3">
                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-300">No events found — import a guest list first</p>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedEventId}
                  onChange={e => setSelectedEventId(e.target.value)}
                  disabled={syncState === 'syncing'}
                  className="w-full appearance-none bg-[#141414] border border-white/[0.08] rounded-xl px-4 py-3 pr-10 text-sm text-white focus:outline-none focus:border-brand-500/50 disabled:opacity-50 cursor-pointer"
                >
                  <option value="" disabled>Select an event...</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.eventId}>
                      {ev.eventName} ({ev.eventId})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Sync URL */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Sync Endpoint</label>
            {editingUrl ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3">
                  <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-300 leading-relaxed">
                    Only change this if you are using a self-hosted Spotix Booker instance.
                  </p>
                </div>
                <input
                  value={urlDraft}
                  onChange={e => setUrlDraft(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#141414] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSyncUrl(urlDraft); setEditingUrl(false); }}
                    className="flex-1 py-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold hover:bg-brand-500/15 transition-all"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setUrlDraft(syncUrl); setEditingUrl(false); }}
                    className="flex-1 py-2 rounded-xl border border-white/[0.08] text-white/40 text-xs font-semibold hover:bg-white/[0.04] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-[#141414] border border-white/[0.08] rounded-xl px-4 py-3">
                <span className="flex-1 text-sm text-white/50 font-mono truncate">{syncUrl}</span>
                <button
                  onClick={() => { setUrlDraft(syncUrl); setEditingUrl(true); }}
                  disabled={syncState === 'syncing'}
                  className="p-1 text-white/20 hover:text-white/50 transition-colors flex-shrink-0 disabled:opacity-30"
                  title="Edit URL"
                >
                  <Edit2 size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Sync Key */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Sync Key</label>
            <input
              type="password"
              value={syncKey}
              onChange={e => setSyncKey(e.target.value)}
              disabled={syncState === 'syncing'}
              placeholder="12-character key from Booker export"
              className="w-full bg-[#141414] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none font-mono tracking-widest disabled:opacity-50"
            />
            <div className="flex items-start gap-2 px-1">
              <Info size={11} className="text-white/20 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-white/20 leading-relaxed">
                Generated when you exported the guest list from Spotix Booker. Tied to the selected event.
              </p>
            </div>
          </div>

          {/* Sync button */}
          <button
            onClick={doSync}
            disabled={!canSync}
            className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
              canSync
                ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-white/[0.05] text-white/20 cursor-not-allowed'
            }`}
          >
            {syncState === 'syncing' ? (
              <><Loader2 size={16} className="animate-spin" /> Syncing...</>
            ) : (
              <><Send size={16} /> Start Sync</>
            )}
          </button>

          {/* Status badge */}
          {/* Auto-sync setup */}
          {selectedEventId && (
            <button
              onClick={() => setAutoSyncOpen(true)}
              disabled={syncState === 'syncing'}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-white/[0.08] text-white/50 text-sm font-semibold hover:bg-white/[0.04] hover:text-white/70 transition-all disabled:opacity-30"
            >
              <RefreshCw size={14} /> Set Up Auto Sync
            </button>
          )}

          {syncState === 'done' && (
            <div className="flex items-center gap-2 bg-emerald-400/5 border border-emerald-400/20 rounded-xl px-4 py-3">
              <CheckCircle size={16} className="text-emerald-400" />
              <p className="text-sm text-emerald-400 font-medium">Sync complete</p>
            </div>
          )}
          {syncState === 'error' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-red-400/5 border border-red-400/20 rounded-xl px-4 py-3">
                <XCircle size={16} className="text-red-400" />
                <p className="text-sm text-red-400 font-medium">Sync failed</p>
              </div>
              <button
                onClick={() => { setSyncState('idle'); doSync(); }}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/[0.08] text-white/50 text-sm hover:bg-white/[0.04] transition-all"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}

          {/* Notification sync error */}
          {syncError && (
            <div className="flex flex-col gap-1 bg-red-400/5 border border-red-400/20 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-red-400">Last sync failed</p>
              <p className="text-xs text-red-300/70">{syncError.reason}</p>
            </div>
          )}

          {/* Lock warning */}{'}'}
          {syncState === 'syncing' && selectedEvent && (
            <div className="flex items-start gap-2 bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3">
              <ShieldAlert size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300 leading-relaxed">
                Check-ins for <strong>{selectedEvent.eventName}</strong> are paused while syncing.
              </p>
            </div>
          )}
        </div>

        {/* ── Right: live logs ── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Sync Log</span>
            {logs.length > 0 && (
              <button
                onClick={() => setLogs([])}
                className="text-xs text-white/20 hover:text-white/40 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.03] flex items-center justify-center">
                  <Clock size={20} className="text-white/10" />
                </div>
                <p className="text-white/20">Log output will appear here</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-white/20 flex-shrink-0 pt-px">{log.time}</span>
                    <span className={`flex-shrink-0 pt-px w-14 ${
                      log.level === 'success' ? 'text-emerald-400' :
                      log.level === 'error'   ? 'text-red-400'     :
                      log.level === 'warn'    ? 'text-amber-400'   :
                      'text-white/40'
                    }`}>
                      [{log.level.toUpperCase().padEnd(7)}]
                    </span>
                    <span className={`leading-relaxed ${
                      log.level === 'success' ? 'text-emerald-300' :
                      log.level === 'error'   ? 'text-red-300'     :
                      log.level === 'warn'    ? 'text-amber-300'   :
                      'text-white/60'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* Auto-sync dialog */}
      {selectedEventId && (
        <AutoSyncDialog
          open={autoSyncOpen}
          onClose={() => setAutoSyncOpen(false)}
          eventId={selectedEventId}
          eventName={selectedEvent?.eventName || selectedEventId}
        />
      )}
    </>
  );
}
