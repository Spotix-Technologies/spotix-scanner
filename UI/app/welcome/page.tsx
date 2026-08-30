'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, RefreshCw, Calendar, Clock, Users,
  ChevronRight, FolderOpen, Zap, LayoutDashboard,
  Scan, ArrowRight, FileJson, AlertCircle, CheckCircle,
  SkipForward, X, Settings, Play, Square, Loader2, Power,
} from 'lucide-react';
import AutoSyncDialog from '../../components/admin/AutoSyncDialog';
import { useActiveEvent } from '../../lib/useActiveEvent';

const FASTIFY_URL = 'http://127.0.0.1:2006'; // admin HTTP layer — NOT the scanner HTTPS port (2005)
const PB_URL      = 'http://127.0.0.1:8090';

interface EventRecord {
  id: string;
  eventId: string;
  eventName: string;
  importedAt: string;
  guestCount?: number;
  checkedInCount?: number;
}

type ImportState = 'idle' | 'loading' | 'success' | 'partial' | 'error';

// ── Import Panel (shown inline on left side) ──────────────────────────────────
function ImportPanel({ onDone, onImported }: { onDone: () => void; onImported: (eventId: string, eventName: string) => void }) {
  const [state, setState]       = useState<ImportState>('idle');
  const [result, setResult]     = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [eventInfo, setEventInfo] = useState<{ eventId: string; eventName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isElectron = typeof window !== 'undefined' && !!(window as any).spotix;

  const resolveState = (imported: number, skipped: number): ImportState => {
    if (imported === 0 && skipped > 0) return 'error';
    if (skipped > 0) return 'partial';
    return 'success';
  };

  const importGuests = useCallback(async (parsed: unknown) => {
    setState('loading');
    setError(null);

    // Support both envelope { eventId, eventName, guests: [] } and bare array []
    let eventId   = '';
    let eventName = '';
    let guests: unknown[];

    if (Array.isArray(parsed)) {
      guests = parsed;
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      'guests' in (parsed as object) &&
      Array.isArray((parsed as any).guests)
    ) {
      const env = parsed as { eventId?: string; eventName?: string; guests: unknown[] };
      eventId   = env.eventId   ?? '';
      eventName = env.eventName ?? '';
      guests    = env.guests;
    } else {
      setError('Invalid format — expected a JSON array or Spotix envelope');
      setState('error');
      return;
    }

    setEventInfo(eventId ? { eventId, eventName } : null);

    try {
      const res = await fetch(`${FASTIFY_URL}/api/guests/import`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ guests, eventId, eventName }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text}`);
      }

      const data = await res.json() as { imported: number; skipped: number };
      setResult(data);
      setState(resolveState(data.imported, data.skipped));
      onDone();
      if (eventId) onImported(eventId, eventName);
    } catch (err) {
      setError(String(err));
      setState('error');
    }
  }, [onDone]);

  const handleElectronImport = useCallback(async () => {
    const spotix = (window as any).spotix;
    if (!spotix) return;
    const filePath = await spotix.openGuestFileDialog();
    if (!filePath) return;

    setState('loading');
    setError(null);

    try {
      const res = await spotix.importGuests(filePath);
      if ('error' in res) {
        setError(res.error);
        setState('error');
      } else {
        setResult(res);
        setState(resolveState(res.imported, res.skipped));
        onDone();
      }
    } catch (err) {
      setError(String(err));
      setState('error');
    }
  }, [onDone]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        await importGuests(parsed);
      } catch {
        setError('Failed to parse JSON — make sure the file is valid');
        setState('error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [importGuests]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.json')) {
      setError('Please drop a .json file');
      setState('error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        await importGuests(parsed);
      } catch (err) {
        setError(String(err));
        setState('error');
      }
    };
    reader.readAsText(file);
  }, [importGuests]);

  const handleClick = () => {
    if (isElectron) handleElectronImport();
    else fileInputRef.current?.click();
  };

  return (
    <>
    <div className="flex flex-col gap-4">
      <input ref={fileInputRef} type="file" accept=".json,application/json"
        onChange={handleFileInput} className="hidden" />

      {state === 'idle' && (
        <button
          onClick={handleClick}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center gap-3 py-10 px-4 rounded-xl border-2 border-dashed transition-all ${
            isDragging
              ? 'border-brand-500/60 bg-brand-500/5'
              : 'border-white/[0.08] hover:border-brand-500/30 hover:bg-white/[0.02]'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Upload size={22} className="text-brand-400" />
          </div>
          <div className="text-center">
            <p className="text-sm text-white/70">
              {isElectron ? 'Select guest list JSON' : 'Click or drag guest list JSON here'}
            </p>
            <p className="text-xs text-white/30 mt-0.5">Exported from Spotix Booker</p>
          </div>
        </button>
      )}

      {state === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-sm text-white/50">Importing guests...</p>
        </div>
      )}

      {(state === 'success' || state === 'partial') && result && (
        <div className="flex flex-col gap-3">
          {eventInfo && (
            <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-xl px-4 py-3">
              <Calendar size={14} className="text-brand-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-brand-300">{eventInfo.eventName}</p>
                <p className="text-[11px] text-white/30 font-mono">{eventInfo.eventId}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 bg-emerald-400/5 border border-emerald-400/20 rounded-xl p-4">
            <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-400">Import successful</p>
              <p className="text-xs text-white/40 mt-0.5">
                {result.imported} guest{result.imported !== 1 ? 's' : ''} imported
              </p>
            </div>
          </div>
          {state === 'partial' && (
            <div className="flex items-center gap-3 bg-amber-400/5 border border-amber-400/20 rounded-xl p-4">
              <SkipForward size={18} className="text-amber-400 flex-shrink-0" />
              <p className="text-xs text-white/50">{result.skipped} duplicate{result.skipped !== 1 ? 's' : ''} skipped</p>
            </div>
          )}
          <button onClick={handleClick}
            className="text-xs text-white/30 hover:text-white/60 transition-colors text-center py-1">
            Import another file
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 bg-red-400/5 border border-red-400/20 rounded-xl p-4">
            <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Import failed</p>
              <p className="text-xs text-white/40 mt-0.5 break-all">{error}</p>
            </div>
          </div>
          <button onClick={() => { setState('idle'); setError(null); }}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors text-center py-1">
            Try again
          </button>
        </div>
      )}

      {/* Format hint */}
      <div className="bg-[#0f0f0f] rounded-lg p-3 mt-1">
        <div className="flex items-center gap-1.5 mb-1.5">
          <FileJson size={12} className="text-white/30" />
          <span className="text-xs text-white/30">Expected format</span>
        </div>
        <pre className="text-[11px] text-white/30 font-mono leading-relaxed overflow-x-auto">{`{
  "eventId": "abc123",
  "eventName": "Tech Summit 2026",
  "guests": [{ "fullName": "Ada Obi", ... }]
}`}</pre>
      </div>
    </div>
    </>
  );
}

// ── Main Welcome Page ─────────────────────────────────────────────────────────
export default function WelcomePage () {
  const router = useRouter();
  const { setActiveEvent } = useActiveEvent();
  const [activePanel, setActivePanel] = useState<'import' | 'sync' | null>(null);
  const [autoSyncEvent, setAutoSyncEvent] = useState<{ eventId: string; eventName: string } | null>(null);
  const [autoSyncOpen, setAutoSyncOpen] = useState(false);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // ── Broadcasting server state ───────────────────────────────────────────────
  // `activeServerId` is the pb record ID of the event whose server is running.
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [serverLoading, setServerLoading]   = useState<string | null>(null); // pbId being toggled

  const isElectron = typeof window !== 'undefined' && !!(window as any).spotix;

  // Auth gate: if there's no admin account yet, or the current session
  // hasn't logged in, bounce to /login before rendering anything that talks
  // to PocketBase. Only applies inside Electron — dev-in-browser has no
  // main process to auth against.
  const [authChecked, setAuthChecked] = useState(!isElectron);
  useEffect(() => {
    if (!isElectron) return;
    const spotix = (window as any).spotix;
    if (!spotix?.auth) { setAuthChecked(true); return; }
    spotix.auth.status().then((status: { authenticated: boolean }) => {
      if (!status.authenticated) {
        router.replace('/login');
      } else {
        setAuthChecked(true);
      }
    });
  }, [isElectron, router]);

  // On mount, check current server status, then stay subscribed to live
  // pushes from the main process so the buttons update the instant the
  // broadcasting server actually starts/stops — no remount required.
  useEffect(() => {
    const spotix = (window as any).spotix;
    if (!spotix?.lobby) return;

    let cancelled = false;

    const init = async () => {
      try {
        const status = await spotix.lobby.getStatus();
        if (!cancelled) setActiveServerId(status.running ? (status.active?.pbId ?? null) : null);
      } catch { /* server not started yet */ }
    };
    init();

    const unsubscribe = spotix.lobby.onStatusChanged((status: { running: boolean; active: { pbId: string } | null }) => {
      setActiveServerId(status.running ? (status.active?.pbId ?? null) : null);
      setServerLoading(null);
    });

    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch(`${PB_URL}/api/collections/events/records?sort=-importedAt&perPage=20`);
      if (!res.ok) return;
      const data = await res.json() as { items: EventRecord[] };
      const records = data.items ?? [];

      const enriched = await Promise.all(
        records.map(async (ev) => {
          try {
            const gRes = await fetch(
              `${PB_URL}/api/collections/guests/records?filter=${encodeURIComponent(`(eventId='${ev.eventId}')`)}` +
              `&fields=checkedIn&perPage=500`
            );
            if (!gRes.ok) return ev;
            const gData = await gRes.json() as { items: { checkedIn: boolean }[] };
            const guests = gData.items ?? [];
            return {
              ...ev,
              guestCount:     guests.length,
              checkedInCount: guests.filter(g => g.checkedIn).length,
            };
          } catch { return ev; }
        })
      );
      setEvents(enriched);
    } catch {
      // PocketBase may not be ready yet
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Start server for an event ───────────────────────────────────────────────
  const handleStartServer = useCallback(async (ev: EventRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const spotix = (window as any).spotix;
    if (!spotix?.lobby) return;

    setServerLoading(ev.id);
    try {
      const eventInfo = { eventId: ev.eventId, pbId: ev.id, eventName: ev.eventName || 'Unnamed Event' };
      const result = await spotix.lobby.startServer(eventInfo);
      if (result.success) {
        setActiveServerId(ev.id);
        // Also set the active event in the client state
        setActiveEvent(eventInfo);
      }
    } catch (err) {
      console.error('[Lobby] Failed to start server:', err);
    } finally {
      setServerLoading(null);
    }
  }, [setActiveEvent]);

  // ── Stop server ─────────────────────────────────────────────────────────────
  const handleStopServer = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const spotix = (window as any).spotix;
    if (!spotix?.lobby) return;

    setServerLoading(activeServerId);
    try {
      await spotix.lobby.stopServer();
      setActiveServerId(null);
    } catch (err) {
      console.error('[Lobby] Failed to stop server:', err);
    } finally {
      setServerLoading(null);
    }
  }, [activeServerId]);

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-NG', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch { return iso; }
  };

  // Don't flash the dashboard before we know whether the session is
  // actually authenticated — the /login redirect above fires from inside
  // useEffect, which runs after the first render.
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">

      {/* ── Topbar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center">
            <img src="/logo.png" alt="Spotix" className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-semibold text-white/80">Spotix Scanner</span>
          <span className="text-xs text-white/20 font-mono">Welcome</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/settings')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
          >
            <Settings size={13} />
            Settings
          </button>
          <button
            onClick={() => { router.push('/dashboard'); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
          >
            <LayoutDashboard size={13} />
            Dashboard
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
        <div className="w-80 flex-shrink-0 border-r border-white/[0.05] flex flex-col overflow-y-auto">

          {/* Hero */}
          <div className="px-6 pt-8 pb-6">
            <h1 className="text-2xl font-bold text-white leading-tight">
              Welcome to<br />
              <span className="text-gradient">Spotix Scanner</span>
            </h1>
            <p className="text-sm text-white/40 mt-2 leading-relaxed">
              Import a guest list to start scanning, or sync completed check-ins back to Booker.
            </p>
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 flex flex-col gap-2">
            {/* Import Guests */}
            <button
              onClick={() => setActivePanel(activePanel === 'import' ? null : 'import')}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left transition-all ${
                activePanel === 'import'
                  ? 'bg-brand-500/15 border border-brand-500/30 text-white'
                  : 'hover:bg-white/[0.04] border border-transparent text-white/60 hover:text-white'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                activePanel === 'import' ? 'bg-brand-500/20' : 'bg-white/[0.06]'
              }`}>
                <FolderOpen size={15} className={activePanel === 'import' ? 'text-brand-400' : 'text-white/40'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Import Guests</p>
                <p className="text-xs text-white/30 mt-0.5">Load a Booker guest list JSON</p>
              </div>
              <ChevronRight size={14} className={`flex-shrink-0 transition-transform ${activePanel === 'import' ? 'rotate-90 text-brand-400' : 'text-white/20'}`} />
            </button>

            {/* Inline import panel */}
            {activePanel === 'import' && (
              <div className="mx-1 mt-1 mb-2">
                <ImportPanel
                  onDone={loadEvents}
                  onImported={async (id, name) => {
                    // Check if settings say to show auto-sync dialog
                    const spotix = (window as any).spotix;
                    let showDialog = true;
                    if (spotix?.settings) {
                      try {
                        const s = await spotix.settings.get();
                        showDialog = s.autoSyncDialogOnImport ?? true;
                      } catch { /* default to true */ }
                    }
                    if (showDialog) {
                      setAutoSyncEvent({ eventId: id, eventName: name });
                      setAutoSyncOpen(true);
                    }
                  }}
                />
              </div>
            )}

            {/* Sync Guests */}
            <button
              onClick={() => router.push('/sync')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left hover:bg-white/[0.04] border border-transparent text-white/60 hover:text-white transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                <RefreshCw size={15} className="text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Sync Check-ins</p>
                <p className="text-xs text-white/30 mt-0.5">Push results back to Spotix Booker</p>
              </div>
              <ChevronRight size={14} className="text-white/20 flex-shrink-0" />
            </button>
          </div>

          {/* Divider */}
          <div className="mx-6 border-t border-white/[0.05] my-2" />

          {/* Quick links */}
          <div className="px-4 pb-4 flex flex-col gap-1">
            <p className="px-2 text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-1">Quick Access</p>
            {[
              { icon: Scan, label: 'Scanner', path: '/scanner' },
              { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
              { icon: Users, label: 'Manage Registry', path: '/manage' },
            ].map(({ icon: Icon, label, path }) => (
              <button
                key={path}
                onClick={() => router.push(path)}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-left hover:bg-white/[0.04] border border-transparent text-white/40 hover:text-white/70 transition-all"
              >
                <Icon size={14} />
                <span className="text-sm">{label}</span>
                <ArrowRight size={12} className="ml-auto opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>

        {/* ── Right panel — recent events ── */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-white">Recent Events</h2>
                <p className="text-xs text-white/30 mt-0.5">Events imported into this scanner</p>
              </div>
              <button
                onClick={loadEvents}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
              >
                <RefreshCw size={12} className={eventsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {eventsLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 rounded-xl bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                  <Calendar size={28} className="text-white/20" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/40">No events yet</p>
                  <p className="text-xs text-white/20 mt-1">Import a guest list to get started</p>
                </div>
                <button
                  onClick={() => setActivePanel('import')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm font-medium hover:bg-brand-500/15 transition-all"
                >
                  <Upload size={14} />
                  Import Guest List
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {events.map((ev) => {
                  const pct = ev.guestCount
                    ? Math.round(((ev.checkedInCount ?? 0) / ev.guestCount) * 100)
                    : 0;
                  const isActive  = activeServerId === ev.id;
                  const isLoading = serverLoading === ev.id;

                  return (
                    <div
                      key={ev.id}
                      className={`group flex items-center gap-5 p-5 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-brand-500/8 border-brand-500/30'
                          : 'bg-white/[0.02] border-white/[0.05] hover:border-white/[0.10]'
                      }`}
                    >
                      {/* Icon */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                        isActive ? 'bg-brand-500/20' : 'bg-brand-500/10'
                      }`}>
                        <Calendar size={20} className="text-brand-400" />
                      </div>

                      {/* Info — clicking navigates to dashboard */}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          setActiveEvent({ eventId: ev.eventId, pbId: ev.id, eventName: ev.eventName || 'Unnamed Event' });
                          router.push('/dashboard');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">{ev.eventName || 'Unnamed Event'}</p>
                          {isActive && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-400/10 border border-emerald-400/20 text-[10px] font-medium text-emerald-400 flex-shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-white/30 font-mono truncate">{ev.eventId}</span>
                          <span className="text-[11px] text-white/20">·</span>
                          <span className="flex items-center gap-1 text-[11px] text-white/30">
                            <Clock size={10} />
                            {formatDate(ev.importedAt)}
                          </span>
                        </div>

                        {ev.guestCount != null && ev.guestCount > 0 && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-white/30 flex-shrink-0">
                              {ev.checkedInCount ?? 0}/{ev.guestCount} checked in
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Start / Stop button — only in Electron */}
                      {isElectron && (
                        isActive ? (
                          <button
                            onClick={handleStopServer}
                            disabled={!!serverLoading}
                            title="Stop broadcasting server"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/10 border border-red-400/20 text-red-400 text-xs font-medium hover:bg-red-400/20 transition-all disabled:opacity-50 flex-shrink-0"
                          >
                            {isLoading
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Square size={13} />
                            }
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleStartServer(ev, e)}
                            disabled={!!serverLoading || !!activeServerId}
                            title={activeServerId ? 'Stop the current event first' : 'Start broadcasting server for this event'}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium hover:bg-brand-500/20 transition-all disabled:opacity-40 flex-shrink-0"
                          >
                            {isLoading
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Play size={13} />
                            }
                            Start
                          </button>
                        )
                      )}

                      {/* Chevron for non-electron */}
                      {!isElectron && (
                        <ChevronRight
                          size={16}
                          className="text-white/20 group-hover:text-brand-400 flex-shrink-0 transition-colors cursor-pointer"
                          onClick={() => {
                            setActiveEvent({ eventId: ev.eventId, pbId: ev.id, eventName: ev.eventName || 'Unnamed Event' });
                            router.push('/dashboard');
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* Auto-sync setup dialog — shown after import */}
      {autoSyncEvent && (
        <AutoSyncDialog
          open={autoSyncOpen}
          onClose={() => setAutoSyncOpen(false)}
          eventId={autoSyncEvent.eventId}
          eventName={autoSyncEvent.eventName}
        />
      )}
    </>
  );
}
