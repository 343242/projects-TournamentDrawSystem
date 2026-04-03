import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const loadSessionMock = vi.fn();
const saveSessionMock = vi.fn();
const clearSessionMock = vi.fn();

global.window = {
  electronAPI: {
    loadSession: loadSessionMock,
    saveSession: saveSessionMock,
    clearSession: clearSessionMock
  }
};

function createTeam(overrides = {}) {
  return {
    id: 1,
    school: 'School',
    teamName: 'Team',
    isSeeded: false,
    drawOrder: 0,
    group: 0,
    ...overrides
  };
}

function createProject(overrides = {}) {
  return {
    teams: [createTeam()],
    groupCount: 1,
    drawOrderGenerated: false,
    drawOrderSequence: null,
    drawOrderProgress: 0,
    drawCompleted: false,
    ...overrides
  };
}

function createStore(overrides = {}) {
  return {
    appStarted: false,
    activePage: 'settings',
    currentFilePath: null,
    currentProject: null,
    sheetNames: [],
    projectsData: {},
    teamsData: [],
    drawAlgorithm: null,
    drawOrderState: null,
    drawAnimationState: null,
    isGeneratingOrder: false,
    drawCount: 0,
    ...overrides
  };
}

async function importModule() {
  return import('../../src/session-persistence.js');
}

describe('session persistence corrections', () => {
  beforeEach(() => {
    vi.resetModules();
    loadSessionMock.mockReset();
    saveSessionMock.mockReset();
    clearSessionMock.mockReset();
    clearSessionMock.mockResolvedValue({ success: true });
  });

  it('serializes imported empty projects with groupCount 0', async () => {
    const { serializeSession } = await importModule();
    const sourceStore = createStore({
      currentProject: 'Empty Project',
      sheetNames: ['Empty Project'],
      projectsData: {
        'Empty Project': createProject({
          teams: [],
          groupCount: 0
        })
      }
    });

    const session = serializeSession(sourceStore);

    expect(session.session.projectsData['Empty Project'].groupCount).toBe(0);
    expect(session.session.projectsData['Empty Project'].teams).toEqual([]);
  });

  it('rejects restored team group values that exceed project groupCount', async () => {
    const { deserializeSession } = await importModule();
    const targetStore = createStore();
    const session = {
      version: 1,
      savedAt: new Date().toISOString(),
      ui: {
        appStarted: true,
        activePage: 'draw'
      },
      session: {
        currentFileName: '/tmp/example.xlsx',
        currentProject: 'Project A',
        sheetNames: ['Project A'],
        projectsData: {
          'Project A': createProject({
            groupCount: 2,
            teams: [createTeam({ group: 999 })]
          })
        }
      }
    };

    expect(() => deserializeSession(targetStore, session)).toThrow(/group/i);
  });

  it('rejects restoring non-empty projects with groupCount 0', async () => {
    const { deserializeSession } = await importModule();
    const targetStore = createStore();
    const session = {
      version: 1,
      savedAt: new Date().toISOString(),
      ui: {
        appStarted: true,
        activePage: 'draw'
      },
      session: {
        currentFileName: '/tmp/example.xlsx',
        currentProject: 'Project A',
        sheetNames: ['Project A'],
        projectsData: {
          'Project A': createProject({
            groupCount: 0,
            teams: [createTeam({ group: 0 })]
          })
        }
      }
    };

    expect(() => deserializeSession(targetStore, session)).toThrow(/groupCount/i);
  });

  it('keeps the target store unchanged when draw algorithm reconstruction fails', async () => {
    const { loadAndRestoreSession } = await importModule();
    const previousAlgorithm = { existing: true };
    const targetStore = createStore({
      appStarted: false,
      activePage: 'settings',
      currentFilePath: '/tmp/original.xlsx',
      currentProject: 'Existing Project',
      sheetNames: ['Existing Project'],
      projectsData: {
        'Existing Project': createProject()
      },
      teamsData: [createTeam()],
      drawAlgorithm: previousAlgorithm,
      drawOrderState: { step: 1 },
      drawAnimationState: { running: true },
      isGeneratingOrder: true,
      drawCount: 1
    });

    loadSessionMock.mockResolvedValue({
      success: true,
      exists: true,
      data: {
        version: 1,
        savedAt: new Date().toISOString(),
        ui: {
          appStarted: true,
          activePage: 'draw'
        },
        session: {
          currentFileName: '/tmp/restored.xlsx',
          currentProject: 'Restored Project',
          sheetNames: ['Restored Project'],
          projectsData: {
            'Restored Project': createProject({
              groupCount: 2,
              teams: [createTeam({ group: 1 })]
            })
          }
        }
      }
    });

    class FailingDrawAlgorithm {
      constructor(teams, groupCount) {
        this.teams = teams;
        this.groupCount = groupCount;
      }

      restore() {
        throw new Error('restore exploded');
      }
    }

    const before = structuredClone(targetStore);
    const result = await loadAndRestoreSession(targetStore, FailingDrawAlgorithm);

    expect(result).toEqual({ restored: false, reason: 'restore exploded' });
    expect(targetStore).toEqual(before);
    expect(targetStore.drawAlgorithm).toBe(previousAlgorithm);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('restores drawOrderSequence team identity links during rollback', async () => {
    const { loadAndRestoreSession } = await importModule();
    const team = createTeam();
    const previousAlgorithm = { existing: true };
    const targetStore = createStore({
      currentProject: 'Existing Project',
      sheetNames: ['Existing Project'],
      projectsData: {
        'Existing Project': createProject({
          teams: [team],
          drawOrderSequence: [team]
        })
      },
      teamsData: [team],
      drawAlgorithm: previousAlgorithm
    });

    loadSessionMock.mockResolvedValue({
      success: true,
      exists: true,
      data: {
        version: 1,
        savedAt: new Date().toISOString(),
        ui: {
          appStarted: true,
          activePage: 'draw'
        },
        session: {
          currentFileName: '/tmp/restored.xlsx',
          currentProject: 'Restored Project',
          sheetNames: ['Restored Project'],
          projectsData: {
            'Restored Project': createProject({
              groupCount: 2,
              teams: [createTeam({ group: 1 })]
            })
          }
        }
      }
    });

    class FailingDrawAlgorithm {
      restore() {
        throw new Error('restore exploded');
      }
    }

    await loadAndRestoreSession(targetStore, FailingDrawAlgorithm);

    const restoredProject = targetStore.projectsData['Existing Project'];
    expect(restoredProject.drawOrderSequence[0]).toBe(restoredProject.teams[0]);
    expect(targetStore.teamsData[0]).toBe(restoredProject.teams[0]);
  });

  it('rejects draw-order sequences with foreign team entries', async () => {
    const { deserializeSession } = await importModule();
    const targetStore = createStore();
    const foreignTeam = createTeam({ id: 2, school: 'Other School', teamName: 'Other Team' });
    const session = {
      version: 1,
      savedAt: new Date().toISOString(),
      ui: {
        appStarted: true,
        activePage: 'draw'
      },
      session: {
        currentFileName: '/tmp/example.xlsx',
        currentProject: 'Project A',
        sheetNames: ['Project A'],
        projectsData: {
          'Project A': createProject({
            teams: [createTeam()],
            groupCount: 1,
            drawOrderGenerated: true,
            drawOrderSequence: [foreignTeam],
            drawOrderProgress: 1
          })
        }
      }
    };

    expect(() => deserializeSession(targetStore, session)).toThrow(/drawOrderSequence/i);
  });

  it('rejects draw-order progress outside the saved sequence bounds', async () => {
    const { deserializeSession } = await importModule();
    const targetStore = createStore();
    const team = createTeam();
    const session = {
      version: 1,
      savedAt: new Date().toISOString(),
      ui: {
        appStarted: true,
        activePage: 'draw'
      },
      session: {
        currentFileName: '/tmp/example.xlsx',
        currentProject: 'Project A',
        sheetNames: ['Project A'],
        projectsData: {
          'Project A': createProject({
            teams: [team],
            groupCount: 1,
            drawOrderSequence: [team],
            drawOrderProgress: 2
          })
        }
      }
    };

    expect(() => deserializeSession(targetStore, session)).toThrow(/drawOrder/i);
  });

  it('rejects dangerous reserved project names in persisted data', async () => {
    const { deserializeSession } = await importModule();
    const targetStore = createStore();
    const session = {
      version: 1,
      savedAt: new Date().toISOString(),
      ui: {
        appStarted: true,
        activePage: 'draw'
      },
      session: {
        currentFileName: '/tmp/example.xlsx',
        currentProject: '__proto__',
        sheetNames: ['__proto__'],
        projectsData: {
          __proto__: createProject()
        }
      }
    };

    expect(() => deserializeSession(targetStore, session)).toThrow(/project name/i);
  });
});

describe('low-frequency persistence hooks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('persists immediately when entering the main app', async () => {
    const saveSessionNowMock = vi.fn().mockResolvedValue({ success: true });
    const saveSessionDebouncedMock = vi.fn();
    vi.doMock('../../src/session-persistence.js', () => ({
      saveSessionNow: saveSessionNowMock,
      saveSessionDebounced: saveSessionDebouncedMock
    }));

    const dom = new JSDOM(`
      <div id="welcome-page"></div>
      <div id="main-app" class="hidden"></div>
    `);

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);

    const { store } = await import('../../src/store.js');
    store.appStarted = false;

    const { startDrawSystem } = await import('../../src/welcome.js');
    startDrawSystem();

    expect(store.appStarted).toBe(true);
    expect(saveSessionNowMock).toHaveBeenCalledWith(store);
    expect(saveSessionDebouncedMock).not.toHaveBeenCalled();
  });

  it('persists immediately when switching pages', async () => {
    const saveSessionNowMock = vi.fn().mockResolvedValue({ success: true });
    const saveSessionDebouncedMock = vi.fn();
    vi.doMock('../../src/session-persistence.js', () => ({
      saveSessionNow: saveSessionNowMock,
      saveSessionDebounced: saveSessionDebouncedMock
    }));

    const dom = new JSDOM(`
      <button class="nav-item active" data-page="settings"></button>
      <button class="nav-item" data-page="order"></button>
      <div id="page-settings" class="page active"></div>
      <div id="page-order" class="page"></div>
    `);

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);

    const { store } = await import('../../src/store.js');
    store.activePage = 'settings';
    store.sheetNames = ['Project A'];

    const { switchPage } = await import('../../src/navigation.js');
    switchPage('order');

    expect(store.activePage).toBe('order');
    expect(saveSessionNowMock).toHaveBeenCalledWith(store);
    expect(saveSessionDebouncedMock).not.toHaveBeenCalled();
  });
});
