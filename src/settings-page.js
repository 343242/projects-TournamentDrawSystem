// 抽签设置页面逻辑

import { store, DEFAULT_GROUP_COUNT, MIN_GROUP_COUNT, MAX_GROUP_COUNT } from './store.js';
import { showAlertDialog, showPromptDialog } from './dialog.js';
import { updateNavigationState, updatePageHeaders } from './navigation.js';
import { escapeHtml } from './utils.js';
import { stopOrderAnimation } from './order-page.js';
import { stopDrawAnimation } from './draw-page.js';
import { eventBus } from './events.js';
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
  if (store.teamsData.length === 0) {
    showAlertDialog('请先上传队伍数据');
    return;
  }

  const currentCount = store.projectsData[store.currentProject]?.groupCount || DEFAULT_GROUP_COUNT;
  const totalTeams = store.teamsData.length;

  const maxGroups = Math.min(Math.floor(totalTeams / 2), MAX_GROUP_COUNT);

  showPromptDialog(
    '请输入分组数量',
    currentCount,
    (value) => {
      const groupCount = parseInt(value) || 0;

      if (groupCount < MIN_GROUP_COUNT) {
        showAlertDialog(`至少需要 ${MIN_GROUP_COUNT} 个分组`);
        return;
      }
      if (groupCount > maxGroups) {
        showAlertDialog(`每组至少需要 2 支队伍，最多可分为 ${maxGroups} 组`);
        return;
      }

      if (store.currentProject && store.projectsData[store.currentProject]) {
        store.projectsData[store.currentProject].groupCount = groupCount;
        store.projectsData[store.currentProject].drawCompleted = false;
        store.projectsData[store.currentProject].drawOrderGenerated = false;
        store.projectsData[store.currentProject].drawOrderSequence = null;
        store.projectsData[store.currentProject].drawOrderProgress = 0;
      }

      store.teamsData.forEach(team => {
        team.group = 0;
        team.drawOrder = 0;
      });

      store.drawAlgorithm = null;
      store.drawCompleted = false;

      stopDrawAnimation();
      stopOrderAnimation();

      // Update display
      const displayEl = document.getElementById('group-count-display');
      if (displayEl) displayEl.textContent = groupCount;

      renderProjectList();
      eventBus.emit('groupCountUpdated');
      eventBus.emit('updateUIForProject');
    },
    null,
    MIN_GROUP_COUNT,
    maxGroups
  );
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
        ${project.drawCompleted ? '✓ 已完成' : (project.drawOrderGenerated || project.drawOrderSequence ? '⏳ 进行中' : '○ 待抽签')}
      </div>
    `;
    card.onclick = () => selectProject(name);
    container.appendChild(card);
  });
}

export function selectProject(projectName) {
  if (!store.projectsData[projectName]) return;

  stopOrderAnimation();
  stopDrawAnimation();

  store.currentProject = projectName;
  const project = store.projectsData[projectName];
  store.teamsData = project.teams;
  store.drawCompleted = project.drawCompleted;

  if (project.groupCount > 0 && project.teams.length > 0) {
    store.drawAlgorithm = new DrawAlgorithm(store.teamsData, project.groupCount);
    store.drawAlgorithm.restore();
  } else {
    store.drawAlgorithm = null;
  }

  // Notify app.js to update all page UIs via event bus
  eventBus.emit('updateUIForProject');
  renderProjectList();
  updateNavigationState();
  updatePageHeaders();
}
