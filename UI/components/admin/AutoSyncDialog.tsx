'use client';

import { useState, useEffect } from 'react';
import { X, RefreshCw, Clock, Key, Link, CheckCircle, AlertTriangle, Loader2, Trash2, RotateCcw, Info } from 'lucide-react';

const DEFAULT_SYNC_URL = 'https://booker.spotix.com.ng/api/sync';

export interface AutoSyncDialogProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
}

interface AutoSyncRecord {
  id:          string;
  eventId:     string;
  eventName:   string;
  syncUrl:     string;
  scheduledAt: string;
  status:      'pending' | 'running' | 'done' | 'failed';
  lastError:   string | null;
  warned:      boolean;
}

export default function AutoSyncDialog({ open, onClose, eventId, eventName }: AutoSyncDialogProps) {
  const [syncUrl, setSyncUrl]       = useState(DEFAULT_SYNC_URL);
  const [syncKey, setSyncKey]       = useState('');
  const [scheduleDate, setDate]     = useState('');
  const [scheduleTime, setTime]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [existingJobs, setExisting] = useState<AutoSyncRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const spotix = typeof window !== 'undefined' ? (window as any).spotix : null;

  const loadJobs = async () => {
    if (!spotix?.autoSync) return;
    setLoadingJobs(true);
    const res = await spotix.autoSync.list(eventId);
    if (res.success) setExisting(res.records as AutoSyncRecord[]);
    setLoadingJobs(false);
  };

  useEffect(() => {
    if (!open) return;
    // Pre-fill with tomorrow 10:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow.toISOString().split('T')[0]);
    setTime('10:00');
    setSaved(false);
    setError(null);
    loadJobs();
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!syncKey.trim() || !scheduleDate || !scheduleTime) {
      setError('Please fill in all fields');
      return;
    }
    if (!spotix?.autoSync) {
      setError('Auto-sync requires the Electron desktop app');
      return;
    }

    setSaving(true);
    setError(null);

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
    const res = await spotix.autoSync.create({
      eventId, eventName,
      syncUrl: syncUrl.trim(),
      syncKey: syncKey.trim(),
      scheduledAt,
    });

    setSaving(false);

    if (res.success) {
      setSaved(true);
      setSyncKey('');
      loadJobs();
    } else {
      setError(res.error ?? 'Failed to schedule auto-sync');
    }
  };

  const handleDelete = async (id: string) => {
    if (!spotix?.autoSync) return;
    await spotix.autoSync.delete(id);
    loadJobs();
  };

  const handleReset = async (id: string) => {
    if (!spotix?.autoSync) return;
    await spotix.autoSync.reset(id);
    loadJobs();
  };

  const statusColor = (s: string) =>
    s === 'done'    ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' :
    s === 'failed'  ? 'text-red-400 bg-red-400/10 border-red-400/20' :
    s === 'running' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' :
                      'text-white/50 bg-white/[0.04] border-white/[0.08]';

  const formatScheduled = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-NG', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch { return iso; }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#141414] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <RefreshCw size={18} className="text-brand-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Set up Auto Sync</h2>
              <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                Spotix Scanner can automatically sync check-ins for <span className="text-white/60 font-medium">{eventName}</span> as soon as the device is connected to the internet.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">

          {/* Info banner */}
          <div className="flex items-start gap-3 bg-brand-500/5 border border-brand-500/15 rounded-xl p-4">
            <Info size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-white/50 leading-relaxed">
              You'll receive a notification 1 hour before sync starts. Check-ins for this event will be paused during the sync. You can still set up auto-sync again after a successful or failed sync.
            </p>
          </div>

          {/* Form */}
          <div className="flex flex-col gap-4">

            {/* Sync URL */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                <Link size={11} /> Sync Endpoint
              </label>
              <input
                value={syncUrl}
                onChange={e => setSyncUrl(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none font-mono"
              />
            </div>

            {/* Sync Key */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                <Key size={11} /> Sync Key
              </label>
              <input
                type="password"
                value={syncKey}
                onChange={e => setSyncKey(e.target.value)}
                placeholder="From Booker export"
                className="w-full bg-[#0f0f0f] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none font-mono tracking-widest"
              />
            </div>

            {/* Date + Time */}
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={11} /> Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setTime(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-400/5 border border-red-400/20 rounded-xl px-4 py-3">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 bg-emerald-400/5 border border-emerald-400/20 rounded-xl px-4 py-3">
              <CheckCircle size={14} className="text-emerald-400" />
              <p className="text-xs text-emerald-300">Auto-sync scheduled successfully.</p>
            </div>
          )}

          {/* Existing jobs */}
          {existingJobs.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">Scheduled Jobs</p>
              {existingJobs.map(job => (
                <div key={job.id} className="flex items-start gap-3 bg-[#0f0f0f] border border-white/[0.06] rounded-xl p-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(job.status)}`}>
                        {job.status}
                      </span>
                      <span className="text-xs text-white/40">{formatScheduled(job.scheduledAt)}</span>
                    </div>
                    {job.lastError && (
                      <p className="text-[11px] text-red-400 mt-1 break-all">{job.lastError}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {(job.status === 'failed' || job.status === 'done') && (
                      <button
                        onClick={() => handleReset(job.id)}
                        className="p-1.5 text-white/30 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all"
                        title="Schedule again"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                      title="Delete job"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-white/50 text-sm font-semibold hover:bg-white/[0.04] transition-all"
          >
            {saved ? 'Close' : 'Skip for now'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              saving
                ? 'bg-brand-500/50 text-white/50 cursor-not-allowed'
                : 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Scheduling...</>
              : <><CheckCircle size={14} /> Schedule Auto Sync</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
