// 集中式应用状态 - 所有页面模块共享
// 单窗口 Electron 应用推荐方式：同进程模块通过 ES Modules import 共享状态

export const store = {
  teamsData: [],
  drawAlgorithm: null,
  currentFilePath: null,
  drawCompleted: false,

  // 多项目支持
  projectsData: {},  // { sheetName: { teams: [], groupCount: 9, drawOrderGenerated: false, drawCompleted: false } }
  currentProject: null,
  sheetNames: [],

  // 防抖保护
  isGeneratingOrder: false,

  // 抽签顺序动画状态
  drawOrderState: null,
};
