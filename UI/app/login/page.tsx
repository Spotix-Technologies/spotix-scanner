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
 * Sign Up (first launch, no admin account exists yet) / Login (every
 * launch after that) — replaces the previous behaviour of silently
 * bootstrapping PocketBase with a hardcoded admin@spotix.local account.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Mail, Lock, User, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

type Mode = 'checking' | 'signup' | 'login';

// Real Spotix-powered events — the point of the login screen's image panel
// is to show the operator what they're signing in to run, not stock photos.
const SHOWCASE_IMAGES = [
  { src: '/login/red-carpet.jpg', alt: 'Guests on the red carpet at a Spotix-powered event' },
  { src: '/login/dj.jpg', alt: 'A DJ performing at a Spotix-powered party' },
  { src: '/login/crowd.jpg', alt: 'A crowd celebrating at a Spotix-powered event' },
  { src: '/login/pageant.jpg', alt: 'A pageant winner on stage at a Spotix-powered event' },
];
 
const SHOWCASE_INTERVAL_MS = 5000;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('checking');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      setActiveImage((i) => (i + 1) % SHOWCASE_IMAGES.length);
    }, SHOWCASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const isElectron = typeof window !== 'undefined' && !!(window as any).spotix?.auth;

  useEffect(() => {
    if (!isElectron) {
      // Dev-in-browser convenience: without Electron there's no PocketBase
      // process to auth against, so just fall through to the app.
      router.replace('/welcome');
      return;
    }
    (window as any).spotix.auth.status().then((status: { hasAdmin: boolean; authenticated: boolean }) => {
      if (status.authenticated) {
        router.replace('/welcome');
        return;
      }
      setMode(status.hasAdmin ? 'login' : 'signup');
    });
  }, [isElectron, router]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (!username.trim()) return setError('Enter a username.');
      if (password.length < 8) return setError('Password must be at least 8 characters.');
      if (password !== confirmPassword) return setError('Passwords do not match.');
    }
    if (!email.trim()) return setError('Enter your email.');
    if (!password) return setError('Enter your password.');

    setSubmitting(true);
    try {
      const api = (window as any).spotix.auth;
      const result = mode === 'signup'
        ? await api.signup({ username: username.trim(), email: email.trim(), password })
        : await api.login({ email: email.trim(), password });

      if (!result.success) {
        setError(result.error ?? 'Something went wrong — please try again.');
        setSubmitting(false);
        return;
      }
      router.replace('/welcome');
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  }, [mode, username, email, password, confirmPassword, router]);

  if (mode === 'checking') {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex">
      {/* Container 1 — the form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center mb-4 overflow-hidden">
            <Image
              src="/logo.png"
              alt="Spotix"
              width={28}
              height={28}
              priority
              className="object-contain"
            />
          </div>
          <h1 className="text-lg font-semibold text-white">Spotix Scanner</h1>
          <p className="text-sm text-white/40 mt-1">
            {mode === 'signup' ? 'Create your admin account to get started' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#141414] border border-white/[0.08] rounded-2xl p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5">Username</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Mike"
                  autoFocus
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus={mode === 'login'}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5">Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5">Confirm password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-white/20 mt-4">
          {mode === 'signup'
            ? 'This account controls Spotix Scanner on this device.'
            : 'Sign in with the admin account created on this device.'}
        </p>
      </div>
      </div>

      {/* Container 2 — rotating showcase of live events */}
      <div className="hidden lg:flex lg:w-[44%] xl:w-[42%] relative overflow-hidden border-l border-white/[0.08]">
        {SHOWCASE_IMAGES.map((image, i) => (
          <Image
            key={image.src}
            src={image.src}
            alt={image.alt}
            fill
            priority={i === 0}
            sizes="42vw"
            className={`object-cover transition-opacity duration-1000 ease-in-out ${
              i === activeImage ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}

        {/* Scrim for legible text over the photo */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

        <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Spotix</p>
            <p className="text-xs text-white/60 mt-0.5">Live at events across Nigeria</p>
          </div>
          <div className="flex items-center gap-1.5">
            {SHOWCASE_IMAGES.map((image, i) => (
              <span
                key={image.src}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === activeImage ? 'w-5 bg-white' : 'w-1.5 bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
