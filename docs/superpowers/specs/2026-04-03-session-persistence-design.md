# Session Persistence Design

## Goal

Add durable, low-intrusion data persistence to the Electron lottery application so the app can automatically restore the latest working state after restart, crash, or forced termination.

## Scope

This design covers:

- Persisting runtime session data to disk automatically
- Restoring the last session on app startup
- Recovering partial progress for draw-order generation and group drawing
- Restoring the last active page and bypassing the welcome gate when a prior session exists

This design does not cover:

- User-managed save/open of multiple sessions
- Cloud sync or shared storage
- Persisting live timers, DOM state, or animation controller objects
- Replacing the existing `localStorage` background-image behavior

## Current State

The app is a single-window Electron application. Runtime state currently lives in renderer memory through `src/store.js` and page modules.

Relevant state today:

- `store.sheetNames`
- `store.projectsData`
- `store.currentProject`
- `store.teamsData`
- `store.currentFilePath` (actually used as display file name)
- per-team `drawOrder` and `group`
- per-project `groupCount`, `drawOrderGenerated`, `drawOrderSequence`, `drawOrderProgress`, `drawCompleted`

Current persistence is limited to the welcome-page custom background in renderer `localStorage`.

## Chosen Approach

Use a single JSON session file stored in Electron's `app.getPath('userData')`, with file I/O owned by the main process and accessed from the renderer through preload-exposed IPC methods.

This is chosen because it:

- keeps persistence outside the untrusted renderer
- avoids adding a database or external dependency
- preserves the existing renderer state model with minimal intrusion
- supports crash-safe recovery by writing snapshots during user actions, not only on clean exit

## Architecture

### Main Process Responsibilities

`main.js` will own session file access and expose three IPC handlers:

- `load-session`
- `save-session`
- `clear-session`

The session file location should be fixed and internal, for example:

- `${app.getPath('userData')}/session-state.json`

`save-session` should:

- validate payload shape at a basic level
- write JSON atomically through a temporary file plus rename
- return success/failure without exposing filesystem paths to the renderer

`load-session` should:

- return `{ success: true, exists: false }` when no session file exists
- parse JSON safely
- return `{ success: false, error }` on malformed or unreadable data

`clear-session` should:

- remove the stored session file if present
- succeed when the file is already absent

### Preload Responsibilities

`preload.js` will expose narrow APIs such as:

- `loadSession()`
- `saveSession(data)`
- `clearSession()`

These are the only persistence interfaces the renderer can access.

### Renderer Responsibilities

Add a dedicated persistence module in `src/`, responsible for:

- converting the current store into a serializable snapshot
- loading and hydrating saved state back into the store
- saving state after meaningful user actions
- handling restore failures gracefully

This module should be the only renderer module that knows the persistence schema.

## Persisted Data Model

Persist one versioned JSON document:

```json
{
  "version": 1,
  "savedAt": "2026-04-03T12:34:56.000Z",
  "ui": {
    "appStarted": true,
    "activePage": "draw"
  },
  "session": {
    "currentFileName": "example.xlsx",
    "currentProject": "项目A",
    "sheetNames": ["项目A", "项目B"],
    "projectsData": {
      "项目A": {
        "teams": [
          {
            "id": 1,
            "school": "学校A",
            "teamName": "队伍A",
            "isSeeded": true,
            "drawOrder": 1,
            "group": 2
          }
        ],
        "groupCount": 9,
        "drawOrderGenerated": false,
        "drawOrderSequence": [
          {
            "id": 1,
            "school": "学校A",
            "teamName": "队伍A",
            "isSeeded": true,
            "drawOrder": 1,
            "group": 2
          }
        ],
        "drawOrderProgress": 3,
        "drawCompleted": false
      }
    }
  }
}
```

### Notes On Shape

- The schema intentionally mirrors existing renderer state to minimize transformation logic.
- `currentFilePath` should be treated as display metadata and persisted as `currentFileName`.
- `drawOrderSequence` must be persisted because partial order generation currently depends on it for deterministic resume.
- Team entries inside `drawOrderSequence` should be stored as plain serializable team snapshots, not live references.

## Non-Persisted Runtime State

The following state must not be serialized:

- `store.drawAlgorithm`
- `store.drawOrderState`
- `store.drawAnimationState`
- timers and animation handles
- DOM markup
- event bus listeners

These values are runtime-only and must be rebuilt after restore.

## Save Strategy

To satisfy crash/forced-kill recovery, the app must save snapshots during user actions that change durable state.

### Save Triggers

Persist after these events:

- successful Excel import and project parsing
- project selection change
- group count update
- each draw-order progress update that changes `drawOrder`, `drawOrderProgress`, or `drawOrderGenerated`
- each group draw update that changes a team `group` or `drawCompleted`
- draw reset
- clear data
- page switch
- transition from welcome page to main app

This keeps the latest meaningful state on disk without requiring a clean shutdown.

### Write Discipline

- Save operations should be fire-and-forget from the renderer, with errors logged and surfaced only when needed.
- Persistence should be best-effort and not block animations for long periods.
- If desired during implementation, a tiny debounce can be applied to very chatty writes, but only if it does not materially weaken crash recovery. The default design is immediate saves after state mutations.

## Restore Strategy

On startup:

1. Load custom background from existing `localStorage` logic.
2. Ask the main process for the saved session.
3. If no valid session exists, continue with current startup behavior.
4. If a valid session exists:
   - hydrate `store.sheetNames`, `store.projectsData`, `store.currentProject`, and display file name
   - set `store.teamsData` from the selected project
   - reconstruct `store.drawAlgorithm` when the selected project has teams and a valid `groupCount`
   - call `drawAlgorithm.restore()` so saved `team.group` values rebuild algorithm state
   - render UI from hydrated state
   - if `ui.appStarted` is `true`, hide the welcome page and show the main app
   - switch to `ui.activePage` if it is one of `settings`, `order`, or `draw` and is currently allowed by navigation rules; otherwise fall back to `settings`

### Resume Semantics

- Partial draw-order sessions resume from saved `drawOrderSequence` plus `drawOrderProgress`.
- Partial group draws resume from saved team `group` values and reconstructed algorithm state.
- Running animations must restore as paused/resumable idle state, never as automatically running actions.
- The user should see the correct next action, such as `继续抽签`, after restore.

## UI Continuity Rules

The persisted UI state is intentionally small:

- whether the user had already entered the main app
- the last active page

The design does not attempt to persist:

- dialog visibility
- transient flashing/fly states
- scroll positions

This is sufficient to meet the requirement for restart continuity while keeping the solution simple and robust.

## Error Handling

### Invalid Or Corrupt Session Data

If loading the session fails because the file is corrupt or incompatible:

- log a warning
- ignore the saved session
- continue with a clean in-memory startup
- clear the invalid session file to prevent repeated failure loops

The app must remain usable even if persistence fails.

### Save Failures

If saving fails:

- log the error in the renderer and/or main process
- keep the app running with in-memory state
- do not interrupt the user flow unless repeated failures become a visible product issue

## Security And Intrusion Constraints

- Do not expose raw file paths or unrestricted filesystem APIs to the renderer.
- Keep persistence behind specific preload methods.
- Avoid introducing third-party persistence libraries unless implementation reveals a concrete deficiency.
- Preserve the existing module structure and event-driven UI flow.

## Testing Strategy

Testing should cover:

- serialization of current in-memory state into the persisted envelope
- hydration of saved data back into store state
- restore of partial order draw progress
- restore of partial group draw progress
- fallback behavior when the session file is missing or corrupt
- page restore behavior and invalid-page fallback

Tests can be added at two levels:

- unit tests for serializer/hydrator logic
- light integration tests for main-process load/save helpers where practical

## Implementation Notes

Expected low-intrusion changes:

- add one new renderer persistence module
- add a few persistence calls at existing mutation points
- slightly extend navigation state to explicitly track current page in store or through exported getter/setter access
- add main-process IPC handlers and preload methods

No database, no ORM, and no broad refactor is required.

## Open Decisions Already Resolved

- persistence scope: automatic restore of the last session only
- UI continuity: restore the last active page
- recovery behavior: must survive crash and forced termination
- implementation approach: single JSON session file in Electron `userData`
