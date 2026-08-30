export type ScanResult = 'success' | 'already_scanned' | 'invalid';

export interface Log {
  eventId: string;
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

export interface LogExportSummary {
  exportedAt: string;
  totalGuests: number;
  checkedIn: number;
  noShows: number;
  invalidScans: number;
  alreadyScanned: number;
  rushHourPeak: string;
  logs: Log[];
}
