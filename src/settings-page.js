// 抽签设置页面逻辑

import { store } from './store.js';
import { showAlertDialog } from './dialog.js';
import { updateNavigationState, updatePageHeaders } from './navigation.js';
import { escapeHtml } from './utils.js';
import { stopOrderAnimation } from './order-page.js';
import DrawAlgorithm from '../draw-algorithm.js';

export function renderTeamTable() {
  const tbody = document.querySelector('#team-table tbody');
  tbody.innerHTML = '';

  if (store.teamsData.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无数据，请上传队伍数据</td></tr>';
    return;
  }

  store.teamsData.forEach((team, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(String(team.id))}</td>
      <td>${escapeHtml(team.teamName)}</td>
      <td>${escapeHtml(team.school)}</td>
      <td class="seed-cell ${team.isSeeded ? 'seeded' : ''}" data-index="${index}">
        ${team.isSeeded ? '是' : '-'}
      </td>
      <td>${team.drawOrder || '-'}</td>
      <td>${team.group || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

export function updateGroupCount() {
  // 检查是否有队伍数据
  if (store.teamsData.length === 0) {
    showAlertDialog('请先上传队伍数据');
    return;
  }

  const groupCount = parseInt(document.getElementById('group-count').value) || 0;

  if (groupCount < 2 || groupCount > 20) return;
  if (store.teamsData.length > 0 && groupCount > store.teamsData.length) return;

  // 更新当前项目的分组数量
  if (store.currentProject && store.projectsData[store.currentProject]) {
    store.projectsData[store.currentProject].groupCount = groupCount;
    // 分组数变更使已有抽签结果失效
    store.projectsData[store.currentProject].drawCompleted = false;
  }

  // 分组数变更后，旧分组结果全部失效
  store.teamsData.forEach(team => {
    team.group = 0;
  });

  // 重置算法以便使用新的分组数
  store.drawAlgorithm = null;
  store.drawCompleted = false;
  renderProjectList();
}

export function renderProjectList() {
  const container = document.getElementById('project-list');
  if (!container) return;

  container.innerHTML = '';

  if (store.sheetNames.length === 0) {
    container.innerHTML = '<div class="project-card empty">暂无比赛项目</div>';
    return;
  }

  store.sheetNames.forEach(name => {
    const project = store.projectsData[name];
    const card = document.createElement('div');
    card.className = 'project-card' + (name === store.currentProject ? ' active' : '');
    card.innerHTML = `
      <div class="project-header-row">
        <span class="project-name">${escapeHtml(name)}</span>
        <span class="project-stats">队伍: ${project.teams.length} | 分组: ${project.groupCount}</span>
      </div>
      <div class="project-status">
        ${project.drawCompleted ? '✓ 已完成' : (project.drawOrderGenerated ? '⏳ 进行中' : '○ 待抽签')}
      </div>
    `;
    card.onclick = () => selectProject(name);
    container.appendChild(card);
  });
}

export function selectProject(projectName) {
  if (!store.projectsData[projectName]) return;

  // 切换项目前停止进行中的抽签顺序动画
  stopOrderAnimation();

  store.currentProject = projectName;
  const project = store.projectsData[projectName];
  store.teamsData = project.teams;
  store.drawCompleted = project.drawCompleted;

  // 如果项目已完成抽签，重建算法实例以恢复分组结果
  if (project.drawCompleted && project.groupCount > 0) {
    store.drawAlgorithm = new DrawAlgorithm(store.teamsData, project.groupCount);
    store.drawAlgorithm.restore();
  } else {
    store.drawAlgorithm = null;
  }

  // 通知 app.js 更新所有页面 UI
  if (typeof window._updateUIForProject === 'function') {
    window._updateUIForProject();
  }

  renderProjectList();
  updateNavigationState();
  updatePageHeaders();
}
