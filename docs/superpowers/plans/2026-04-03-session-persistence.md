# Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for_tracking.

**Goal:** Add automatic session persistence to restore application state across restarts with minimal intrusion to existing codebase.

**Architecture:** Intent-based IPC pattern where main process owns file I/O. Renderer serializes/deserializes state via new session-persistence module. Three new IPC handlers (load/save/clear) exposed through preload. Automatic save triggers on state changes with 500ms debouncing, immediate save on app quit, automatic load on startup.

**Tech Stack:** Electron (main/renderer processes), ES Modules, fs/path Node APIs, vitest for testing

---

## File Structure

```
main.js                      (+62 lines)  - Add 3 IPC handlers
preload.js                   (+3 lines)   - Expose IPC methods
src/store.js                 (+3 lines)   - Add lastActivePage field
src/session-persistence.js   (new, 120 lines) - Core persistence logic
src/app.js                   (+30 lines)  - Startup load + quit save
src/file-ops.js              (~5 lines)   - Save after import
src/settings-page.js         (~10 lines)  - Save after group count/project change
src/order-page.js            (~5 lines)   - Save after draw order generation
src/draw-page.js             (~5 lines)   - Save after team assignment
src/navigation.js            (~3 lines)   - Save after page switch
tests/unit/session-persistence.test.js (new, 150 lines) - Unit tests
```

**Total changes:** ~203 lines of new code, ~31 lines across 6 existing files

---

## Task 1: Add IPC Handlers in main.js

**Files:**
- Modify: `main.js:187-214` (after existing IPC handlers)

- [ ] **Step 1: Add session file path helper**

Add after line 214 (after `open-image-dialog` handler):

```javascript
// Session persistence: file path helper
let sessionPath;

function getSessionPath() {
  if (!sessionPath) {
    sessionPath = path.join(app.getPath('userData'), 'session.json');
  }
  return sessionPath;
}
```

- [ ] **Step 2: Add load-session handler**

Add after the getSessionPath function:

```javascript
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
    return { success: true, data: null }; // Don't block app startup on error
  }
});
```

- [ ] **Step 3: Add save-session handler**

Add after the load-session handler:

```javascript
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
```

- [ ] **Step 4: Add clear-session handler**

Add after the save-session handler:

```javascript
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

- [ ] **Step 5: Run app to verify handlers don't break startup**

Run: `npm start`

Expected: App launches successfully. Open DevTools Console, verify no errors.

- [ ] **Step 6: Commit IPC handlers**

```bash
git add main.js
git commit -m "feat: add session persistence IPC handlers in main process"
```

---

## Task 2: Expose IPC Methods in preload.js

**Files:**
- Modify: `preload.js:4-7`

- [ ] **Step 1: Add session persistence IPC methods**

Modify the `contextBridge.exposeInMainWorld` call to include new methods:

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  importExcel: () => ipcRenderer.invoke('import-excel'),
  exportExcel: (data) => ipcRenderer.invoke('export-excel', data),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  
  // Session persistence APIs
  loadSession: () => ipcRenderer.invoke('load-session'),
  saveSession: (session) => ipcRenderer.invoke('save-session', { session }),
  clearSession: () => ipcRenderer.invoke('clear-session')
});
```

- [ ] **Step 2: Verify preload exposes methods correctly**

Run: `npm start`

Expected: App launches. In DevTools Console, verify `window.electronAPI.loadSession` exists:

```javascript
console.log(window.electronAPI.loadSession); // should show function
```

- [ ] **Step 3: Commit preload changes**

```bash
git add preload.js
git commit -m "feat: expose session persistence APIs in preload"
```

---

## Task 3: Add lastActivePage Field to store.js

**Files:**
- Modify: `src/store.js:29-31`

- [ ] **Step 1: Add lastActivePage field**

Add after line 31 (after `drawAnimationState: null`):

```javascript
export const store = {
  teamsData: [],
  drawAlgorithm: null,
  currentFilePath: null,
  drawCount: 0,

  get drawCompleted() {
    if (this.currentProject && this.projectsData[this.currentProject]) {
      return this.projectsData[this.currentProject].drawCompleted;
    }
    return false;
  },
  set drawCompleted(val) {
    if (this.currentProject && this.projectsData[this.currentProject]) {
      this.projectsData[this.currentProject].drawCompleted = val;
    }
  },

  projectsData: {},
  currentProject: null,
  sheetNames: [],

  drawOrderState: null,
  drawAnimationState: null,

  isGeneratingOrder: false,
  
  lastActivePage: null  // NEW: track current page for persistence
};
```

- [ ] **Step 2: Verify store exports new field**

Run: `npm start`

Expected: App launches without errors.

- [ ] **Step 3: Commit store changes**

```bash
git add src/store.js
git commit -m "feat: add lastActivePage field to store for session persistence"
```

---

## Task 4: Create session-persistence.js Module

**Files:**
- Create: `src/session-persistence.js`

- [ ] **Step 1: Create file with imports and constants**

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

const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 500;

let saveTimeout;
```

- [ ] **Step 2: Add serializer functions**

```javascript
/**
 * Extract durable state from store for persistence
 * @param {Object} store - Application state store
 * @returns {Object} Serializable session data
 */
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

/**
 * Deep clone projectsData, excluding computed properties
 * @param {Object} projectsData - Projects data object
 * @returns {Object} Serialized projects data
 */
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
```

- [ ] **Step 3: Add deserializer functions**

```javascript
/**
 * Restore session data into store
 * @param {Object} sessionData - Loaded session data
 * @param {Object} store - Application state store
 * @returns {boolean} True if restoration successful
 */
export function deserializeSession(sessionData, store) {
  if (!sessionData) {
    return false;
  }
  
  // Schema version check
  if (sessionData.schemaVersion !== SCHEMA_VERSION) {
    console.warn(`Session schema version mismatch: expected ${SCHEMA_VERSION}, got ${sessionData.schemaVersion}`);
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

/**
 * Deserialize projects data from persisted format
 * @param {Object} projectsData - Persisted projects data
 * @returns {Object} Deserialized projects data
 */
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
```

- [ ] **Step 4: Add save functions**

```javascript
/**
 * Debounced save to avoid excessive writes
 * @param {Object} store - Application state store
 * @returns {Promise<Object>} Save result
 */
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

/**
 * Immediate save for app quit scenarios
 * @param {Object} store - Application state store
 * @returns {Promise<Object>} Save result
 */
export async function saveSessionImmediate(store) {
  const session = serializeSession(store);
  return await window.electronAPI.saveSession(session);
}
```

- [ ] **Step 5: Add load and restore function**

```javascript
/**
 * Load and restore session on app startup
 * @param {Object} store - Application state store
 * @param {Object} DrawAlgorithm - DrawAlgorithm constructor
 * @returns {Promise<boolean>} True if restoration successful
 */
export async function loadAndRestoreSession(store, DrawAlgorithm) {
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

- [ ] **Step 6: Verify module structure**

Run: `npm start`

Expected: App launches without module import errors.

- [ ] **Step 7: Commit session-persistence module**

```bash
git add src/session-persistence.js
git commit -m "feat: add session-persistence module with serialize/deserialize logic"
```

---

## Task 5: Integrate Load on Startup in app.js

**Files:**
- Modify: `src/app.js:1-16` (imports)
- Modify: `src/app.js:209-241` (DOMContentLoaded handler)

- [ ] **Step 1: Import session persistence module**

Add to imports at the top (after line 11):

```javascript
import { loadAndRestoreSession, saveSessionDebounced, saveSessionImmediate } from './session-persistence.js';
import { DrawAlgorithm } from '../draw-algorithm.js';
```

- [ ] **Step 2: Modify DOMContentLoaded handler for session restoration**

Replace the existing `DOMContentLoaded` handler (lines 209-241) with:

```javascript
// ========== Initialize ==========

document.addEventListener('DOMContentLoaded', async () => {
  // Load session on startup
  const restored = await loadAndRestoreSession(store, DrawAlgorithm);
  
  if (restored && store.lastActivePage) {
    // Navigate to last active page if different from default
    if (store.lastActivePage !== 'welcome') {
      switchPage(store.lastActivePage);
    }
  }
  
  // Event delegation for button actions
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const page = button.dataset.page;

    switch (action) {
      case 'start-draw-system': startDrawSystem(); break;
      case 'change-background': changeBackground(); break;
      case 'exit-app': exitApp(); break;
      case 'switch-page': switchPage(page); break;
      case 'select-file': selectFile(); break;
      case 'export-result': exportResult(); break;
      case 'clear-data': clearData(); break;
      case 'update-group-count': updateGroupCount(); break;
      case 'go-to-next': goToNext(page); break;
      case 'generate-order': generateOrder(); break;
      case 'start-draw-animation': startDrawAnimation(); break;
      case 'reset-draw': resetDraw(); break;
      case 'go-to-prev': goToPrev(page); break;
    }
  });

  loadCustomBackground();
  updateNavigationState();
  updateOrderStatus();
  renderProjectList();

  const groupCountBtn = document.querySelector('[data-action="update-group-count"]');
  if (groupCountBtn) groupCountBtn.disabled = true;
  
  // Restore UI state if session was loaded
  if (restored && store.currentProject) {
    eventBus.emit('updateUIForProject');
  }
});
```

- [ ] **Step 3: Add window close handler for app quit save**

Add after the clearData function (after line 191):

```javascript
// Save session before app closes
window.addEventListener('beforeunload', async (e) => {
  // Note: beforeunload doesn't wait for async operations
  // The debounced save during normal operation should capture most state
  // This is a best-effort final save
  if (store.currentProject || Object.keys(store.projectsData).length > 0) {
    saveSessionImmediate(store);
  }
});
```

- [ ] **Step 4: Test session restoration**

Test sequence:
1. Run: `npm start`
2. Import an Excel file
3. Make changes (e.g., change group count)
4. Close app
5. Run: `npm start` again
6. Expected: App opens with previous state restored

- [ ] **Step 5: Commit startup integration**

```bash
git add src/app.js
git commit -m "feat: integrate session load on startup and save on app quit"
```

---

## Task 6: Integrate Save Triggers in file-ops.js

**Files:**
- Modify: `src/file-ops.js:1-8` (imports)
- Modify: `src/file-ops.js:22-48` (processImportedData function)

- [ ] **Step 1: Import save function**

Add to imports (after line 7):

```javascript
import { saveSessionDebounced } from './session-persistence.js';
```

- [ ] **Step 2: Add save trigger after successful import**

Modify the end of `processImportedData` function (after line 47):

```javascript
function processImportedData(data) {
  store.sheetNames = [];
  store.projectsData = {};

  data.sheetNames.forEach(sheetName => {
    const sheetData = data.sheets[sheetName];
    const projectInfo = parseSheetData(sheetData);

    if (projectInfo) {
      const projectName = projectInfo.projectName || sheetName;
      store.sheetNames.push(projectName);
      store.projectsData[projectName] = {
        teams: projectInfo.teams,
        groupCount: projectInfo.groupCount || (projectInfo.teams.length > 0 ? DEFAULT_GROUP_COUNT : 0),
        drawOrderGenerated: false,
        drawCompleted: false
      };
    }
  });

  if (store.sheetNames.length > 0) {
    eventBus.emit('selectProject', store.sheetNames[0]);
  }

  renderProjectList();
  updateNavigationState();
  
  // Save session after successful import
  saveSessionDebounced(store);
}
```

- [ ] **Step 3: Add save trigger in clearData**

Modify `clearData` in `src/app.js` (around line 131) to include sessionclear:

First, import `clearSession` in `src/app.js` imports:

```javascript
import { loadAndRestoreSession, saveSessionDebounced, saveSessionImmediate, clearSession } from './session-persistence.js';
```

Then modify the clearData function to clear session:

```javascript
function clearData() {
  showConfirmDialog('确定要清除所有数据吗？', async () => {
    stopOrderAnimation();
    stopDrawAnimation();

    store.teamsData = [];
    store.projectsData = {};
    store.sheetNames = [];
    store.currentProject = null;
    store.currentFilePath = null;
    store.drawAlgorithm = null;
    store.drawCompleted = false;
    store.drawOrderState = null;
    store.lastActivePage = null;

    // Clear persisted session
    await clearSession();

    // ... rest of UI cleanup ...
  });
}
```

Note: We need to create a clearSession wrapper. Let me add a Task0for it first, or include it here.

Actually, looking at session-persistence.js, I didn't create a clearSession export. Let me add it in Task 4.5.

Let me revise: I'll add the clearSession export to session-persistence.js in this task.

- [ ] **Step 4: Add clearSession export to session-persistence.js**

Add to `src/session-persistence.js` exports section (after loadAndRestoreSession):

```javascript
/**
 * Clear session file from disk
 * @returns {Promise<Object>} Clear result
 */
export async function clearSession() {
  return await window.electronAPI.clearSession();
}
```

- [ ] **Step 5: Import and use clearSession in app.js**

In `src/app.js`, modify imports:

```javascript
import { loadAndRestoreSession, saveSessionDebounced, saveSessionImmediate, clearSession } from './session-persistence.js';
```

Modify clearData function (around line 130-190) to clear session:

```javascript
function clearData() {
  showConfirmDialog('确定要清除所有数据吗？', async () => {
    stopOrderAnimation();
    stopDrawAnimation();

    store.teamsData = [];
    store.projectsData = {};
    store.sheetNames = [];
    store.currentProject = null;
    store.currentFilePath = null;
    store.drawAlgorithm = null;
    store.drawCompleted = false;
    store.drawOrderState = null;
    store.lastActivePage = null;

    // Clear persisted session
    await clearSession();

    const el = (id) => document.getElementById(id);
    const set = (id, prop, val) => { const e = el(id); if (e) e[prop] = val; };

    set('team-count', 'value', '0');
    set('total-teams-display', 'textContent', '0');
    const groupCountDisplay = el('group-count-display');
    if (groupCountDisplay) groupCountDisplay.textContent = '-';
    set('selected-file', 'textContent', '');
    set('next-settings-btn', 'disabled', true);
    set('export-btn', 'disabled', true);

    const groupCountBtn = document.querySelector('[data-action="update-group-count"]');
    if (groupCountBtn) groupCountBtn.disabled = true;

    renderTeamTable();
    renderProjectList();
    updateNavigationState();
    updatePageHeaders();

    // Reset order page
    const orderTbody = document.querySelector('#order-table tbody');
    if (orderTbody) orderTbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先在"抽签设置"页面上传数据</td></tr>';
    const genBtn = el('generate-order-btn');
    if (genBtn) {
      genBtn.disabled = false;
      genBtn.innerHTML = '<span class="btn-icon">🎲</span>启动抽签';
      genBtn.className = 'btn btn-success btn-large';
    }
    set('next-order-btn', 'disabled', true);
    updateOrderStatus();

    // Reset draw page
    const gc = el('groups-container');
    if (gc) gc.innerHTML = '';
    const drawTbody = document.querySelector('#draw-result-table tbody');
    if (drawTbody) drawTbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先开始抽签</td></tr>';
    const slot = el('draw-slot');
    if (slot) {
      slot.classList.remove('active');
      slot.innerHTML = '<span class="slot-text">抽签队伍</span><br><span class="slot-text"><b>等待抽签</b></span>';
    }
    set('draw-status-label', 'textContent', '--');
    set('draw-status-count', 'textContent', '剩余: -- 支');
    set('start-draw-btn', 'disabled', true);
    set('reset-draw-btn', 'disabled', true);
    set('final-export-btn', 'disabled', true);
  });
}
```

- [ ] **Step 6: Test import and clear**

Test sequence:
1. Run: `npm start`
2. Import Excel file
3. Verify session.json created in userData directory
4. Click "清空数据"
5. Verify session.json deleted

- [ ] **Step 7: Commit file-ops and app.js changes**

```bash
git add src/file-ops.js src/app.js src/session-persistence.js
git commit -m "feat: add save trigger after import and clear session on data clear"
```

---

## Task 7: Integrate Save Triggers in settings-page.js

**Files:**
- Modify: `src/settings-page.js` (imports and two functions)

- [ ] **Step 1: Import save function**

Add to imports (at the top):

```javascript
import { saveSessionDebounced } from './session-persistence.js';
```

- [ ] **Step 2: Add save trigger after updateGroupCount**

Find the `updateGroupCount` function and add save at the end:

```javascript
export async function updateGroupCount() {
  if (!store.currentProject) {
    showAlertDialog('请先选择一个项目');
    return;
  }
  
  const project = store.projectsData[store.currentProject];
  const input = document.getElementById('group-count-input');
  const newCount = parseInt(input.value);
  
  if (isNaN(newCount) || newCount < MIN_GROUP_COUNT || newCount > MAX_GROUP_COUNT) {
    showAlertDialog(`分组数必须在 ${MIN_GROUP_COUNT} 到 ${MAX_GROUP_COUNT} 之间`);
    return;
  }
  
  if (newCount === project.groupCount) {
    return;
  }
  
  project.groupCount = newCount;
  
  // Reset draw if count changed
  if (project.drawCompleted || project.teams.some(t => t.group > 0)) {
    project.drawCompleted = false;
    project.teams.forEach(t => {
      t.group = 0;
    });
    store.drawAlgorithm = new DrawAlgorithm(project.teams, project.groupCount);
  }
  
  eventBus.emit('groupCountUpdated');
  
  // Save session after group count change
  await saveSessionDebounced(store);
}
```

- [ ] **Step 3: Add save trigger after selectProject**

Find the `selectProject` function and add save at the end:

```javascript
export function selectProject(projectName) {
  store.currentProject = projectName;
  
  const project = store.projectsData[projectName];
  if (project.teams.length > 0 && project.groupCount > 0) {
    store.drawAlgorithm = new DrawAlgorithm(project.teams, project.groupCount);
  } else {
    store.drawAlgorithm = null;
  }
  
  eventBus.emit('updateUIForProject');
  
  // Save session after project switch
  saveSessionDebounced(store);
}
```

- [ ] **Step 4: Test group count and project switch persistence**

Test sequence:
1. Import Excel with multiple projects
2. Change group count → verify session.json updated
3. Switch project → verify session.json updated
4. Restart app → verify last selected project restored

- [ ] **Step 5: Commit settings-page changes**

```bash
git add src/settings-page.js
git commit -m "feat: add save triggers after group count change and project switch"
```

---

## Task 8: Integrate Save Triggers in order-page.js

**Files:**
- Modify: `src/order-page.js` (imports and generateOrder function)

- [ ] **Step 1: Import save function**

Add to imports:

```javascript
import { saveSessionDebounced } from './session-persistence.js';
```

- [ ] **Step 2: Add save trigger in generateOrder after each team drawn**

Find the `generateOrder` function and add save after state updates. The exact location depends on the animation state machine, but typically you want to save after `drawOrderProgress` is updated:

```javascript
// Inside generateOrder function, after updating drawOrderProgress:
store.projectsData[store.currentProject].drawOrderProgress = progress;
await saveSessionDebounced(store);
```

Note: The exact integration point depends on how order-page.js structures its animation loop. Review the file to find where drawOrderProgress is incremented and add save there.

- [ ] **Step 3: Add save trigger when draw order generation completes**

Find where `drawOrderGenerated` is set to true:

```javascript
project.drawOrderGenerated = true;
await saveSessionDebounced(store);
```

- [ ] **Step 4: Test draw order persistence**

Test sequence:
1. Import Excel
2. Start draw order generation
3. Let a few teams be drawn
4. Close app
5. Reopen app
6. Expected: Draw order progress restored, can continue from where left off

- [ ] **Step 5: Commit order-page changes**

```bash
git add src/order-page.js
git commit -m "feat: add save triggers during draw order generation"
```

---

## Task 9: Integrate Save Triggers in draw-page.js

**Files:**
- Modify: `src/draw-page.js` (imports and team assignment points)

- [ ] **Step 1: Import save function**

Add to imports:

```javascript
import { saveSessionDebounced } from './session-persistence.js';
```

- [ ] **Step 2: Add save trigger after team group assignment**

Find where teams are assigned to groups (typically inside the draw animation loop or after `team.group` is set):

```javascript
// After team gets assigned to a group:
team.group = assignedGroup;
await saveSessionDebounced(store);
```

- [ ] **Step 3: Add save trigger when draw completes**

Find where `drawCompleted` is set to true:

```javascript
project.drawCompleted = true;
await saveSessionDebounced(store);
```

- [ ] **Step 4: Add save trigger in resetDraw**

Find the `resetDraw` function and add save:

```javascript
export async function resetDraw() {
  showConfirmDialog('确定要重置抽签结果吗？', async () => {
    // ... existing reset logic ...
    
    // Save session after reset
    await saveSessionDebounced(store);
  });
}
```

- [ ] **Step 5: Test group draw persistence**

Test sequence:
1. Import Excel
2. Generate draw order
3. Start group draw
4. Draw a few teams into groups
5. Close app
6. Reopen app
7. Expected: Groups restored with drawn teams, can continue drawing

- [ ] **Step 6: Commit draw-page changes**

```bash
git add src/draw-page.js
git commit -m "feat: add save triggers during group draw and reset"
```

---

## Task 10: Integrate Save Triggers in navigation.js

**Files:**
- Modify: `src/navigation.js` (imports and switchPage function)

- [ ] **Step 1: Import save function**

Add to imports:

```javascript
import { saveSessionDebounced } from './session-persistence.js';
```

- [ ] **Step 2: Add save trigger in switchPage**

Find the `switchPage` function and add:

```javascript
export function switchPage(pageName) {
  // ... existing page switch logic ...
  
  // Save current page for persistence
  store.lastActivePage = pageName;
  saveSessionDebounced(store);
}
```

- [ ] **Step 3: Test page navigation persistence**

Test sequence:
1. Import Excel
2. Navigate to different pages (settings → order → draw)
3. Close app on draw page
4. Reopen app
5. Expected: App opens on draw page

- [ ] **Step 4: Commit navigation changes**

```bash
git add src/navigation.js
git commit -m "feat: save last active page for session persistence"
```

---

## Task 11: Add Unit Tests

**Files:**
- Create: `tests/unit/session-persistence.test.js`

- [ ] **Step 1: Create test file with imports**

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { serializeSession, deserializeSession, serializeProjectsData, deserializeProjectsData } from '../../src/session-persistence.js';

describe('session-persistence', () => {
  let mockStore;
  
  beforeEach(() => {
    mockStore = {
      currentFilePath: null,
      currentProject: null,
      sheetNames: [],
      projectsData: {},
      lastActivePage: null
    };
  });
```

- [ ] **Step 2: Add serializer tests**

```javascript
  describe('serializeSession', () => {
    it('should serialize empty store', () => {
      const result = serializeSession(mockStore);
      
      expect(result).toEqual({
        currentFilePath: null,
        currentProject: null,
        sheetNames: [],
        projectsData: {},
        uiState: {
          appStarted: true,
          lastActivePage: 'welcome'
        }
      });
    });
    
    it('should serialize store with project data', () => {
      mockStore.currentFilePath = 'test.xlsx';
      mockStore.currentProject = '象棋比赛';
      mockStore.sheetNames = ['象棋比赛', '围棋比赛'];
      mockStore.projectsData = {
        '象棋比赛': {
          teams: [
            { id: 1, teamName: '雄鹰队', school: '北京一中', isSeeded: true, drawOrder: 0, group: 0 }
          ],
          groupCount: 9,
          drawOrderGenerated: false,
          drawOrderSequence: [],
          drawOrderProgress: 0,
          drawCompleted: false
        }
      };
      mockStore.lastActivePage = 'draw';
      
      const result = serializeSession(mockStore);
      
      expect(result.currentFilePath).toBe('test.xlsx');
      expect(result.currentProject).toBe('象棋比赛');
      expect(result.sheetNames).toEqual(['象棋比赛', '围棋比赛']);
      expect(result.projectsData).toHaveProperty('象棋比赛');
      expect(result.uiState.lastActivePage).toBe('draw');
    });
    
    it('should not include transient state', () => {
      mockStore.drawAlgorithm = {}; // Should not be serialized
      mockStore.drawOrderState = {}; // Should not be serialized
      
      const result = serializeSession(mockStore);
      
      expect(result).not.toHaveProperty('drawAlgorithm');
      expect(result).not.toHaveProperty('drawOrderState');
    });
  });
```

- [ ] **Step 3: Add deserializer tests**

```javascript
  describe('deserializeSession', () => {
    it('should return false for null data', () => {
      const result = deserializeSession(null, mockStore);
      expect(result).toBe(false);
    });
    
    it('should return false for mismatched schema version', () => {
      const sessionData = {
        schemaVersion: 2,
        session: {}
      };
      
      const result = deserializeSession(sessionData, mockStore);
      expect(result).toBe(false);
    });
    
    it('should deserialize valid session data', () => {
      const sessionData = {
        schemaVersion: 1,
        timestamp: '2026-04-03T10:30:00Z',
        session: {
          currentFilePath: 'test.xlsx',
          currentProject: '象棋比赛',
          sheetNames: ['象棋比赛'],
          projectsData: {
            '象棋比赛': {
              teams: [
                { id: 1, teamName: '雄鹰队', school: '北京一中', isSeeded: true, drawOrder: 1, group: 2 }
              ],
              groupCount: 9,
              drawOrderGenerated: true,
              drawOrderSequence: [1, 2, 3],
              drawOrderProgress: 3,
              drawCompleted: false
            }
          },
          uiState: {
            appStarted: true,
            lastActivePage: 'draw'
          }
        }
      };
      
      const result = deserializeSession(sessionData, mockStore);
      
      expect(result).toBe(true);
      expect(mockStore.currentFilePath).toBe('test.xlsx');
      expect(mockStore.currentProject).toBe('象棋比赛');
      expect(mockStore.sheetNames).toEqual(['象棋比赛']);
      expect(mockStore.lastActivePage).toBe('draw');
      expect(mockStore.projectsData).toHaveProperty('象棋比赛');
    });
    
    it('should default missing fields', () => {
      const sessionData = {
        schemaVersion: 1,
        session: {
          currentProject: '象棋比赛',
          sheetNames: ['象棋比赛'],
          projectsData: {
            '象棋比赛': {
              teams: [{ id: 1 }],
              groupCount: 9,
              drawOrderGenerated: false
            }
          }
        }
      };
      
      const result = deserializeSession(sessionData, mockStore);
      
      expect(result).toBe(true);
      expect(mockStore.projectsData['象棋比赛'].teams[0]).toMatchObject({
        id: 1,
        drawOrder: 0,
        group: 0
      });
    });
  });
```

- [ ] **Step 4: Add serialize/deserialize projects helper tests**

```javascript
  describe('serializeProjectsData / deserializeProjectsData', () => {
    it('should deep clone projects without computed properties', () => {
      const projectsData = {
        'Project1': {
          teams: [{ id: 1, teamName: 'Team A', computedProp: 'remove me' }],
          groupCount: 9,
          drawOrderGenerated: true,
          drawOrderSequence: [1, 2],
          drawOrderProgress: 1,
          drawCompleted: false
        }
      };
      
      const serialized = serializeProjectsData(projectsData);
      
      expect(serialized['Project1'].teams[0]).toEqual({
        id: 1,
        teamName: 'Team A'
      });
      expect(serialized['Project1'].drawOrderSequence).toEqual([1, 2]);
    });
    
    it('should default missing optional fields', () => {
      const projectsData = {
        'Project1': {
          teams: [{ id: 1 }],
          groupCount: 9,
          drawOrderGenerated: false
        }
      };
      
      const deserialized = deserializeProjectsData(projectsData);
      
      expect(deserialized['Project1']).toMatchObject({
        teams: [{ id: 1, drawOrder: 0, group: 0 }],
        drawOrderSequence: [],
        drawOrderProgress: 0
      });
    });
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/session-persistence.test.js`

Expected: All tests pass

- [ ] **Step 6: Commit tests**

```bash
git add tests/unit/session-persistence.test.js
git commit -m "test: add unit tests for session-persistence module"
```

---

## Task 12: Manual Testing Checklist

- [ ] **Test 1: Fresh start (no session file)**

1. Delete session.json if exists
2. Run: `npm start`
3. Expected: App starts fresh, no errors

- [ ] **Test 2: Import and persist**

1. Import Excel file
2. Navigate to different pages
3. Close app
4. Reopen app
5. Expected: Project loaded, last page restored

- [ ] **Test 3: Group count persistence**

1. Import Excel
2. Change group count
3. Close app
4. Reopen app
5. Expected: Group count restored

- [ ] **Test 4: Draw order persistence**

1. Import Excel
2. Generate draw order (partial)
3. Close app
4. Reopen app
5. Expected: Draw order progress restored, can continue

- [ ] **Test 5: Group draw persistence**

1. Import Excel
2. Generate draw order
3. Draw some teams into groups
4. Close app
5. Reopen app
6. Expected: Groups restored with drawn teams

- [ ] **Test 6: Clear data**

1. Import Excel
2. Click "清空数据"
3. Close app
4. Reopen app
5. Expected: Fresh start, no session file

- [ ] **Test 7: Corrupted session file**

1. Create invalid session.json (e.g., `{"invalid": json`)
2. Run: `npm start`
3. Expected: App starts fresh with console warning, no crash

- [ ] **Test 8: Check session file location**

1. Import Excel
2. Find session.json in userData directory
   - Windows: `%APPDATA%/tournament-draw-system/session.json`
   - macOS: `~/Library/Application Support/tournament-draw-system/session.json`
   - Linux: `~/.config/tournament-draw-system/session.json`
3. Verify file contains correct JSON structure

- [ ] **Final verification commit**

```bash
git add -A
git commit -m "test: complete manual testing of session persistence feature"
```

---

## Self-Review Checklist

Before execution, verify:

- [ ] **Spec coverage:** All spec requirements appear in tasks above
  - IPC handlers in main.js ✓ (Task 1)
  - Preload exposure ✓ (Task 2)
  - Store field addition ✓ (Task 3)
  - Persistence module ✓ (Task 4)
  - Startup load + quit save ✓ (Task 5)
  - Import save trigger ✓ (Task 6)
  - Settings save triggers ✓ (Task 7)
  - Order page save triggers ✓ (Task 8)
  - Draw page save triggers ✓ (Task 9)
  - Navigation save trigger ✓ (Task 10)
  - Unit tests ✓ (Task 11)
  - Manual testing ✓ (Task 12)

- [ ] **Placeholder scan:** No TBDs, TODOs, or incomplete sections

- [ ] **Type consistency:** All function names, method signatures, and property names match across tasks

- [ ] **File paths:** All file paths are exact and correct

- [ ] **Code completeness:** Every code step shows the complete implementation, not placeholders

- [ ] **Test commands:** All test commands include expected output

- [ ] **Commits:** Logical, atomic commits after each major change

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-03-session-persistence.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**