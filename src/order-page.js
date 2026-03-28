// 抽签顺序页面逻辑

import { store } from './store.js';
import { showAlertDialog } from './dialog.js';
import { updateNavigationState } from './navigation.js';
import { shuffleArray, escapeHtml } from './utils.js';
import { eventBus } from './events.js';

const FLY_DURATION = 600;

function flyToOrderTable(team, orderNum, statusText, tbody, state, onDone) {
  const sourceRect = statusText.getBoundingClientRect();
  const tableContainer = tbody.closest('.table-container');

  let targetX, targetY;
  const lastRow = tbody.lastElementChild;

  if (lastRow) {
    const lastRowRect = lastRow.getBoundingClientRect();
    targetX = lastRowRect.left + lastRowRect.width / 2;
    targetY = lastRowRect.bottom + lastRowRect.height / 2;
  } else {
    const tbodyRect = tbody.getBoundingClientRect();
    targetX = tbodyRect.left + tbodyRect.width / 2;
    targetY = tbodyRect.top + 30;
  }

  if (tableContainer) {
    const containerRect = tableContainer.getBoundingClientRect();
    targetY = Math.max(containerRect.top + 20, Math.min(targetY, containerRect.bottom - 20));
  }

  const flyer = document.createElement('div');
  flyer.className = 'team-flyer';
  flyer.textContent = team.teamName;

  Object.assign(flyer.style, {
    position: 'fixed',
    left: (sourceRect.left + sourceRect.width / 2) + 'px',
    top: (sourceRect.top + sourceRect.height / 2) + 'px',
    transform: 'translate(-50%, -50%) scale(1)',
    opacity: '1',
  });

  document.body.appendChild(flyer);
  flyer.offsetHeight; // force reflow

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const distance = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);
  const duration = Math.max(300, Math.min(800, distance * 0.8));

  Object.assign(flyer.style, {
    left: targetX + 'px',
    top: targetY + 'px',
    transform: 'translate(-50%, -50%) scale(0.6)',
    opacity: '1',
    transition: `all ${duration}ms cubic-bezier(0.0, 0.0, 0.2, 1)`,
  });

  if (state) state.flyTimer = setTimeout(() => {
    if (!store.drawOrderState) { flyer.remove(); return; }
    flyer.remove();

    const tr = document.createElement('tr');
    tr.style.animation = 'teamAppear 0.35s ease';
    tr.innerHTML = `
      <td><strong>${orderNum}</strong></td>
      <td>${escapeHtml(team.teamName)}</td>
      <td>${escapeHtml(team.school)}</td>
      <td class="${team.isSeeded ? 'seeded' : ''}">${team.isSeeded ? '是' : '-'}</td>
    `;
    tbody.appendChild(tr);

    tr.addEventListener('animationend', () => {
      tr.style.animation = '';
    }, { once: true });

    if (tableContainer) {
      tableContainer.scrollTo({ top: tableContainer.scrollHeight, behavior: 'smooth' });
    }

    if (onDone) onDone();
  }, duration);
}

export function generateOrder() {
  if (store.teamsData.length === 0) {
    showAlertDialog('请先上传队伍数据');
    return;
  }

  const btn = document.getElementById('generate-order-btn');
  const project = store.currentProject ? store.projectsData[store.currentProject] : null;

  if (store.drawOrderState && !store.drawOrderState.isPaused && !store.drawOrderState.isComplete) {
    const state = store.drawOrderState;

    if (state.phase === 'selected') {
      state.pendingPause = true;
      return;
    }

    state.isPaused = true;
    state.phase = 'idle';
    clearInterval(state.flashInterval);
    state.statusText.textContent = '等待开始抽签';
    state.statusText.classList.remove('flash-rolling', 'flash-selected');
    state.statusText.style.transform = '';
    state.statusText.style.color = '';
    state.statusText.style.textShadow = '';
    btn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
    btn.className = 'btn btn-primary btn-large';
    if (project) {
      project.drawOrderProgress = state.currentIndex;
    }
    return;
  }

  if (store.drawOrderState && store.drawOrderState.isPaused) {
    store.drawOrderState.isPaused = false;
    store.drawOrderState.pendingPause = false;
    btn.innerHTML = '<span class="btn-icon">⏸️</span>暂停抽签';
    btn.className = 'btn btn-warning btn-large';
    drawNextFromState();
    return;
  }

  if (store.drawOrderState && store.drawOrderState.isComplete) return;

  // Resume from saved project state (after switching projects)
  if (project && project.drawOrderSequence && !project.drawOrderGenerated) {
    store.isGeneratingOrder = true;

    const drawSequence = project.drawOrderSequence;
    const startIndex = project.drawOrderProgress || 0;
    const seededTeams = drawSequence.filter(t => t.isSeeded);
    const nonSeededTeams = drawSequence.filter(t => !t.isSeeded);
    const tbody = document.querySelector('#order-table tbody');
    const statusLabel = document.getElementById('order-status-label');
    const statusText = document.getElementById('order-status-text');
    const statusCount = document.getElementById('order-status-count');

    store.drawOrderState = {
      drawSequence,
      seededTeams,
      nonSeededTeams,
      currentIndex: startIndex,
      flashInterval: null,
      flashTimer: null,
      flyTimer: null,
      nextTimer: null,
      isPaused: false,
      isComplete: false,
      pendingPause: false,
      phase: 'idle',
      statusLabel,
      statusText,
      statusCount,
      tbody
    };

    btn.innerHTML = '<span class="btn-icon">⏸️</span>暂停抽签';
    btn.className = 'btn btn-warning btn-large';
    btn.disabled = false;
    document.getElementById('next-order-btn').disabled = true;

    drawNextFromState();
    return;
  }

  if (store.isGeneratingOrder) return;
  store.isGeneratingOrder = true;

  const seededTeams = store.teamsData.filter(t => t.isSeeded);
  const nonSeededTeams = store.teamsData.filter(t => !t.isSeeded);

  shuffleArray(seededTeams);
  shuffleArray(nonSeededTeams);

  const drawSequence = [];
  seededTeams.forEach(team => drawSequence.push(team));
  nonSeededTeams.forEach(team => drawSequence.push(team));

  // Save sequence to project for resume support
  if (project) {
    project.drawOrderSequence = drawSequence;
    project.drawOrderProgress = 0;
  }

  const tbody = document.querySelector('#order-table tbody');
  tbody.innerHTML = '';

  const statusLabel = document.getElementById('order-status-label');
  const statusText = document.getElementById('order-status-text');
  const statusCount = document.getElementById('order-status-count');

  store.drawOrderState = {
    drawSequence,
    seededTeams,
    nonSeededTeams,
    currentIndex: 0,
    flashInterval: null,
    flashTimer: null,
    flyTimer: null,
    nextTimer: null,
    isPaused: false,
    isComplete: false,
    pendingPause: false,
    phase: 'idle',
    statusLabel,
    statusText,
    statusCount,
    tbody
  };

  btn.innerHTML = '<span class="btn-icon">⏸️</span>暂停抽签';
  btn.className = 'btn btn-warning btn-large';
  btn.disabled = false;

  document.getElementById('next-order-btn').disabled = true;

  drawNextFromState();
}

export function drawNextFromState() {
  const state = store.drawOrderState;
  if (!state || state.isPaused || state.isComplete) return;

  if (state.currentIndex >= state.drawSequence.length) {
    clearInterval(state.flashInterval);
    state.isComplete = true;
    state.phase = 'idle';
    state.statusLabel.textContent = `共 ${state.drawSequence.length} 支`;
    state.statusText.textContent = '抽签顺序已生成';
    state.statusText.classList.remove('flash-rolling', 'flash-selected');
    state.statusText.style.transform = '';
    state.statusText.style.color = '';
    state.statusText.style.textShadow = '';
    state.statusCount.textContent = `种子队: ${state.seededTeams.length} | 非种子: ${state.nonSeededTeams.length}`;
    document.getElementById('next-order-btn').disabled = false;
    const btn = document.getElementById('generate-order-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">✅</span>抽签完成';
    btn.className = 'btn btn-success btn-large';
    // Mark as generated before updating navigation so the draw page is enabled
    const proj = store.currentProject ? store.projectsData[store.currentProject] : null;
    if (proj) {
      proj.drawOrderGenerated = true;
    }

    updateNavigationState();

    eventBus.emit('renderProjectList');

    store.isGeneratingOrder = false;
    return;
  }

  const team = state.drawSequence[state.currentIndex];
  const orderNum = state.currentIndex + 1;

  state.statusLabel.textContent = `第 ${orderNum} 号`;
  state.statusCount.textContent = `剩余: ${state.drawSequence.length - state.currentIndex} 支`;

  state.phase = 'flashing';

  function flashRandomName() {
    if (state.isPaused) return;
    const randomTeam = store.teamsData[Math.floor(Math.random() * store.teamsData.length)];
    state.statusText.textContent = randomTeam.teamName;
    state.statusText.classList.add('flash-rolling');
  }

  state.flashInterval = setInterval(flashRandomName, 60);

  state.flashTimer = setTimeout(() => {
    if (state.isPaused) return;
    clearInterval(state.flashInterval);

    state.phase = 'selected';

    state.statusText.textContent = team.teamName;
    state.statusText.classList.remove('flash-rolling');
    state.statusText.classList.add('flash-selected');

    flyToOrderTable(team, orderNum, state.statusText, state.tbody, state, () => {
      if (!store.drawOrderState) return;
      state.statusText.classList.remove('flash-selected');
      state.statusText.style.transform = '';
      state.statusText.style.color = '';
      state.statusText.style.textShadow = '';

      // Assign drawOrder now that this team's animation is complete
      team.drawOrder = orderNum;

      state.currentIndex++;
      state.phase = 'idle';

      // Save progress to project
      const proj = store.currentProject ? store.projectsData[store.currentProject] : null;
      if (proj) {
        proj.drawOrderProgress = state.currentIndex;
      }

      if (state.pendingPause) {
        state.pendingPause = false;
        state.isPaused = true;
        state.statusText.textContent = '等待开始抽签';
        const btn = document.getElementById('generate-order-btn');
        btn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
        btn.className = 'btn btn-primary btn-large';
        return;
      }

      state.nextTimer = setTimeout(drawNextFromState, 300);
    });
  }, 800);
}

export function renderOrderTable() {
  const tbody = document.querySelector('#order-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (store.teamsData.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先在"抽签设置"页面上传数据</td></tr>';
    return;
  }

  // Only render teams that have an assigned draw order
  const orderedTeams = store.teamsData
    .filter(team => team.drawOrder > 0)
    .sort((a, b) => a.drawOrder - b.drawOrder);

  if (orderedTeams.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先生成抽签顺序</td></tr>';
    return;
  }

  orderedTeams.forEach(team => {
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

export function pauseOrderDraw() {
  const state = store.drawOrderState;
  if (!state || state.isPaused || state.isComplete) return;

  if (state.phase === 'selected') {
    state.pendingPause = true;
    return;
  }

  state.isPaused = true;
  state.phase = 'idle';
  clearInterval(state.flashInterval);
  state.statusText.textContent = '等待开始抽签';
  state.statusText.classList.remove('flash-rolling', 'flash-selected');
  state.statusText.style.transform = '';
  state.statusText.style.color = '';
  state.statusText.style.textShadow = '';
  const btn = document.getElementById('generate-order-btn');
  btn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
  btn.className = 'btn btn-primary btn-large';

  // Save progress to project
  const project = store.currentProject ? store.projectsData[store.currentProject] : null;
  if (project) {
    project.drawOrderProgress = state.currentIndex;
  }
}

export function stopOrderAnimation() {
  const state = store.drawOrderState;
  if (state) {
    // Save progress to project before clearing
    const project = store.currentProject ? store.projectsData[store.currentProject] : null;
    if (project && !state.isComplete) {
      project.drawOrderProgress = state.currentIndex;
    }

    clearInterval(state.flashInterval);
    clearTimeout(state.flashTimer);
    clearTimeout(state.flyTimer);
    clearTimeout(state.nextTimer);
    state.flashInterval = null;
    state.flashTimer = null;
    state.flyTimer = null;
    state.nextTimer = null;
    state.isPaused = true;
    state.isComplete = true;
    state.phase = 'idle';
  }
  store.drawOrderState = null;
  store.isGeneratingOrder = false;
}

export function updateOrderStatus() {
  const project = store.currentProject ? store.projectsData[store.currentProject] : null;
  const labelEl = document.getElementById('order-status-label');
  const textEl = document.getElementById('order-status-text');
  const countEl = document.getElementById('order-status-count');

  if (!project || project.teams.length === 0) {
    labelEl.textContent = '--';
    textEl.textContent = '等待开始抽签';
    countEl.textContent = '剩余: -- 支';
    return;
  }

  if (project.drawOrderGenerated) {
    const seededCount = project.teams.filter(t => t.isSeeded).length;
    const nonSeededCount = project.teams.length - seededCount;
    labelEl.textContent = `共 ${project.teams.length} 支`;
    textEl.textContent = '抽签顺序已生成';
    countEl.textContent = `种子队: ${seededCount} | 非种子: ${nonSeededCount}`;
  } else if (project.drawOrderSequence) {
    const progress = project.drawOrderProgress || 0;
    const remaining = project.teams.length - progress;
    labelEl.textContent = `共 ${project.teams.length} 支`;
    textEl.textContent = '等待开始抽签';
    countEl.textContent = `剩余: ${remaining} 支`;
  } else {
    labelEl.textContent = `共 ${project.teams.length} 支`;
    textEl.textContent = '等待开始抽签';
    countEl.textContent = `剩余: ${project.teams.length} 支`;
  }
}
