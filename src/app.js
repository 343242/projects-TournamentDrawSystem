// Application entry point - cross-page coordination and initialization

import { store, DEFAULT_GROUP_COUNT, MIN_GROUP_COUNT } from './store.js';
import { eventBus } from './events.js';
import { showAlertDialog, showConfirmDialog } from './dialog.js';
import { switchPage, goToNext, goToPrev, updateNavigationState, updatePageHeaders, registerPageInit, registerPageLeave, resolveAccessiblePage } from './navigation.js';
import { startDrawSystem, changeBackground, loadCustomBackground, restoreMainApp, returnToLaunchScreen } from './welcome.js';
import { renderTeamTable, updateGroupCount, renderProjectList, selectProject } from './settings-page.js';
import { generateOrder, renderOrderTable, updateOrderStatus, stopOrderAnimation, pauseOrderDraw } from './order-page.js';
import { initGroupsDisplay, startDrawAnimation, resetDraw, createTeamItem, renderDrawResultTable, updateDrawStatus, pauseDrawAnimation, stopDrawAnimation, restoreDrawDisplay, initDrawPage } from './draw-page.js';
import { selectFile, exportResult } from './file-ops.js';
import { clearSession, loadAndRestoreSession, saveSessionNow } from './session-persistence.js';
import DrawAlgorithm from '../draw-algorithm.js';

// ========== Cross-page coordination via EventBus ==========

// Register event handlers (replace window._xxx globals)
eventBus.on('updateUIForProject', () => updateUIForProject());
eventBus.on('renderProjectList', () => renderProjectList());
eventBus.on('renderTeamTable', () => renderTeamTable());
eventBus.on('generateOrder', () => generateOrder());
eventBus.on('selectProject', (name) => selectProject(name));
eventBus.on('groupCountUpdated', () => {
  initGroupsDisplay();
  renderDrawResultTable();
  updateDrawStatus();
});

let pendingUnloadFlush = null;

function updateUIForProject() {
  if (!store.currentProject) return;

  const project = store.projectsData[store.currentProject];
  const el = (id) => document.getElementById(id);
  const set = (id, prop, val) => { const e = el(id); if (e) e[prop] = val; };

  // 更新统计信息
  set('team-count', 'value', project.teams.length);
  set('total-teams-display', 'textContent', project.teams.length);

  const groupCount = project.teams.length > 0 ? (project.groupCount || DEFAULT_GROUP_COUNT) : 0;
  const groupCountDisplay = el('group-count-display');
  if (groupCountDisplay) groupCountDisplay.textContent = project.teams.length > 0 ? groupCount : '-';

  const groupCountBtn = document.querySelector('[data-action="update-group-count"]');
  if (groupCountBtn) groupCountBtn.disabled = project.teams.length === 0;

  renderTeamTable();

  set('next-settings-btn', 'disabled', project.teams.length === 0);
  set('next-order-btn', 'disabled', !project.drawOrderGenerated);

  if (project.drawOrderGenerated || project.teams.some(t => t.drawOrder > 0)) {
    renderOrderTable();
  } else {
    const orderTbody = document.querySelector('#order-table tbody');
    if (orderTbody) orderTbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先生成抽签顺序</td></tr>';
  }

  updateOrderStatus();

  // Update order button state
  const genBtn = el('generate-order-btn');
  if (genBtn) {
    if (project.drawOrderGenerated) {
      genBtn.disabled = true;
      genBtn.innerHTML = '<span class="btn-icon">✅</span>抽签完成';
      genBtn.className = 'btn btn-success btn-large';
    } else if (project.drawOrderSequence) {
      genBtn.disabled = false;
      genBtn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
      genBtn.className = 'btn btn-primary btn-large';
    } else {
      genBtn.disabled = false;
      genBtn.innerHTML = '<span class="btn-icon">🎲</span>启动抽签';
      genBtn.className = 'btn btn-success btn-large';
    }
  }

  if (project.drawCompleted && store.drawAlgorithm) {
    initGroupsDisplay();
    restoreDrawDisplay();
    renderDrawResultTable();
    updateDrawStatus();
    const slot = el('draw-slot');
    if (slot) {
      slot.classList.remove('active');
      slot.innerHTML = '<span class="slot-team">✓ 抽签完成！</span>';
    }
    set('start-draw-btn', 'disabled', true);
    set('reset-draw-btn', 'disabled', false);
    set('final-export-btn', 'disabled', false);
  } else if (store.drawAlgorithm && project.teams.some(t => t.group > 0)) {
    initGroupsDisplay();
    restoreDrawDisplay();
    renderDrawResultTable();
    updateDrawStatus();
    const slot = el('draw-slot');
    if (slot) {
      slot.classList.remove('active');
      slot.innerHTML = '<span class="slot-text">等待抽签</span>';
    }
    const startBtn = el('start-draw-btn');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
      startBtn.className = 'btn btn-primary btn-large';
    }
    set('reset-draw-btn', 'disabled', false);
    set('final-export-btn', 'disabled', true);
  } else {
    if (project.groupCount > 0 && project.teams.length > 0) {
      initGroupsDisplay();
    } else {
      const gc = el('groups-container');
      if (gc) gc.innerHTML = '';
    }
    renderDrawResultTable();
    updateDrawStatus();
    const slot = el('draw-slot');
    if (slot) {
      slot.classList.remove('active');
      slot.innerHTML = '<span class="slot-text">抽签队伍</span><br><span class="slot-text"><b>等待抽签</b></span>';
    }
    set('start-draw-btn', 'disabled', project.teams.length === 0);
    set('reset-draw-btn', 'disabled', true);
    set('final-export-btn', 'disabled', true);
  }

  set('export-btn', 'disabled', !project.drawCompleted);
}

function clearData() {
  showConfirmDialog('确定要清除所有数据吗？', async () => {
    let clearResult;

    try {
      clearResult = await clearSession();
    } catch (error) {
      showAlertDialog(`清除会话失败: ${error.message || '未知错误'}`);
      return;
    }

    if (!clearResult?.success) {
      console.warn('Failed to clear persisted session:', clearResult?.error || 'Unknown error');
      showAlertDialog(`清除会话失败: ${clearResult?.error || '未知错误'}`);
      return;
    }

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
    store.drawAnimationState = null;
    store.isGeneratingOrder = false;
    store.drawCount = 0;

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
    switchPage('settings', { persist: false });
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

function shouldFlushSessionOnUnload() {
  return store.appStarted ||
    typeof store.currentFilePath === 'string' ||
    Boolean(store.currentProject) ||
    store.sheetNames.length > 0 ||
    Object.keys(store.projectsData).length > 0 ||
    store.activePage !== 'settings';
}

function flushPendingSessionState() {
  if (!shouldFlushSessionOnUnload()) {
    return Promise.resolve({ skipped: true });
  }

  if (!pendingUnloadFlush) {
    pendingUnloadFlush = saveSessionNow(store)
      .catch((error) => {
        console.warn('Failed to flush session during shutdown:', error);
        return { success: false, error: error.message };
      })
      .finally(() => {
        pendingUnloadFlush = null;
      });
  }

  return pendingUnloadFlush;
}

function syncSelectedFileLabel() {
  const fileLabel = document.getElementById('selected-file');
  if (fileLabel) {
    fileLabel.textContent = store.currentFilePath ? `已选择: ${store.currentFilePath}` : '';
  }
}

function applyRestoredSessionState() {
  syncSelectedFileLabel();
  renderProjectList();
  updateNavigationState();
  updatePageHeaders();
  updateOrderStatus();

  if (store.currentProject) {
    eventBus.emit('updateUIForProject');
  }

  const restoredPage = store.activePage;
  const safePage = resolveAccessiblePage(restoredPage);
  switchPage(safePage, { persist: safePage !== restoredPage });

  if (store.appStarted) {
    restoreMainApp();
  }
}

function exitApp() {
  showConfirmDialog('确定要退出系统吗？', async () => {
    await flushPendingSessionState();
    window.close();
  });
}

// ========== Register page lifecycle callbacks ==========

registerPageInit('draw', initDrawPage);

registerPageLeave('draw', pauseDrawAnimation);

registerPageLeave('order', pauseOrderDraw);

window.addEventListener('beforeunload', () => {
  void flushPendingSessionState();
});

window.addEventListener('unload', () => {
  void flushPendingSessionState();
});

// ========== Initialize ==========

document.addEventListener('DOMContentLoaded', async () => {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const page = button.dataset.page;

    switch (action) {
      case 'start-draw-system': startDrawSystem(); break;
      case 'change-background': changeBackground(); break;
      case 'exit-app': exitApp(); break;
      case 'return-launch': returnToLaunchScreen(); break;
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
  const restoreResult = await loadAndRestoreSession(store, DrawAlgorithm);

  if (restoreResult.restored) {
    applyRestoredSessionState();
  } else {
    updateNavigationState();
    updateOrderStatus();
    renderProjectList();
  }

  const groupCountBtn = document.querySelector('[data-action="update-group-count"]');
  if (groupCountBtn) {
    groupCountBtn.disabled = !store.currentProject || store.teamsData.length === 0;
  }
});
