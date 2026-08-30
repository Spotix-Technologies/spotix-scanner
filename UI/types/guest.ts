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
  /** PocketBase ID of the event this guest belongs to */
  eventId: string;
}

export interface GuestImportRow {
  fullName: string;
  email: string;
  ticketId: string;
  ticketType: string;
  faceEmbedding?: number[];
}

/** Top-level shape of the JSON file exported by Spotix Booker */
export interface GuestListEnvelope {
  eventId: string;
  eventName: string;
  guests: GuestImportRow[];
}

export interface CheckInResult {
  result: 'success' | 'already_scanned' | 'invalid';
  guest?: Guest;
  message: string;
}
