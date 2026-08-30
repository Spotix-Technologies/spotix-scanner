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
 * Single entry point that wires up every IPC handler group. Replaces the
 * old ~270-line registerIpcHandlers() that used to live in main.ts.
 */

import { registerSettingsIpc }  from './settings';
import { registerLobbyIpc }     from './lobby';
import { registerGuestsIpc }    from './guests';
import { registerLogsIpc }      from './logs';
import { registerMiscIpc }      from './misc';
import { registerAutoSyncIpc }  from './autosync';
import { registerAuthIpc }      from './auth';

let _registered = false;

export function registerIpcHandlers(): void {
  if (_registered) return;
  _registered = true;

  registerAuthIpc();
  registerSettingsIpc();
  registerLobbyIpc();
  registerGuestsIpc();
  registerLogsIpc();
  registerMiscIpc();
  registerAutoSyncIpc();
  // Now the main process simply just calls the registerIPCHandlers and all is already defined
}
