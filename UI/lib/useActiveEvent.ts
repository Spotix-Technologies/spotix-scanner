/**
 * Spotix Scanner — Shared active event state.
 *
 * Persists the selected event to sessionStorage so it survives page
 * navigations within the same session.  All pages that need to scope
 * their data (dashboard, manage, scanner) read from this hook.
 */
'use client';
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'spotix:activeEvent';

export interface ActiveEvent {
  /** The logical event ID (from Booker / JSON export) */
  eventId:   string;
  /** PocketBase record ID for the events collection */
  pbId:      string;
  eventName: string;
}

export function useActiveEvent() {
  const [activeEvent, setActiveEventState] = useState<ActiveEvent | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setActiveEventState(JSON.parse(stored));
    } catch {}
    setHydrated(true);
  }, []);

  const setActiveEvent = useCallback((ev: ActiveEvent | null) => {
    setActiveEventState(ev);
    try {
      if (ev) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ev));
      else    sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return { activeEvent, setActiveEvent, hydrated };
}
