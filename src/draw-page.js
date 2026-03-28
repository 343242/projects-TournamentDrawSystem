// 分组抽签页面逻辑

import { store, DEFAULT_GROUP_COUNT } from './store.js';
import { showAlertDialog, showConfirmDialog } from './dialog.js';
import { escapeHtml } from './utils.js';
import { eventBus } from './events.js';
import DrawAlgorithm from '../draw-algorithm.js';

export function initGroupsDisplay() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  const groupCount = parseInt(document.getElementById('group-count').value) || DEFAULT_GROUP_COUNT;
  const getGroupLabel = (i) => String.fromCharCode(65 + i);

  for (let i = 0; i < groupCount; i++) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.id = `group-${i}`;
    const label = getGroupLabel(i);
    card.innerHTML = `
      <div class="group-header"><span class="group-letter">${label}</span><span class="group-count" id="group-count-${i}">0 支队伍</span></div>
      <div class="group-body" id="group-body-${i}"></div>
    `;
    container.appendChild(card);
  }
}

export function addDrawResultRow(team, orderNum) {
  const tbody = document.querySelector('#draw-result-table tbody');
  const emptyRow = tbody.querySelector('.empty-row');
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><strong>${orderNum}</strong></td>
    <td>${escapeHtml(team.teamName)}</td>
    <td>${escapeHtml(team.school)}</td>
    <td class="${team.isSeeded ? 'seeded' : ''}">${team.isSeeded ? '是' : '-'}</td>
  `;
  tbody.appendChild(tr);

  const container = tbody.closest('.table-container');
  if (container) {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }
}

export function renderDrawResultTable() {
  const tbody = document.querySelector('#draw-result-table tbody');
  tbody.innerHTML = '';

  if (!store.drawAlgorithm) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先开始抽签</td></tr>';
    return;
  }

  const groups = store.drawAlgorithm.getGroups();
  const drawnTeams = [];
  groups.forEach(group => {
    group.teams.forEach(team => {
      drawnTeams.push(team);
    });
  });

  if (drawnTeams.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先开始抽签</td></tr>';
    return;
  }

  drawnTeams.sort((a, b) => a.drawOrder - b.drawOrder);

  drawnTeams.forEach(team => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${team.drawOrder}</strong></td>
      <td>${escapeHtml(team.teamName)}</td>
      <td>${escapeHtml(team.school)}</td>
      <td class="${team.isSeeded ? 'seeded' : ''}">${team.isSeeded ? '是' : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

export function updateDrawStatus() {
  const labelEl = document.getElementById('draw-status-label');
  const countEl = document.getElementById('draw-status-count');

  if (!store.drawAlgorithm) {
    labelEl.textContent = '--';
    countEl.textContent = '剩余: -- 支';
    return;
  }

  const total = store.teamsData.length;
  const remaining = store.drawAlgorithm.remainingTeams ? store.drawAlgorithm.remainingTeams.length : 0;
  const drawn = total - remaining;

  if (store.drawCompleted) {
    labelEl.textContent = `共 ${total} 支`;
    countEl.textContent = `${total} 支队伍已分配到 ${store.drawAlgorithm.groupCount} 个组`;
  } else if (drawn > 0) {
    labelEl.textContent = `第 ${drawn} / ${total} 号`;
    countEl.textContent = `剩余: ${remaining} 支`;
  } else {
    labelEl.textContent = `共 ${total} 支`;
    countEl.textContent = `剩余: ${total} 支`;
  }
}

function updateStartButton(label) {
  const button = document.getElementById('start-draw-btn');
  if (!button) return;
  button.innerHTML = `<span class="btn-icon">🎰</span>${label}`;
}

function renderSeededTeams(groups) {
  const seededTeams = [];

  groups.forEach(group => {
    const body = document.getElementById(`group-body-${group.index - 1}`);
    if (body) {
      body.innerHTML = '';
      group.teams.forEach(team => {
        team.group = group.index;
        body.appendChild(createTeamItem(team));
        seededTeams.push(team);
      });
    }

    const countEl = document.getElementById(`group-count-${group.index - 1}`);
    if (countEl) countEl.textContent = `${group.teams.length} 支队伍`;
  });

  seededTeams
    .sort((a, b) => a.drawOrder - b.drawOrder)
    .forEach(team => addDrawResultRow(team, team.drawOrder));
}

export function startDrawAnimation() {
  if (store.teamsData.length === 0) {
    showAlertDialog('请先上传队伍数据');
    return;
  }

  if (store.drawCompleted) {
    return;
  }

  if (store.drawAlgorithm) {
    performDraw();
    return;
  }

  // Guard: require draw order to be generated before grouping
  if (store.teamsData[0].drawOrder === 0) {
    showAlertDialog('请先在"抽签顺序"页面生成抽签顺序');
    return;
  }

  const groupCount = parseInt(document.getElementById('group-count').value) || DEFAULT_GROUP_COUNT;

  store.drawAlgorithm = new DrawAlgorithm(store.teamsData, groupCount);
  store.drawAlgorithm.allocateSeededTeams();

  initGroupsDisplay();
  store.drawCount = 0;

  const tbody = document.querySelector('#draw-result-table tbody');
  tbody.innerHTML = '';

  document.getElementById('reset-draw-btn').disabled = false;
  document.getElementById('final-export-btn').disabled = true;
  document.getElementById('export-btn').disabled = true;

  renderSeededTeams(store.drawAlgorithm.getGroups());
  updateDrawStatus();

  if (store.drawAlgorithm.remainingTeams.length === 0) {
    finishDraw();
    return;
  }

  updateStartButton('继续抽签');
}

export function createTeamItem(team) {
  const item = document.createElement('div');
  item.className = 'team-item' + (team.isSeeded ? ' seeded' : '');
  item.innerHTML = `
    <div class="team-info">
      <span class="team-id">#${escapeHtml(String(team.id))}</span>
      <span class="team-name">${escapeHtml(team.teamName)}</span>
      <div class="school-name">${escapeHtml(team.school)}</div>
    </div>
    ${team.isSeeded ? '<span class="seed-badge">种子</span>' : ''}
  `;
  return item;
}

const FLY_DURATION = 600;

export function performDraw() {
  if (!store.drawAlgorithm || store.drawCompleted) return null;

  const result = store.drawAlgorithm.drawOne();

  if (result) {
    store.drawCount = (store.drawCount || 0) + 1;
    result.team.group = result.groupIndex + 1;

    const slot = document.getElementById('draw-slot');
    slot.classList.add('active');
    slot.innerHTML = `
      <span class="slot-team slot-team-highlight">${escapeHtml(result.team.teamName)}</span>
      <span class="slot-school">${escapeHtml(result.team.school)} → 第 ${result.groupIndex + 1} 组</span>
    `;

    addDrawResultRow(result.team, result.team.drawOrder);
    updateDrawStatus();

    const countEl = document.getElementById(`group-count-${result.groupIndex}`);
    if (countEl) {
      const targetGroup = store.drawAlgorithm.getGroups()[result.groupIndex];
      countEl.textContent = `${targetGroup.teams.length} 支队伍`;
    }

    requestAnimationFrame(() => {
      animateTeamFly(result, slot);
    });

    if (store.drawAlgorithm.remainingTeams.length === 0) {
      finishDraw();
    }

    return result;
  }

  return null;
}

function animateTeamFly(result, sourceSlot) {
  const targetCard = document.getElementById(`group-${result.groupIndex}`);
  const targetBody = document.getElementById(`group-body-${result.groupIndex}`);
  if (!targetCard || !targetBody) return;

  const sourceRect = sourceSlot.getBoundingClientRect();
  const targetRect = targetCard.getBoundingClientRect();

  const flyer = document.createElement('div');
  flyer.className = 'team-flyer';
  flyer.textContent = result.team.teamName;

  Object.assign(flyer.style, {
    position: 'fixed',
    left: (sourceRect.left + sourceRect.width / 2) + 'px',
    top: (sourceRect.top + sourceRect.height / 2) + 'px',
    transform: 'translate(-50%, -50%) scale(1)',
    opacity: '1',
  });

  document.body.appendChild(flyer);
  flyer.offsetHeight;

  targetCard.classList.add('fly-target');

  Object.assign(flyer.style, {
    left: (targetRect.left + targetRect.width / 2) + 'px',
    top: (targetRect.top + targetRect.height / 2) + 'px',
    transform: 'translate(-50%, -50%) scale(0.5)',
    opacity: '1',
    transition: `all ${FLY_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
  });

  setTimeout(() => {
    flyer.remove();
    targetCard.classList.remove('fly-target');
    const item = createTeamItem(result.team);
    item.style.animation = 'teamAppear 0.35s ease';
    targetBody.appendChild(item);
  }, FLY_DURATION);
}

export function finishDraw() {
  store.drawCompleted = true;

  if (store.currentProject && store.projectsData[store.currentProject]) {
    store.projectsData[store.currentProject].drawCompleted = true;
  }

  const slot = document.getElementById('draw-slot');
  slot.classList.remove('active');
  slot.innerHTML = '<span class="slot-team">✓ 抽签完成！</span>';

  updateStartButton('开始抽签');
  document.getElementById('start-draw-btn').disabled = true;
  document.getElementById('final-export-btn').disabled = false;
  document.getElementById('export-btn').disabled = false;

  updateDrawStatus();

  const validation = store.drawAlgorithm.validate();
  if (!validation.valid) {
    console.warn('分组验证问题:', validation.issues);
  }

  eventBus.emit('renderTeamTable');
  eventBus.emit('renderProjectList');
}

export function resetDraw() {
  showConfirmDialog('确定要重新抽签吗？', () => {
    store.drawCompleted = false;

    if (store.currentProject && store.projectsData[store.currentProject]) {
      store.projectsData[store.currentProject].drawCompleted = false;
    }

    store.teamsData.forEach(team => {
      team.group = 0;
    });

    const groupCount = parseInt(document.getElementById('group-count').value) || DEFAULT_GROUP_COUNT;
    store.drawAlgorithm = new DrawAlgorithm(store.teamsData, groupCount);

    initGroupsDisplay();

    const tbody = document.querySelector('#draw-result-table tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先开始抽签</td></tr>';

    eventBus.emit('renderTeamTable');
    eventBus.emit('renderProjectList');

    store.drawCount = 0;
    const slot = document.getElementById('draw-slot');
    slot.classList.remove('active');
    slot.innerHTML = '<span class="slot-text">点击"开始抽签"进行分组</span>';
    updateDrawStatus();

    updateStartButton('开始抽签');
    document.getElementById('start-draw-btn').disabled = false;
    document.getElementById('reset-draw-btn').disabled = true;
    document.getElementById('final-export-btn').disabled = true;
    document.getElementById('export-btn').disabled = true;
  });
}
