// Centralized application state - shared by all page modules
// Single-window Electron app recommended pattern: shared state via ES Modules import

export const DEFAULT_GROUP_COUNT = 9;
export const MIN_GROUP_COUNT = 2;
export const MAX_GROUP_COUNT = 20;

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

  isGeneratingOrder: false,
};
