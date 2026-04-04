import { store } from './store.js';

const SESSION_VERSION = 1;
const DEFAULT_ACTIVE_PAGE = 'settings';
const VALID_PAGES = new Set(['settings', 'order', 'draw']);
const RESERVED_PROJECT_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const SAVE_DEBOUNCE_MS = 250;

let pendingSaveTimer = null;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeActivePage(value) {
  return VALID_PAGES.has(value) ? value : DEFAULT_ACTIVE_PAGE;
}

function toInteger(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

function requireString(value, message) {
  if (typeof value !== 'string') {
    throw new Error(message);
  }

  return value;
}

function requireInteger(value, message) {
  if (!Number.isInteger(value)) {
    throw new Error(message);
  }

  return value;
}

function requireBoolean(value, message) {
  if (typeof value !== 'boolean') {
    throw new Error(message);
  }

  return value;
}

function validateProjectName(projectName, context = 'project name') {
  requireString(projectName, `Invalid ${context}`);

  if (projectName.length === 0) {
    throw new Error(`Invalid ${context}`);
  }

  if (RESERVED_PROJECT_NAMES.has(projectName)) {
    throw new Error(`Invalid ${context}`);
  }

  return projectName;
}

function createSafeProjectsRecord() {
  return Object.create(null);
}

function validateTeamSnapshot(team, context) {
  if (!isPlainObject(team)) {
    throw new Error(`Invalid team snapshot in ${context}`);
  }

  requireInteger(team.id, `Invalid team id in ${context}`);
  requireString(team.school, `Invalid team school in ${context}`);
  requireString(team.teamName, `Invalid team name in ${context}`);
  requireBoolean(team.isSeeded, `Invalid team seeded flag in ${context}`);
  requireInteger(team.drawOrder, `Invalid team drawOrder in ${context}`);
  requireInteger(team.group, `Invalid team group in ${context}`);
}

function validateTeamGroupWithinProject(team, groupCount, context) {
  if (!Number.isInteger(groupCount) || groupCount < 0) {
    throw new Error(`Invalid project groupCount in ${context}`);
  }

  if (team.group < 0) {
    throw new Error(`Invalid team group in ${context}`);
  }

  if (groupCount === 0) {
    if (team.group !== 0) {
      throw new Error(`Invalid team group in ${context}`);
    }
    return;
  }

  if (team.group > groupCount) {
    throw new Error(`Invalid team group in ${context}`);
  }
}

function cloneValidatedTeamSnapshot(team) {
  return {
    id: team.id,
    school: team.school,
    teamName: team.teamName,
    isSeeded: team.isSeeded,
    drawOrder: team.drawOrder,
    group: team.group
  };
}

function serializeTeamSnapshot(team, context) {
  validateTeamSnapshot({
    id: toInteger(team?.id),
    school: typeof team?.school === 'string' ? team.school : team?.school,
    teamName: typeof team?.teamName === 'string' ? team.teamName : team?.teamName,
    isSeeded: normalizeBoolean(team?.isSeeded),
    drawOrder: toInteger(team?.drawOrder),
    group: toInteger(team?.group)
  }, context);

  return {
    id: toInteger(team?.id),
    school: typeof team?.school === 'string' ? team.school : '',
    teamName: typeof team?.teamName === 'string' ? team.teamName : '',
    isSeeded: normalizeBoolean(team?.isSeeded),
    drawOrder: toInteger(team?.drawOrder),
    group: toInteger(team?.group)
  };
}

function cloneDrawOrderSequence(drawOrderSequence) {
  if (drawOrderSequence == null) {
    return null;
  }

  if (!Array.isArray(drawOrderSequence)) {
    throw new Error('Invalid draw order sequence');
  }

  return drawOrderSequence.map((team, index) => {
    validateTeamSnapshot(team, `drawOrderSequence[${index}]`);
    return cloneValidatedTeamSnapshot(team);
  });
}

function validateDrawOrderState(project, projectName = 'project') {
  const sequence = project.drawOrderSequence;
  const progress = project.drawOrderProgress;
  const teamCount = project.teams.length;

  if (sequence == null) {
    if (progress !== 0) {
      throw new Error(`Invalid drawOrderProgress for project ${projectName}`);
    }
    if (project.drawOrderGenerated) {
      throw new Error(`Invalid drawOrderSequence for project ${projectName}`);
    }
    return;
  }

  if (sequence.length !== teamCount) {
    throw new Error(`Invalid drawOrderSequence for project ${projectName}`);
  }

  if (progress < 0 || progress > sequence.length) {
    throw new Error(`Invalid drawOrderProgress for project ${projectName}`);
  }

  if (project.drawOrderGenerated) {
    if (progress !== sequence.length) {
      throw new Error(`Invalid drawOrderProgress for project ${projectName}`);
    }
  } else if (progress === sequence.length && sequence.length > 0) {
    throw new Error(`Invalid drawOrderProgress for project ${projectName}`);
  }
}

function serializeDrawOrderSequence(drawOrderSequence) {
  if (drawOrderSequence == null) {
    return null;
  }

  if (!Array.isArray(drawOrderSequence)) {
    throw new Error('Invalid draw order sequence');
  }

  return drawOrderSequence.map((team, index) => serializeTeamSnapshot(team, `drawOrderSequence[${index}]`));
}

function cloneProjectSnapshot(project) {
  if (!isPlainObject(project)) {
    throw new Error('Invalid project snapshot');
  }

  if (!Array.isArray(project.teams)) {
    throw new Error('Invalid project teams');
  }

  requireInteger(project.groupCount, 'Invalid project groupCount');
  if (project.groupCount < 0) {
    throw new Error('Invalid project groupCount');
  }
  if (project.teams.length > 0 && project.groupCount === 0) {
    throw new Error('Invalid project groupCount');
  }

  const teams = project.teams.map((team, index) => {
    validateTeamSnapshot(team, `teams[${index}]`);
    validateTeamGroupWithinProject(team, project.groupCount, `teams[${index}]`);
    return cloneValidatedTeamSnapshot(team);
  });

  requireBoolean(project.drawOrderGenerated, 'Invalid project drawOrderGenerated');
  if (project.drawOrderSequence != null && !Array.isArray(project.drawOrderSequence)) {
    throw new Error('Invalid project drawOrderSequence');
  }
  requireInteger(project.drawOrderProgress, 'Invalid project drawOrderProgress');
  requireBoolean(project.drawCompleted, 'Invalid project drawCompleted');

  const clonedProject = {
    teams,
    groupCount: project.groupCount,
    drawOrderGenerated: project.drawOrderGenerated,
    drawOrderSequence: cloneDrawOrderSequence(project.drawOrderSequence),
    drawOrderProgress: project.drawOrderProgress,
    drawCompleted: project.drawCompleted
  };

  validateDrawOrderState(clonedProject);
  return clonedProject;
}

function cloneAndRelinkProjectSnapshot(project, projectName = 'project') {
  const hydratedProject = cloneProjectSnapshot(project);
  const identityMap = new Map();

  hydratedProject.teams.forEach((team) => {
    const key = createTeamIdentityKey(team);
    const existing = identityMap.get(key) || [];
    existing.push(team);
    identityMap.set(key, existing);
  });

  hydratedProject.drawOrderSequence = hydratedProject.drawOrderSequence
    ? hydratedProject.drawOrderSequence.map((team, index) => {
        const key = createTeamIdentityKey(team);
        const candidates = identityMap.get(key);
        const hydratedTeam = candidates && candidates.shift();
        if (!hydratedTeam) {
          throw new Error(`Invalid drawOrderSequence reference at index ${index} for project ${projectName}`);
        }
        return hydratedTeam;
      })
    : null;

  validateDrawOrderState(hydratedProject, projectName);

  return hydratedProject;
}

function cloneAndRelinkProjectsData(projectsData) {
  if (!isPlainObject(projectsData)) {
    return createSafeProjectsRecord();
  }

  const result = createSafeProjectsRecord();

  Object.entries(projectsData).forEach(([projectName, project]) => {
    validateProjectName(projectName, 'project name');
    result[projectName] = cloneAndRelinkProjectSnapshot(project, projectName);
  });

  return result;
}

function serializeProjectSnapshot(project) {
  if (!isPlainObject(project)) {
    throw new Error('Invalid project snapshot');
  }

  if (!Array.isArray(project.teams)) {
    throw new Error('Invalid project teams');
  }

  const teams = project.teams.map((team, index) => serializeTeamSnapshot(team, `teams[${index}]`));
  const groupCount = toInteger(project.groupCount);
  if (groupCount < 0) {
    throw new Error('Invalid project groupCount');
  }
  if (teams.length > 0 && groupCount <= 0) {
    throw new Error('Invalid project groupCount');
  }

  teams.forEach((team, index) => {
    validateTeamGroupWithinProject(team, groupCount, `teams[${index}]`);
  });

  const serializedProject = {
    teams,
    groupCount,
    drawOrderGenerated: normalizeBoolean(project.drawOrderGenerated),
    drawOrderSequence: serializeDrawOrderSequence(project.drawOrderSequence),
    drawOrderProgress: toInteger(project.drawOrderProgress),
    drawCompleted: normalizeBoolean(project.drawCompleted)
  };

  validateDrawOrderState(serializedProject);
  return serializedProject;
}

function cloneProjectsData(projectsData) {
  if (!isPlainObject(projectsData)) {
    return createSafeProjectsRecord();
  }

  const result = createSafeProjectsRecord();

  Object.entries(projectsData).forEach(([projectName, project]) => {
    validateProjectName(projectName, 'project name');
    result[projectName] = cloneProjectSnapshot(project);
  });

  return result;
}

function serializeProjectsData(projectsData) {
  if (!isPlainObject(projectsData)) {
    return createSafeProjectsRecord();
  }

  const result = createSafeProjectsRecord();

  Object.entries(projectsData).forEach(([projectName, project]) => {
    validateProjectName(projectName, 'project name');
    result[projectName] = serializeProjectSnapshot(project);
  });

  return result;
}

function buildSessionDocument(sourceStore = store) {
  return {
    version: SESSION_VERSION,
    savedAt: new Date().toISOString(),
    ui: {
      appStarted: normalizeBoolean(sourceStore.appStarted),
      activePage: normalizeActivePage(sourceStore.activePage)
    },
    session: {
      currentFileName: typeof sourceStore.currentFilePath === 'string' ? sourceStore.currentFilePath : null,
      currentProject: typeof sourceStore.currentProject === 'string' ? sourceStore.currentProject : null,
      sheetNames: Array.isArray(sourceStore.sheetNames) ? [...sourceStore.sheetNames] : [],
      projectsData: serializeProjectsData(sourceStore.projectsData)
    }
  };
}

function isValidSavedAt(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateSessionDocument(sessionDocument) {
  if (!isPlainObject(sessionDocument)) {
    throw new Error('Session document must be an object');
  }

  if (sessionDocument.version !== SESSION_VERSION) {
    throw new Error('Unsupported session version');
  }

  if (!isValidSavedAt(sessionDocument.savedAt)) {
    throw new Error('Invalid savedAt value');
  }

  if (!isPlainObject(sessionDocument.ui)) {
    throw new Error('Invalid ui payload');
  }

  if (!isPlainObject(sessionDocument.session)) {
    throw new Error('Invalid session payload');
  }

  if (!Array.isArray(sessionDocument.session.sheetNames)) {
    throw new Error('Invalid sheetNames payload');
  }

  if (!isPlainObject(sessionDocument.session.projectsData)) {
    throw new Error('Invalid projectsData payload');
  }

  sessionDocument.session.sheetNames.forEach((sheetName, index) => {
    validateProjectName(sheetName, `project name at sheetNames[${index}]`);
  });

  if (sessionDocument.session.currentProject != null) {
    validateProjectName(sessionDocument.session.currentProject, 'current project name');
  }

  const projectNames = Object.keys(sessionDocument.session.projectsData);
  const sheetNameSet = new Set(sessionDocument.session.sheetNames);
  const projectNameSet = new Set(projectNames);

  if (sheetNameSet.size !== sessionDocument.session.sheetNames.length) {
    throw new Error('Invalid duplicate sheetNames');
  }

  sessionDocument.session.sheetNames.forEach((sheetName) => {
    if (!projectNameSet.has(sheetName)) {
      throw new Error(`Missing project entry for sheet ${sheetName}`);
    }
  });

  projectNames.forEach((projectName) => {
    if (!sheetNameSet.has(projectName)) {
      throw new Error(`Project ${projectName} is not listed in sheetNames`);
    }
  });

  Object.entries(sessionDocument.session.projectsData).forEach(([projectName, project]) => {
    validateProjectName(projectName, 'project name');
    cloneAndRelinkProjectSnapshot(project, projectName);
  });

  return true;
}

async function clearInvalidSession(reason) {
  if (reason) {
    console.warn(`Clearing unusable session: ${reason}`);
  }

  if (window.electronAPI?.clearSession) {
    try {
      await window.electronAPI.clearSession();
    } catch (error) {
      console.warn('Failed to clear invalid session:', error);
    }
  }
}

function hydrateStoreFromSessionDocument(targetStore, sessionDocument) {
  validateSessionDocument(sessionDocument);

  const ui = sessionDocument.ui;
  const session = sessionDocument.session;
  const sheetNames = [...session.sheetNames];
  const projectsData = cloneAndRelinkProjectsData(session.projectsData);

  targetStore.appStarted = normalizeBoolean(ui.appStarted);
  targetStore.activePage = normalizeActivePage(ui.activePage);
  targetStore.currentFilePath = typeof session.currentFileName === 'string' ? session.currentFileName : null;
  targetStore.sheetNames = sheetNames;
  targetStore.projectsData = projectsData;

  const requestedProject = typeof session.currentProject === 'string' ? session.currentProject : null;
  targetStore.currentProject = requestedProject && projectsData[requestedProject] ? requestedProject : null;
  targetStore.teamsData = targetStore.currentProject ? projectsData[targetStore.currentProject].teams : [];

  targetStore.drawAlgorithm = null;
  targetStore.drawOrderState = null;
  targetStore.drawAnimationState = null;
  targetStore.isGeneratingOrder = false;
  targetStore.drawCount = 0;

  if (targetStore.currentProject) {
    const currentProjectData = projectsData[targetStore.currentProject];
    const groupedTeams = currentProjectData.teams.filter((team) => team.group > 0).length;
    targetStore.drawCount = groupedTeams;
  }

  return sessionDocument;
}

function createTeamIdentityKey(team) {
  return JSON.stringify([
    team.id,
    team.school,
    team.teamName,
    team.isSeeded,
    team.drawOrder,
    team.group
  ]);
}

function rebuildDrawAlgorithm(targetStore, DrawAlgorithm) {
  const currentProject = targetStore.currentProject ? targetStore.projectsData[targetStore.currentProject] : null;

  if (!currentProject || !Array.isArray(currentProject.teams) || currentProject.teams.length === 0) {
    targetStore.drawAlgorithm = null;
    return null;
  }

  if (!Number.isInteger(currentProject.groupCount) || currentProject.groupCount <= 0) {
    targetStore.drawAlgorithm = null;
    return null;
  }

  const drawAlgorithm = new DrawAlgorithm(currentProject.teams, currentProject.groupCount);
  drawAlgorithm.restore();
  targetStore.drawAlgorithm = drawAlgorithm;
  return drawAlgorithm;
}

function cloneStoreState(targetStore) {
  return {
    appStarted: normalizeBoolean(targetStore.appStarted),
    activePage: normalizeActivePage(targetStore.activePage),
    currentFilePath: typeof targetStore.currentFilePath === 'string' ? targetStore.currentFilePath : null,
    currentProject: typeof targetStore.currentProject === 'string' ? targetStore.currentProject : null,
    sheetNames: Array.isArray(targetStore.sheetNames) ? [...targetStore.sheetNames] : [],
    projectsData: cloneProjectsData(targetStore.projectsData),
    teamsData: Array.isArray(targetStore.teamsData)
      ? targetStore.teamsData.map((team, index) => {
          validateTeamSnapshot(team, `teamsData[${index}]`);
          return cloneValidatedTeamSnapshot(team);
        })
      : [],
    drawAlgorithm: targetStore.drawAlgorithm,
    drawOrderState: targetStore.drawOrderState,
    drawAnimationState: targetStore.drawAnimationState,
    isGeneratingOrder: normalizeBoolean(targetStore.isGeneratingOrder),
    drawCount: toInteger(targetStore.drawCount)
  };
}

function restoreStoreState(targetStore, snapshot) {
  targetStore.appStarted = snapshot.appStarted;
  targetStore.activePage = snapshot.activePage;
  targetStore.currentFilePath = snapshot.currentFilePath;
  targetStore.currentProject = snapshot.currentProject;
  targetStore.sheetNames = [...snapshot.sheetNames];
  targetStore.projectsData = cloneAndRelinkProjectsData(snapshot.projectsData);
  targetStore.teamsData = targetStore.currentProject && targetStore.projectsData[targetStore.currentProject]
    ? targetStore.projectsData[targetStore.currentProject].teams
    : snapshot.teamsData.map((team) => cloneValidatedTeamSnapshot(team));
  targetStore.drawAlgorithm = snapshot.drawAlgorithm;
  targetStore.drawOrderState = snapshot.drawOrderState;
  targetStore.drawAnimationState = snapshot.drawAnimationState;
  targetStore.isGeneratingOrder = snapshot.isGeneratingOrder;
  targetStore.drawCount = snapshot.drawCount;
}

export function serializeSession(sourceStore = store) {
  return buildSessionDocument(sourceStore);
}

export function deserializeSession(targetStore, sessionDocument) {
  if (!targetStore) {
    throw new Error('A target store is required');
  }

  return hydrateStoreFromSessionDocument(targetStore, sessionDocument);
}

export async function saveSessionNow(sourceStore = store) {
  if (!window.electronAPI?.saveSession) {
    return { success: false, error: 'Session persistence API unavailable' };
  }

  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }

  const sessionDocument = buildSessionDocument(sourceStore);
  const result = await window.electronAPI.saveSession(sessionDocument);

  if (!result?.success) {
    console.warn('Failed to save session:', result?.error || 'Unknown error');
  }

  return result;
}

export function saveSessionDebounced(sourceStore = store, waitMs = SAVE_DEBOUNCE_MS) {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
  }

  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    saveSessionNow(sourceStore).catch((error) => {
      console.warn('Debounced session save failed:', error);
    });
  }, waitMs);
}

export async function clearSession() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }

  if (!window.electronAPI?.clearSession) {
    return { success: false, error: 'Session persistence API unavailable' };
  }

  return window.electronAPI.clearSession();
}

export async function loadAndRestoreSession(targetStore = store, DrawAlgorithm) {
  if (!targetStore) {
    throw new Error('A target store is required');
  }

  if (typeof DrawAlgorithm !== 'function') {
    throw new Error('A DrawAlgorithm constructor is required');
  }

  if (!window.electronAPI?.loadSession) {
    return { restored: false, reason: 'Session persistence API unavailable' };
  }

  const result = await window.electronAPI.loadSession();

  if (!result?.success) {
    console.warn('Failed to load session:', result?.error || 'Unknown error');
    return { restored: false, reason: result?.error || 'Load failed' };
  }

  if (!result.exists || !result.data) {
    return { restored: false, reason: 'No saved session' };
  }

  const storeSnapshot = cloneStoreState(targetStore);

  try {
    hydrateStoreFromSessionDocument(targetStore, result.data);
    rebuildDrawAlgorithm(targetStore, DrawAlgorithm);
    return { restored: true, session: result.data };
  } catch (error) {
    restoreStoreState(targetStore, storeSnapshot);
    console.warn('Saved session is unusable:', error);
    await clearInvalidSession(error.message);
    return { restored: false, reason: error.message };
  }
}
