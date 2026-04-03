# Session Persistence Design

**Date:** 2026-04-03
**Status:** Draft - Pending Review
**Author:** Sisyphus (AI Assistant)

## Summary

Add automatic session persistence to restore application state across restarts. The implementation follows the existing intent-based IPC security pattern with minimal code intrusion—three new IPC handlers, one new renderer module, and targeted integration points across existing modules.

## Problem Statement

Users currently lose all application state when the app closes. Tournament draw progress, imported project data, and UI state must be manually recreated on each restart. This creates friction for users running multi-day tournaments or needing to reopen the app after accidental closure.

## Goals

1. **Automatic restoration** - App state restores on startup without user action
2. **Minimal intrusion** - Small, focused changes to existing codebase
3. **Security preservation** - Maintain intent-based IPC pattern (main process owns file I/O)
4. **Explicit boundaries** - Clear separation between durable state and transient runtime objects
5. **Graceful degradation** - Corrupted or missing session files don't block app startup

## Non-Goals

1. **Manual save/load** - No user-facing "Save Progress" or "Load Progress" buttons
2. **Multiple sessions** - Single active session per user
3. **Cloud sync** - Local persistence only
4. **Undo history** - Not persisting undo/redo stacks

## Architecture

### Components Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Renderer Process                        │
│                                                              │
│  ┌──────────────┐        ┌─────────────────────────┐        │
│  │   store.js   │◄───────┤ session-persistence.js  │        │
│  │  (state)     │        │ - serialize/deserialize│        │
│  └──────────────┘        │ - save triggers         │        │
│         ▲                │ - load on startup       │        │
│         │                └─────────────────────────┘        │
│         │                         │                          │
│         │                         ▼                          │
│  ┌──────┴─────────┐    ┌──────────────────────┐           │
│  │ Module edits:  │    │ Integration points:   │           │
│  │ - file-ops     │    │ - processImportedData │           │
│  │ - settings-page│    │ - updateGroupCount    │           │
│  │ - order-page   │    │ - generateOrder       │           │
│  │ - draw-page    │    │ - team assignment     │           │
│  │ - navigation   │    │ - switchPage          │           │
│  │ - app.js      │    │ - clearData           │           │
│  └───────────────┘    └──────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (intent-based)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ IPC Handlers (new):                                    │  │
│  │ - load-session   → readFile(userData/session.json)    │  │
│  │ - save-session   → writeFile(userData/session.json)   │  │
│  │ - clear-session  → unlink(session.json)              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  File Location: app.getPath('userData')/session.json       │
└─────────────────────────────────────────────────────────────┘
```

### File Changes

| File | Changes | Lines |
|------|---------|-------|
| `main.js` | Add 3 IPC handlers (load/save/clear session) | +62 |
| `preload.js` | Expose 3 new IPC methods | +3 |
| `src/store.js` | Add `lastActivePage` field | +3 |
| `src/session-persistence.js` | New file: serialization logic | +120 |
| `src/app.js` | Load on startup, save on quit | +15 |
| **Total** | | **+203 lines** |

## Data Model

### Persisted Payload Structure

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-04-03T10:30:00Z",
  "session": {
    "currentFilePath": "tournament-data.xlsx",
    "currentProject": "象棋比赛",
    "sheetNames": ["象棋比赛", "围棋比赛"],
    "projectsData": {
      "象棋比赛": {
        "teams": [
          {
            "id": 1,
            "teamName": "雄鹰队",
            "school": "北京一中",
            "isSeeded": true,
            "drawOrder": 0,
            "group": 0
          }
        ],
        "groupCount": 9,
        "drawOrderGenerated": false,
        "drawOrderSequence": [3, 1, 5, 2, 4],
        "drawOrderProgress": 0,
        "drawCompleted": false
      }
    },
    "uiState": {
      "appStarted": true,
      "lastActivePage": "draw"
    }
  }
}
```

### What Gets Persisted

✅ **Project Data**
- `sheetNames` - List of project names from Excel sheets
- `projectsData` - Object mapping project names to project state
- `currentProject` - Currently selected project
- `currentFilePath` - Display name of imported file

✅ **Per-Team State**
- `id` - Team identifier
- `teamName` - Team name
- `school` - School name
- `isSeeded` - Whether team is seeded
- `drawOrder` - Order in draw sequence (0 if not drawn)
- `group` - Assigned group (0 if not assigned)

✅ **Per-Project Progress**
- `groupCount` - Number of groups
- `drawOrderGenerated` - Whether draw order has been generated
- `drawOrderSequence` - Randomized order sequence
- `drawOrderProgress` - Current position in draw order generation
- `drawCompleted` - Whether group draw is complete

✅ **UI Continuity**
- `appStarted` - Whether welcome screen has been dismissed
- `lastActivePage` - Last active page name (welcome/settings/order/draw)

### What Does NOT Get Persisted

❌ **Transient Runtime Objects**
- `drawAlgorithm` - Instance reconstructed from team data on restore
- `drawOrderState` - Animation state machine (transient)
- `drawAnimationState` - Animation state machine (transient)
- `isGeneratingOrder` - Flag for in-progress animation
- Timers, DOM references, event listeners

**Rationale:** Animation state and timers cannot be meaningfully persisted—they must be reconstructed on restore. DrawAlgorithm is reconstructed from persisted team assignments.

## Implementation Details

### 1. Main Process IPC Handlers

**main.js additions:**

```javascript
let sessionPath;

function getSessionPath() {
  if (!sessionPath) {
    sessionPath = path.join(app.getPath('userData'), 'session.json');
  }
  return sessionPath;
}

// Load session on app startup
ipcMain.handle('load-session', async (event) => {
  if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) {
    return { success: false, error: 'Invalid sender' };
  }
  
  try {
    const filePath = getSessionPath();
    if (!fs.existsSync(filePath)) {
      return { success: true, data: null }; // No session = fresh start
    }
    
    const data = fs.readFileSync(filePath, 'utf-8');
    const session = JSON.parse(data);
    return { success: true, data: session };
  } catch (error) {
    console.error('Session load failed:', error);
    return { success: true, data: null }; // Don't block app startup
  }
});

// Save session (renderer-initiated)
ipcMain.handle('save-session', async (event, { session }) => {
  if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) {
    return { success: false, error: 'Invalid sender' };
  }
  
  try {
    const filePath = getSessionPath();
    const payload = {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      session
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Session save failed:', error);
    return { success: false, error: error.message };
  }
});

// Clear session (user clears all data)
ipcMain.handle('clear-session', async (event) => {
  if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) {
    return { success: false, error: 'Invalid sender' };
  }
  
  try {
    const filePath = getSessionPath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

**Security verification:**
- All handlers validate `event.senderFrame === mainWindow.webContents.mainFrame`
- No file paths exposed to renderer
- Main process owns all file I/O

### 2. Preload.js API Exposure

**preload.js additions:**

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  // Existing...
  importExcel: () => ipcRenderer.invoke('import-excel'),
  exportExcel: (data) => ipcRenderer.invoke('export-excel', data),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  
  // New session persistence APIs
  loadSession: () => ipcRenderer.invoke('load-session'),
  saveSession: (session) => ipcRenderer.invoke('save-session', { session }),
  clearSession: () => ipcRenderer.invoke('clear-session')
});
```

### 3. Session Persistence Module

**src/session-persistence.js (new file):**

```javascript
/**
 * Session Persistence Module
 * Serializes application state to JSON for restoration across restarts.
 * 
 * Responsibilities:
 * - Serialize durable state from store
 * - Deserialize session data into store
 * - Debounced save triggers
 * - Schema versioning for forward compatibility
 */

import { DrawAlgorithm } from '../draw-algorithm.js';

const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 500;

// Serializer: Extract durable state from store
export function serializeSession(store) {
  return {
    currentFilePath: store.currentFilePath,
    currentProject: store.currentProject,
    sheetNames: [...store.sheetNames],
    projectsData: serializeProjectsData(store.projectsData),
    uiState: {
      appStarted: true,
      lastActivePage: store.lastActivePage || 'welcome'
    }
  };
}

// Deep clone projectsData, excluding computed properties
function serializeProjectsData(projectsData) {
  const result = {};
  for (const [projectName, project] of Object.entries(projectsData)) {
    result[projectName] = {
      teams: project.teams.map(team => ({
        id: team.id,
        teamName: team.teamName,
        school: team.school,
        isSeeded: team.isSeeded,
        drawOrder: team.drawOrder,
        group: team.group
      })),
      groupCount: project.groupCount,
      drawOrderGenerated: project.drawOrderGenerated,
      drawOrderSequence: [...(project.drawOrderSequence || [])],
      drawOrderProgress: project.drawOrderProgress || 0,
      drawCompleted: project.drawCompleted
    };
  }
  return result;
}

// Deserializer: Restore state into store
export function deserializeSession(sessionData, store) {
  if (!sessionData) {
    return false;
  }
  
  // Schema version check
  if (sessionData.schemaVersion !== SCHEMA_VERSION) {
    console.warn(`Session schema version mismatch: expected ${SCHEMA_VERSION}, got ${sessionData.schemaVersion}`);
    // Could add migration logic here in future versions
    return false;
  }
  
  try {
    const session = sessionData.session;
    
    store.currentFilePath = session.currentFilePath;
    store.currentProject = session.currentProject;
    store.sheetNames = [...session.sheetNames];
    store.projectsData = deserializeProjectsData(session.projectsData);
    store.lastActivePage = session.uiState?.lastActivePage || null;
    
    return true;
  } catch (error) {
    console.error('Session deserialization failed:', error);
    return false;
  }
}

function deserializeProjectsData(projectsData) {
  const result = {};
  for (const [projectName, project] of Object.entries(projectsData)) {
    result[projectName] = {
      teams: project.teams.map(team => ({
        id: team.id,
        teamName: team.teamName,
        school: team.school,
        isSeeded: team.isSeeded,
        drawOrder: team.drawOrder || 0,
        group: team.group || 0
      })),
      groupCount: project.groupCount,
      drawOrderGenerated: project.drawOrderGenerated,
      drawOrderSequence: project.drawOrderSequence || [],
      drawOrderProgress: project.drawOrderProgress || 0,
      drawCompleted: project.drawCompleted
    };
  }
  return result;
}

// Debounced save to avoid excessive writes
let saveTimeout;
export async function saveSessionDebounced(store) {
  if (saveTimeout) clearTimeout(saveTimeout);
  
  return new Promise((resolve) => {
    saveTimeout = setTimeout(async () => {
      const session = serializeSession(store);
      const result = await window.electronAPI.saveSession(session);
      if (!result.success) {
        console.error('Failed to save session:', result.error);
      }
      resolve(result);
    }, DEBOUNCE_MS);
  });
}

// Immediate save (for app quit scenarios)
export async function saveSessionImmediate(store) {
  const session = serializeSession(store);
  return await window.electronAPI.saveSession(session);
}

// Load and restore session on app startup
export async function loadAndRestoreSession(store, eventBus) {
  const result = await window.electronAPI.loadSession();
  
  if (!result.success || !result.data) {
    return false;
  }
  
  const restored = deserializeSession(result.data, store);
  
  if (!restored) {
    return false;
  }
  
  // Reconstruct DrawAlgorithm instance if needed
  if (store.currentProject && store.projectsData[store.currentProject]) {
    const project = store.projectsData[store.currentProject];
    if (project.teams.length > 0 && project.groupCount > 0) {
      try {
        store.drawAlgorithm = new DrawAlgorithm(project.teams, project.groupCount);
        
        // Restore draw algorithm state from team assignments
        project.teams.forEach(team => {
          if (team.group > 0) {
            store.drawAlgorithm.assignedTeams.add(team.id);
          }
        });
      } catch (error) {
        console.error('Failed to reconstruct DrawAlgorithm:', error);
      }
    }
  }
  
  return true;
}
```

### 4. Integration Points

**Where to trigger saves:**

1. **After importing data (file-ops.js)**
   ```javascript
   import { saveSessionDebounced } from './session-persistence.js';
   
   // Inside processImportedData(), after setting store data:
   await saveSessionDebounced(store);
   ```

2. **After changing group count (settings-page.js)**
   ```javascript
   // Inside updateGroupCount(), after updating store:
   await saveSessionDebounced(store);
   ```

3. **After switching projects (settings-page.js)**
   ```javascript
   // Inside selectProject(), after updating store:
   await saveSessionDebounced(store);
   ```

4. **After draw order generation (order-page.js)**
   ```javascript
   // Inside generateOrder(), after each team drawn:
   await saveSessionDebounced(store);
   ```

5. **After team group assignment (draw-page.js)**
   ```javascript
   // After team assigned to group:
   await saveSessionDebounced(store);
   ```

6. **After reset draw (draw-page.js)**
   ```javascript
   // Inside resetDraw():
   await saveSessionDebounced(store);
   ```

7. **After clearing all data (app.js)**
   ```javascript
   // Inside clearData(), after clearing store:
   await window.electronAPI.clearSession();
   ```

8. **After switching pages (navigation.js)**
   ```javascript
   // Inside switchPage(), after page change:
   store.lastActivePage = pageName;
   await saveSessionDebounced(store);
   ```

9. **On app quit (app.js)**
   ```javascript
   // Add window close handler:
   window.addEventListener('beforeunload', async (e) => {
     await saveSessionImmediate(store);
   });
   ```

### 5. Startup Restore Sequence

**app.js initialization:**

```javascript
import { loadAndRestoreSession } from './session-persistence.js';

async function initializeApp() {
  // Load session on startup
  const restored = await loadAndRestoreSession(store, eventBus);
  
  if (restored && store.lastActivePage) {
    // Navigate to last active page
    switchPage(store.lastActivePage);
  }
  
  // Restore UI state
  eventBus.emit('updateUIForProject');
  renderProjectList();
  updateNavigationState();
  updateOrderStatus();
  
  // ... existing initialization code ...
}

document.addEventListener('DOMContentLoaded', initializeApp);
```

### 6. Store.js Modification

**src/store.js additions:**

```javascript
export const store = {
  teamsData: [],
  drawAlgorithm: null,
  currentFilePath: null,
  drawCount: 0,
  
  // ... existing getters/setters ...
  
  projectsData: {},
  currentProject: null,
  sheetNames: [],
  
  // NEW: Track current page for persistence
  lastActivePage: null,
  
  drawOrderState: null,
  drawAnimationState: null,
  
  isGeneratingOrder: false
};
```

## Edge Cases & Error Handling

### 1. Corrupted Session File

**Scenario:** Session file contains malformed JSON.

**Behavior:**
- `loadSession()` returns `{ success: true, data: null }`
- App starts fresh without errors
- Corrupted session logged to console

**Implementation:**
```javascript
// In load-session handler:
try {
  const data = fs.readFileSync(filePath, 'utf-8');
  const session = JSON.parse(data);
  return { success: true, data: session };
} catch (error) {
  console.error('Session load failed:', error);
  return { success: true, data: null }; // Don't block app
}
```

### 2. Old Schema Version

**Scenario:** Session file was created with older schema version.

**Behavior:**
- Version check fails
- `deserializeSession()` returns `false`
- App starts fresh
- Warning logged to console

**Future consideration:** Add migration functions for schema upgrades.

### 3. Missing Session File

**Scenario:** First launch or session manually deleted.

**Behavior:**
- `loadSession()` returns `{ success: true, data: null }`
- App starts fresh
- Normal flow

### 4. DrawAlgorithm Reconstruction Failure

**Scenario:** Teams have group assignments but DrawAlgorithm fails to reconstruct.

**Behavior:**
- Reconstruction caught in try/catch
- Session still restored with team data
- DrawAlgorithm set to `null`
- User can reset draw and start fresh

### 5. Save Failure During Animation

**Scenario:** Rapid state changes during draw animation.

**Behavior:**
- Debouncing prevents excessive writes
- Each save is atomic (overwrite entire file)
- If save fails, error logged, app continues
- Next successful save captures latest state

### 6. App Crash Mid-Save

**Scenario:** App crashes while writing session.json.

**Behavior:**
- File write starts with full payload
- If crash mid-write, file may be incomplete
- Next app start: JSON.parse fails → fresh start
- Use atomic write pattern if needed:
  ```javascript
  // Alternative: Write to temp file, then rename
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
  ```

## Testing Strategy

### Unit Tests

**session-persistence.js:**
- `serializeSession()` correctly extracts durable state
- `deserializeSession()` restores state into store
- `serializeProjectsData()` deep clones without computed properties
- Schema version check rejects mismatched versions

**Main process IPC handlers:**
- `load-session` returns null for missing file
- `load-session` handles corrupted JSON
- `save-session` validates sender frame
- `clear-session` removes file

### Integration Tests

**Restore flow:**
1. Import Excel file
2. Navigate to draw page
3. Close app
4. Reopen app
5. Verify: project loaded, page restored, UI state correct

**Clear flow:**
1. Import Excel file
2. Generate draw order
3. Clear all data
4. Close app
5. Reopen app
6. Verify: fresh start, no session file

**Multi-project:**
1. Import Excel with multiple sheets
2. Switch between projects
3. Close app
4. Reopen app
5. Verify: last project restored

### Manual Testing Checklist

- [ ] Import Excel, restart app → project restores
- [ ] Set group count, restart → group count restores
- [ ] Generate draw order partially, restart → progress restores
- [ ] Complete draw, restart → final state restores
- [ ] Switch page, restart → last page restores
- [ ] Clear data, restart → fresh start
- [ ] Corrupt session.json → app starts fresh
- [ ] Delete session.json → app starts fresh

## Performance Considerations

### File Size

**Expected session.json size:**
- 1 project with 100 teams ≈ 15 KB
- 10 projects with 100 teams each ≈ 150 KB
- Very small compared to Electron app overhead

### Save Frequency

**Debouncing strategy:**
- 500ms debounce on state changes
- Immediate save on app quit
- Typical user workflow: 1 save per action, not continuous writes

**Optimization opportunities:**
- Only save dirty fields (future optimization)
- Batch related state changes before save

### Startup Performance

**Load time:**
- File read: <10ms for typical session size
- JSON parse: <5ms
- DrawAlgorithm reconstruction: <50ms for 100 teams
- Total overhead: <100ms on startup

## Future Enhancements

1. **Schema Migration** - Add version-based migration for backward compatibility
2. **Session History** - Keep last N session files for rollback
3. **Export Session** - Allow users to export/import session files manually
4. **Cloud Sync** - Optional cloud backup via Electron's remote API
5. **Auto-save UI Indicator** - Show "Last saved: 2s ago" in status bar

## Security Review

✅ **Intent-based IPC pattern maintained**
- Main process validates sender frame on every IPC call
- No file paths exposed to renderer

✅ **No new attack surface**
- Session file stored in userData (Electron-managed directory)
- JSON serialization only (no code execution)
- Schema version check prevents unexpected structure

✅ **Data integrity**
- Debouncing prevents race conditions
- Atomic file write (or use temp+rename pattern)
- Graceful degradation on corruption

## Open Questions

1. **Q:** Should we show a notification when session restores?  
   **A:** No, automatic restoration is seamless by design. Users expect continuity.

2. **Q:** Should we persist background image preference?  
   **A:** Out of scope for this feature. Could be added to `uiState` if needed.

3. **Q:** What about in-progress draw order animations?  
   **A:** Not persisted. Animation restarts from last saved progress on restore.

## Conclusion

This design adds session persistence with minimal intrusion (~200 lines of new code), following existing architecture patterns. The intent-based IPC security model is preserved, clear boundaries separate durable from transient state, and graceful degradation ensures corrupted sessions never block app startup.