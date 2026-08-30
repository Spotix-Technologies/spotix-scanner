export type ExportFormat = 'csv' | 'json' | 'both';
export type ResourceType = 'terms' | 'guide';

export interface AppSettings {
  trayEnabled:            boolean;
  notificationsEnabled:   boolean;
  autoSyncDialogOnImport: boolean;
}

export interface AuthStatus {
  hasAdmin:      boolean;
  authenticated: boolean;
  username:      string | null;
}
export interface AuthResult {
  success:  boolean;
  error?:   string;
  username?: string | null;
}

export interface SpotixAPI {
  // Auth — local PocketBase admin account (Sign Up on first run, Login
  // afterwards). Replaces the previous auto-prefilled hardcoded credentials.
  auth: {
    status: () => Promise<AuthStatus>;
    signup: (payload: { username: string; email: string; password: string }) => Promise<AuthResult>;
    login:  (payload: { email: string; password: string }) => Promise<AuthResult>;
  };

  // Guest management
  importGuests: (filePath: string) => Promise<{ imported: number; skipped: number; autoSyncDialog?: boolean } | { error: string }>;
  openGuestFileDialog: () => Promise<string | null>;

  // Logs
  exportLogs:  (format: ExportFormat) => Promise<{ success: boolean; paths?: string[]; error?: string }>;
  importLogs:  () => Promise<{ success: boolean; data?: any; logs?: any[]; filePath?: string; cancelled?: boolean; error?: string }>;

  // Event lifecycle
  endEvent: (exportFormat: ExportFormat) => Promise<{ success: boolean; paths?: string[]; error?: string }>;

  // Shell / resources
  openPath:     (filePath: string)          => Promise<void>;
  openResource: (resource: ResourceType)    => Promise<void>;

  // Network
  getLocalIP:    () => Promise<string>;
  getScannerUrl: () => Promise<string>;

  // Settings
  settings: {
    get: ()                                 => Promise<AppSettings>;
    set: (partial: Partial<AppSettings>)    => Promise<{ success: boolean; settings: AppSettings }>;
  };

  // Lobby server controls
  lobby: {
    startServer: (eventInfo: { eventId: string; pbId: string; eventName: string }) => Promise<{ success: boolean; error?: string }>;
    stopServer:  ()                         => Promise<{ success: boolean; error?: string }>;
    getStatus:   ()                         => Promise<{ running: boolean; active: { eventId: string; pbId: string; eventName: string } | null }>;
    /** Live push whenever the broadcasting server starts/stops, from any
     *  trigger (lobby button, menu, etc) — call the returned function to
     *  unsubscribe. */
    onStatusChanged: (callback: (status: { running: boolean; active: { eventId: string; pbId: string; eventName: string } | null }) => void) => () => void;
  };

  // Menu event listeners
  onMenuAction: (callback: (action: string) => void) => () => void;
  onNavigate:   (callback: (path: string)  => void)  => () => void;

  // Auto-sync management
  autoSync: {
    create: (record: { eventId: string; eventName: string; syncUrl: string; syncKey: string; scheduledAt: string }) => Promise<{ success: boolean; record?: any; error?: string }>;
    list:   (eventId?: string) => Promise<{ success: boolean; records?: any[]; error?: string }>;
    delete: (id: string)       => Promise<{ success: boolean; error?: string }>;
    reset:  (id: string)       => Promise<{ success: boolean; error?: string }>;
  };

  // Sync error listener
  onSyncError: (callback: (data: { eventName: string; reason: string }) => void) => () => void;
}

declare global {
  interface Window {
    spotix: SpotixAPI;
  }
}
