/**
 * Spotix Scanner — Professional Event Check-in System
 * Copyright © 2026 Spotix Technologies. All rights reserved.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings, Bell, LayoutDashboard, Monitor, RefreshCw,
  ChevronLeft, Zap, Check,
} from 'lucide-react';
import type { AppSettings } from '../../types/electron';

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${enabled ? 'bg-brand-500' : 'bg-white/[0.12]'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ─── Setting row ──────────────────────────────────────────────────────────────

function SettingRow({
  icon: Icon,
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-white/[0.05] last:border-0">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon size={15} className="text-white/40" />
        </div>
        <div>
          <p className="text-sm font-medium text-white/80">{title}</p>
          <p className="text-xs text-white/30 mt-0.5 leading-relaxed max-w-sm">{description}</p>
        </div>
      </div>
      <Toggle enabled={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  trayEnabled:            true,
  notificationsEnabled:   true,
  autoSyncDialogOnImport: true,
};

export default function SettingsPage() {
  const router  = useRouter();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  // Load settings from Electron on mount
  useEffect(() => {
    const spotix = (window as any).spotix;
    if (!spotix?.settings) return;
    setIsElectron(true);
    spotix.settings.get().then((s: AppSettings) => setSettings(s)).catch(() => {});
  }, []);

  const updateSetting = useCallback(async (key: keyof AppSettings, value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);

    const spotix = (window as any).spotix;
    if (!spotix?.settings) return; // browser mode — no-op

    setSaving(true);
    setSaved(false);
    try {
      await spotix.settings.set({ [key]: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('[Settings] Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">

      {/* Topbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center">
            <img src="/logo.png" alt="Spotix" className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-semibold text-white/80">Spotix Scanner</span>
          <span className="text-xs text-white/20 font-mono">Settings</span>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-white/30">
              <RefreshCw size={11} className="animate-spin" /> Saving…
            </span>
          )}
          {saved && !saving && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check size={11} /> Saved
            </span>
          )}
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
          >
            <LayoutDashboard size={13} />
            Dashboard
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">

          {/* Header */}
          <div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
            <p className="text-sm text-white/30 mt-1">
              Configure how Spotix Scanner behaves on your PC.
            </p>
          </div>
          
          {/* We show a text if the user visits the app from browser */}
          {!isElectron && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-300 text-sm">
              <Monitor size={15} className="flex-shrink-0" />
              Settings only apply when running as the Electron desktop app.
            </div>
          )}

          {/* App Behaviour */}
          <section>
            <p className="text-[11px] font-semibold text-white/20 uppercase tracking-widest mb-3 px-1">
              App Behaviour
            </p>
            <div className="bg-[#141414] border border-white/[0.05] rounded-2xl px-5">
              <SettingRow
                icon={Monitor}
                title="Minimise to System Tray"
                description="When you close the window, Spotix Scanner keeps running in the system tray instead of quitting. It will also start automatically on login so it's always ready when you need it."
                value={settings.trayEnabled}
                onChange={(v) => updateSetting('trayEnabled', v)}
                disabled={!isElectron}
              />
              <SettingRow
                icon={RefreshCw}
                title="Show Auto-Sync Dialog on Import"
                description="Automatically open the Auto-Sync setup dialog each time you import a new guest list, so you can schedule check-in sync without navigating away."
                value={settings.autoSyncDialogOnImport}
                onChange={(v) => updateSetting('autoSyncDialogOnImport', v)}
                disabled={!isElectron}
              />
            </div>
          </section>

          {/* Notifications */}
          <section>
            <p className="text-[11px] font-semibold text-white/20 uppercase tracking-widest mb-3 px-1">
              Notifications
            </p>
            <div className="bg-[#141414] border border-white/[0.05] rounded-2xl px-5">
              <SettingRow
                icon={Bell}
                title="Desktop Notifications"
                description="Receive system notifications for guest list imports, auto-sync completions, and sync failures. Turning this off silences all Spotix Scanner notifications."
                value={settings.notificationsEnabled}
                onChange={(v) => updateSetting('notificationsEnabled', v)}
                disabled={!isElectron}
              />
            </div>
          </section>

          {/* About */}
          <section>
            <p className="text-[11px] font-semibold text-white/20 uppercase tracking-widest mb-3 px-1">
              About
            </p>
            <div className="bg-[#141414] border border-white/[0.05] rounded-2xl px-5 py-4 flex flex-col gap-2.5">
              {[
                { label: 'Product',   value: 'Spotix Scanner' },
                { label: 'Developer', value: 'Spotix Technologies' },
                { label: 'PocketBase', value: '0.21.3' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-white/30">{label}</span>
                  <span className="text-white/60 font-mono text-xs">{value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Quick links */}
          <section>
            <p className="text-[11px] font-semibold text-white/20 uppercase tracking-widest mb-3 px-1">
              Quick Access
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Lobby',      path: '/welcome',   icon: Zap },
                { label: 'Dashboard',  path: '/dashboard', icon: LayoutDashboard },
                { label: 'Sync',       path: '/sync',      icon: RefreshCw },
                { label: 'Manage',     path: '/manage',    icon: Settings },
              ].map(({ label, path, icon: Icon }) => (
                <button
                  key={path}
                  onClick={() => router.push(path)}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all text-sm"
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <footer className="flex-shrink-0 py-3 text-center border-t border-white/[0.06]">
        <p className="text-[11px] text-white/20">
          Developed and Managed by{' '}
          <span className="text-white/40 font-medium">Spotix Technologies</span>
        </p>
      </footer>
    </div>
  );
}
