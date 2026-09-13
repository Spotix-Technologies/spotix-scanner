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
 * Gate for admin-only pages (dashboard, logs, manage, settings, sync —
 * anywhere an operator manages an event). Deliberately NOT used on
 * /scanner, which is what scanner devices hit to check guests in and isn't
 * gated behind the admin login.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

type Status = 'checking' | 'authenticated' | 'unauthenticated';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isElectron = typeof window !== 'undefined' && !!(window as any).spotix?.auth;
  // Dev-in-browser convenience: without Electron there's no PocketBase
  // process to auth against, so just let the page through (matches the
  // same convenience fallback used on the login page itself).
  const [status, setStatus] = useState<Status>(isElectron ? 'checking' : 'authenticated');

  useEffect(() => {
    if (!isElectron) return;
    (window as any).spotix.auth
      .status()
      .then((s: { authenticated: boolean }) => {
        setStatus(s.authenticated ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => setStatus('unauthenticated'));
  }, [isElectron]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <img
            src="/auth.svg"
            alt=""
            aria-hidden="true"
            className="w-48 h-48 mx-auto mb-2 select-none pointer-events-none"
            draggable={false}
          />
          <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
            <Lock size={18} className="text-brand-500" />
          </div>
          <h1 className="text-lg font-semibold text-white">
            You&rsquo;ll need to log in to access this page
          </h1>
          <p className="text-sm text-white/40 mt-1.5 mb-6">
            Sign in with the admin account on this device to continue.
          </p>
          <button
            onClick={() => router.replace('/login')}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 transition-colors"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
