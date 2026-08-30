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

export interface Guest {
  id: string;
  fullName: string;
  email: string;
  ticketId: string;
  ticketType: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  checkedInBy: string | null;
  faceEmbedding: number[] | null;
  /** PocketBase eventId — scopes this guest to a specific imported event */
  eventId: string;
}

export type ScanResult = 'success' | 'already_scanned' | 'invalid' | 'wrong_event';

export interface Log {
  id: string;
  ticketId: string;
  guestName: string;
  scannerId: string;
  result: ScanResult;
  timestamp: string;
  checkedInDate: string;
  checkedInTime: string;
  note: string | null;
}

export type ScannerStatus = 'active' | 'blocked';

export interface Scanner {
  id: string;
  name: string;
  status: ScannerStatus;
  scanCount: number;
  connectedAt: string;
  lastScanAt: string | null;
}

export interface ScanRequest {
  ticketId?: string;
  email?: string;
  faceEmbedding?: number[];
  scannerId: string;
  /** The event currently loaded on the scanner — used to scope lookups. */
  eventId?: string;
}

/**
 * The event currently selected/started from the lobby for live scanning.
 * `null` (absence of this object) means no event is active — scanner
 * devices should show "No active events on this server".
 */
export interface ActiveEventInfo {
  /** The logical event ID (from Booker / JSON export) */
  eventId:   string;
  /** PocketBase record ID for the events collection */
  pbId:      string;
  eventName: string;
}

export interface WSMessage {
  type:
    | 'scan_result'
    | 'scanner_joined'
    | 'scanner_left'
    | 'scanner_blocked'
    | 'scanner_unblocked'
    | 'event_ended'
    | 'stats_update'
    | 'guests_imported'
    | 'active_event_changed';
  payload: unknown;
}