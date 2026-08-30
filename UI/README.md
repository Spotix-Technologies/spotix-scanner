# Spotix Scanner — Frontend Changes (UI)

PocketBase version: **0.21.3**

## Task
The scanner page must scope every scan to the **currently loaded event**, and
show a clear "doesn't belong to this event" error when a scanned ticket /
email / face matches a guest from a *different* event.

## Files changed

### `types/scanner.ts`
- Added `'wrong_event'` to the `ScanStatus` union.
- Added an optional `eventId?: string` field to `ScanRequest`.

### `app/scanner/page.tsx`
- Imported and used `useActiveEvent()` (already used by the dashboard, manage,
  and welcome pages) to read the event currently loaded on this scanner.
- `submitScan()` now sends `eventId: activeEvent?.eventId` in every
  `POST /api/scan` request, so the server can verify the scanned guest belongs
  to this event.
- Added `'wrong_event'` handling to:
  - `resultLabel()` → "Wrong event"
  - `resultColor()` / `resultBg()` / `ResultIcon()` → styled the same as other
    error states (red)
  - The scan-history "Invalid" stat bucket now also counts `wrong_event`
    results.

### `components/scanner/ResultDisplay.tsx`
- Added a `wrong_event` result config: shows a red "Wrong Event" card with the
  server's message (e.g. "Jane Doe does not belong to this event."), so the
  scanner operator gets a clear, actionable error instead of a generic
  "Invalid Ticket".

## Behaviour summary
| Scenario | Result |
|---|---|
| No guest matches ticket/email/face anywhere | `invalid` — "Ticket not found." |
| Guest matches, but belongs to a different event than the one loaded | **new** `wrong_event` — "{name} does not belong to this event." |
| Guest matches current event, already checked in | `already_scanned` |
| Guest matches current event, not yet checked in | `success` — checked in |

## Dependency
Requires the paired `electron.zip` backend changes (`/api/scan` now performs
the global lookup + event-scoping check).
