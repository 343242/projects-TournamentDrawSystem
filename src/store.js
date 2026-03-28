// Centralized application state - shared by all page modules
// Single-window Electron app recommended pattern: shared state via ES Modules import

export const DEFAULT_GROUP_COUNT = 9;
export const MIN_GROUP_COUNT = 2;
export const MAX_GROUP_COUNT = 20;

export const store = {
  teamsData: [],
  drawAlgorithm: null,
  currentFilePath: null,
  drawCompleted: false,
  drawCount: 0,

  // Multi-project support
  projectsData: {},  // { sheetName: { teams: [], groupCount: 9, drawOrderGenerated: false, drawCompleted: false } }
  currentProject: null,
  sheetNames: [],

  // Draw order animation state
  drawOrderState: null,

  // Anti-debounce
  isGeneratingOrder: false,
};
