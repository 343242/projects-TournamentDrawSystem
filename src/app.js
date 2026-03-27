// 应用入口文件 - 跨页面协调和初始化

import { store } from './store.js';
import { showConfirmDialog } from './dialog.js';
import { switchPage, goToNext, goToPrev, updateNavigationState, updatePageHeaders, registerPageInit, registerPageLeave } from './navigation.js';
import { startDrawSystem, changeBackground, loadCustomBackground } from './welcome.js';
import { renderTeamTable, updateGroupCount, renderProjectList, selectProject } from './settings-page.js';
import { generateOrder, renderOrderTable, updateOrderStatus, stopOrderAnimation, pauseOrderDraw } from './order-page.js';
import { initGroupsDisplay, startDrawAnimation, resetDraw, createTeamItem, renderDrawResultTable, updateDrawStatus } from './draw-page.js';
import { selectFile, exportResult } from './file-ops.js';

// ========== 跨页面协调函数 ==========

// 供其他模块通过 window._xxx 调用的跨页面函数
window._updateUIForProject = updateUIForProject;
window._renderProjectList = renderProjectList;
window._renderTeamTable = renderTeamTable;
window._generateOrder = generateOrder;
window._selectProject = selectProject;

function updateUIForProject() {
  if (!store.currentProject) return;

  const project = store.projectsData[store.currentProject];

  // 更新统计信息
  document.getElementById('team-count').value = project.teams.length;
  document.getElementById('total-teams-display').textContent = project.teams.length;

  // 分组数量：没有数据时为0，有数据时默认为9
  const groupCount = project.teams.length > 0 ? (project.groupCount || 9) : 0;
  document.getElementById('group-count').value = groupCount;

  // 分组数量输入框和设置按钮：没有数据时禁用
  const groupCountInput = document.getElementById('group-count');
  const groupCountBtn = groupCountInput?.nextElementSibling;
  if (project.teams.length === 0) {
    groupCountInput.disabled = true;
    if (groupCountBtn) groupCountBtn.disabled = true;
  } else {
    groupCountInput.disabled = false;
    if (groupCountBtn) groupCountBtn.disabled = false;
  }

  // 更新表格
  renderTeamTable();

  // 更新按钮状态
  document.getElementById('next-settings-btn').disabled = project.teams.length === 0;
  document.getElementById('next-order-btn').disabled = !project.drawOrderGenerated;

  // 更新抽签顺序表格
  if (project.drawOrderGenerated) {
    renderOrderTable();
  } else {
    const orderTbody = document.querySelector('#order-table tbody');
    orderTbody.innerHTML = '<tr class="empty-row"><td colspan="5">请先生成抽签顺序</td></tr>';
  }

  // 更新抽签顺序状态面板
  updateOrderStatus();

  // 更新分组抽签状态
  if (project.drawCompleted && store.drawAlgorithm) {
    initGroupsDisplay();
    const groups = store.drawAlgorithm.getGroups();
    groups.forEach(group => {
      const body = document.getElementById(`group-body-${group.index - 1}`);
      if (body) {
        body.innerHTML = '';
        group.teams.forEach(team => {
          body.appendChild(createTeamItem(team));
        });
      }
    });
    renderDrawResultTable();
    updateDrawStatus();
    const slot = document.getElementById('draw-slot');
    slot.classList.remove('active');
    slot.innerHTML = '<span class="slot-team">✓ 抽签完成！</span>';
    document.getElementById('start-draw-btn').disabled = true;
    document.getElementById('reset-draw-btn').disabled = false;
    document.getElementById('final-export-btn').disabled = false;
  } else {
    renderDrawResultTable();
    updateDrawStatus();
    document.getElementById('draw-slot').classList.remove('active');
    document.getElementById('draw-slot').innerHTML = '<span class="slot-text">点击"开始抽签"进行分组</span>';
    document.getElementById('start-draw-btn').disabled = project.teams.length === 0;
    document.getElementById('reset-draw-btn').disabled = true;
    document.getElementById('final-export-btn').disabled = true;
    document.getElementById('groups-container').innerHTML = '';
  }

  // 导出按钮状态
  document.getElementById('export-btn').disabled = !project.drawCompleted;
}

function clearData() {
  showConfirmDialog('确定要清除所有数据吗？', () => {
    // 先停止所有进行中的动画和定时器
    stopOrderAnimation();

    store.teamsData = [];
    store.projectsData = {};
    store.sheetNames = [];
    store.currentProject = null;
    store.currentFilePath = null;
    store.drawAlgorithm = null;
    store.drawCompleted = false;
    store.drawOrderState = null;

    document.getElementById('team-count').value = '0';
    document.getElementById('total-teams-display').textContent = '0';
    document.getElementById('group-count').value = '0';
    document.getElementById('selected-file').textContent = '';
    document.getElementById('next-settings-btn').disabled = true;
    document.getElementById('export-btn').disabled = true;

    // 禁用分组数量输入框和设置按钮
    const groupCountInput = document.getElementById('group-count');
    const groupCountBtn = groupCountInput?.nextElementSibling;
    if (groupCountInput) groupCountInput.disabled = true;
    if (groupCountBtn) groupCountBtn.disabled = true;

    renderTeamTable();
    renderProjectList();
    updateNavigationState();
    updatePageHeaders();

    // 重置抽签顺序页面
    const orderTbody = document.querySelector('#order-table tbody');
    orderTbody.innerHTML = '<tr class="empty-row"><td colspan="5">请先在"抽签设置"页面上传数据</td></tr>';
    const genBtn = document.getElementById('generate-order-btn');
    genBtn.disabled = false;
    genBtn.innerHTML = '<span class="btn-icon">🎲</span>启动抽签';
    genBtn.className = 'btn btn-success btn-large';
    document.getElementById('next-order-btn').disabled = true;
    updateOrderStatus();

    // 重置分组抽签页面
    document.getElementById('groups-container').innerHTML = '';
    const drawTbody = document.querySelector('#draw-result-table tbody');
    drawTbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先开始抽签</td></tr>';
    const slot = document.getElementById('draw-slot');
    slot.classList.remove('active');
    slot.innerHTML = '<span class="slot-text">点击"开始抽签"进行分组</span>';
    const drawStatusLabel = document.getElementById('draw-status-label');
    if (drawStatusLabel) drawStatusLabel.textContent = '--';
    const drawStatusCount = document.getElementById('draw-status-count');
    if (drawStatusCount) drawStatusCount.textContent = '剩余: -- 支';
    document.getElementById('start-draw-btn').disabled = true;
    document.getElementById('reset-draw-btn').disabled = true;
    document.getElementById('final-export-btn').disabled = true;
  });
}

function exitApp() {
  showConfirmDialog('确定要退出系统吗？', () => {
    window.close();
  });
}

// ========== 注册页面初始化回调 ==========

// 切换到分组抽签页面时初始化分组显示
registerPageInit('draw', () => {
  if (store.drawAlgorithm) {
    initGroupsDisplay();
  }
});

// 离开抽签顺序页面时暂停动画
registerPageLeave('order', pauseOrderDraw);

// ========== 注册全局函数（供 HTML onclick 调用） ==========

// ========== 初始化 ==========

document.addEventListener('DOMContentLoaded', () => {
  console.log('大赛抽签系统已加载');

  // 事件委托：通过 data-action 属性处理所有按钮点击
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

  // 加载自定义背景
  loadCustomBackground();

  // 初始化导航状态
  updateNavigationState();

  // 初始化抽签顺序状态面板
  updateOrderStatus();

  // 渲染空的项目列表
  renderProjectList();

  // 初始化分组数量输入框为禁用状态
  const groupCountInput = document.getElementById('group-count');
  const groupCountBtn = groupCountInput?.nextElementSibling;
  if (groupCountInput) groupCountInput.disabled = true;
  if (groupCountBtn) groupCountBtn.disabled = true;

  // 监听分组数量输入 - 自动更新
  document.getElementById('group-count')?.addEventListener('input', function() {
    const value = parseInt(this.value) || 0;
    if (value >= 2 && value <= 20 && store.currentProject && store.projectsData[store.currentProject]) {
      store.projectsData[store.currentProject].groupCount = value;
      store.projectsData[store.currentProject].drawCompleted = false;
      store.teamsData.forEach(team => {
        team.group = 0;
      });
      store.drawAlgorithm = null;
      store.drawCompleted = false;
      renderProjectList();
    }
  });
});
