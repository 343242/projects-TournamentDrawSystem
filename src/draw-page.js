// 分组抽签页面逻辑

import { store, DEFAULT_GROUP_COUNT } from './store.js';
import { showAlertDialog, showConfirmDialog } from './dialog.js';
import { escapeHtml } from './utils.js';
import { eventBus } from './events.js';
import { flyElement, flashRandomNames } from './animation.js';
import { createAnimationState, cancelActiveAnimations, pauseAnimState, stopAnimState } from './animation-helpers.js';
import { saveSessionDebounced } from './session-persistence.js';
import DrawAlgorithm from '../draw-algorithm.js';

const getGroupLabel = (i) => String.fromCharCode(65 + i);

const IDLE_SLOT_HTML = '<span class="slot-text">等待抽签</span>';
const COMPLETE_SLOT_HTML = '<span class="slot-team">✓ 抽签完成！</span>';

// Sync group assignment from algorithm's cloned team back to store.teamsData for UI rendering
function syncGroupToStore(team) {
  const original = store.teamsData.find(t =>
    t.teamName === team.teamName &&
    t.school === team.school &&
    t.drawOrder === team.drawOrder
  );
  if (original) original.group = team.group;
}

// Measure fixed team-item width from rendered text of all team names and schools
function measureTeamItemWidth() {
  if (store.teamsData.length === 0) return 100;

  const measurer = document.createElement('div');
  measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-family:"Microsoft YaHei","PingFang SC",sans-serif;padding:0;';
  document.body.appendChild(measurer);

  let maxContentWidth = 0;

  store.teamsData.forEach(team => {
    // Measure team-name (font-weight: 500, font-size: 0.75rem)
    measurer.style.fontSize = '0.75rem';
    measurer.style.fontWeight = '500';
    measurer.textContent = team.teamName;
    maxContentWidth = Math.max(maxContentWidth, measurer.offsetWidth);

    // Measure school-name (font-size: 0.6rem)
    measurer.style.fontSize = '0.6rem';
    measurer.style.fontWeight = '400';
    measurer.textContent = team.school;
    maxContentWidth = Math.max(maxContentWidth, measurer.offsetWidth);
  });

  document.body.removeChild(measurer);

  // Add padding (5px * 2 = 10px) + seed-badge space (26px if any seeded)
  const hasSeeded = store.teamsData.some(t => t.isSeeded);
  return maxContentWidth + 10 + (hasSeeded ? 26 : 0);
}

// Calculate per-group team capacity (matches DrawAlgorithm distribution)
function calcGroupCapacities(totalTeams, groupCount) {
  if (totalTeams === 0 || groupCount === 0) return [];
  const baseCount = Math.floor(totalTeams / groupCount);
  const remainder = totalTeams % groupCount;
  return Array.from({ length: groupCount }, (_, i) =>
    baseCount + (i < remainder ? 1 : 0)
  );
}

// Replace first empty placeholder slot with actual team item
function insertTeamItem(body, item) {
  const slot = body.querySelector('.team-slot-empty');
  if (slot) {
    slot.replaceWith(item);
  } else {
    body.appendChild(item);
  }
}

// 抽签动画状态（类似 order-page 的 drawOrderState，存储在 store 中）
let drawGeneration = 0;

export function initGroupsDisplay() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  const project = store.projectsData[store.currentProject];
  const groupCount = project?.groupCount || DEFAULT_GROUP_COUNT;
  const totalTeams = store.teamsData.length;
  const capacities = calcGroupCapacities(totalTeams, groupCount);

  // Measure and set fixed team-item width as CSS variable
  if (totalTeams > 0) {
    const itemWidth = measureTeamItemWidth();
    container.style.setProperty('--team-item-width', itemWidth + 'px');
  }

  for (let i = 0; i < groupCount; i++) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.id = `group-${i}`;
    const label = getGroupLabel(i);
    const capacity = capacities[i] || 0;
    card.innerHTML = `
      <div class="group-header"><span class="group-letter">${label}</span><span class="group-count" id="group-count-${i}">0 支队伍</span></div>
      <div class="group-body" id="group-body-${i}"></div>
    `;
    container.appendChild(card);

    // Pre-create placeholder slots matching expected team capacity
    const body = card.querySelector('.group-body');
    for (let j = 0; j < capacity; j++) {
      const slot = document.createElement('div');
      slot.className = 'team-slot-empty';
      body.appendChild(slot);
    }
  }
}

export function addDrawResultRow(team, orderNum) {
  const row = document.getElementById(`draw-row-${orderNum}`);
  if (row) {
    const groupCell = row.cells[3];
    groupCell.textContent = team.group ? getGroupLabel(team.group - 1) : '-';
  }

  const tbody = document.querySelector('#draw-result-table tbody');
  const container = tbody.closest('.table-container');
  if (container) {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }
}

export function renderDrawResultTable() {
  const tbody = document.querySelector('#draw-result-table tbody');
  tbody.innerHTML = '';

  const orderedTeams = store.teamsData
    .filter(team => team.drawOrder > 0)
    .sort((a, b) => a.drawOrder - b.drawOrder);

  if (orderedTeams.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先开始抽签</td></tr>';
    return;
  }

  orderedTeams.forEach(team => {
    const tr = document.createElement('tr');
    tr.id = `draw-row-${team.drawOrder}`;
    tr.innerHTML = `
      <td><strong>${team.drawOrder}</strong></td>
      <td>${escapeHtml(team.teamName)}</td>
      <td class="${team.isSeeded ? 'seeded' : ''}">${team.isSeeded ? '是' : '-'}</td>
      <td>${team.group ? getGroupLabel(team.group - 1) : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

export function updateDrawStatus() {
  const labelEl = document.getElementById('draw-status-label');
  if (!labelEl) return;

  if (!store.drawAlgorithm) {
    labelEl.textContent = '--';
    return;
  }

  const total = store.teamsData.length;
  const remaining = store.drawAlgorithm.remainingTeams ? store.drawAlgorithm.remainingTeams.length : 0;
  const drawn = total - remaining;

  if (store.drawCompleted) {
    labelEl.textContent = `共 ${total} 支 · ${store.drawAlgorithm.groupCount} 组`;
  } else if (drawn > 0) {
    labelEl.textContent = `第 ${drawn} / ${total} 号 · 剩余 ${remaining} 支`;
  } else {
    labelEl.textContent = `共 ${total} 支`;
  }
}

function renderSeededTeams(groups) {
  const seededTeams = [];

  groups.forEach(group => {
    const body = document.getElementById(`group-body-${group.index - 1}`);
    if (body) {
      group.teams.forEach(team => {
        team.group = group.index;
        syncGroupToStore(team);
        insertTeamItem(body, createTeamItem(team));
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

  if (store.drawCompleted) return;

  // Guard: require draw order to be generated before grouping
  if (!store.projectsData[store.currentProject] || !store.projectsData[store.currentProject].drawOrderGenerated) {
    showAlertDialog('请先在"抽签顺序"页面生成抽签顺序');
    return;
  }

  const btn = document.getElementById('start-draw-btn');

  // 暂停（正在运行时点击）
  if (store.drawAnimationState && !store.drawAnimationState.isPaused && !store.drawAnimationState.isComplete) {
    if (pauseAnimState(store.drawAnimationState)) {
      const slot = document.getElementById('draw-slot');
      slot.classList.remove('active');
      slot.innerHTML = IDLE_SLOT_HTML;
      btn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
      btn.className = 'btn btn-primary btn-large';
      updateDrawStatus();
    }
    return;
  }

  // 继续（暂停后点击）
  if (store.drawAnimationState && store.drawAnimationState.isPaused) {
    store.drawAnimationState.isPaused = false;
    store.drawAnimationState.pendingPause = false;
    btn.innerHTML = '<span class="btn-icon">⏸️</span>暂停抽签';
    btn.className = 'btn btn-warning btn-large';
    drawNextTeam();
    return;
  }

  // 全新开始 or 恢复中断的抽签
  const project = store.projectsData[store.currentProject];
  const isResuming = store.drawAlgorithm && store.drawAlgorithm.drawnTeams.length > 0;

  if (!isResuming) {
    const groupCount = project?.groupCount || DEFAULT_GROUP_COUNT;
    store.drawAlgorithm = new DrawAlgorithm(store.teamsData, groupCount);
    store.drawAlgorithm.allocateSeededTeams();
    store.drawCount = 0;
  }

  initGroupsDisplay();

  if (isResuming) {
    restoreDrawDisplay();
    store.drawCount = store.drawAlgorithm.drawnTeams.length;
  }

  store.drawAnimationState = createAnimationState({ generation: ++drawGeneration });

  document.getElementById('reset-draw-btn').disabled = false;
  document.getElementById('final-export-btn').disabled = true;
  document.getElementById('export-btn').disabled = true;

  btn.innerHTML = '<span class="btn-icon">⏸️</span>暂停抽签';
  btn.className = 'btn btn-warning btn-large';

  renderDrawResultTable();

  if (!isResuming) {
    renderSeededTeams(store.drawAlgorithm.getGroups());
    saveSessionDebounced(store);
  }

  drawNextTeam();
}

export function createTeamItem(team) {
  const item = document.createElement('div');
  item.className = 'team-item' + (team.isSeeded ? ' seeded' : '');
  item.innerHTML = `
    <div class="team-info">
      <span class="team-name">${escapeHtml(team.teamName)}</span>
      <span class="school-name">${escapeHtml(team.school)}</span>
    </div>
    ${team.isSeeded ? '<span class="seed-badge">种子</span>' : ''}
  `;
  return item;
}

function drawNextTeam() {
  if (!store.drawAlgorithm || store.drawAlgorithm.remainingTeams.length === 0) {
    renderDrawResultTable();
    updateDrawStatus();
    finishDraw();
    return;
  }

  if (!store.drawAnimationState || store.drawAnimationState.isPaused) return;

  const gen = store.drawAnimationState.generation;

  const slot = document.getElementById('draw-slot');
  slot.classList.add('active');

  store.drawAnimationState.phase = 'flashing';

  // Phase 1: 闪烁随机队名
  store.drawAnimationState.flashControl = flashRandomNames({
    displayEl: slot,
    teams: (store.drawAlgorithm && store.drawAlgorithm.remainingTeams.length > 0) ? store.drawAlgorithm.remainingTeams : store.teamsData,
    renderFn: (t) => `<span class="slot-team">${escapeHtml(t.teamName)}</span>`,
    interval: 60,
    duration: 600,
    guardFn: () => store.drawAnimationState && !store.drawAnimationState.isPaused && store.drawAnimationState.generation === gen,
    onSelect: () => {
      if (!store.drawAnimationState || store.drawAnimationState.isPaused || store.drawAnimationState.generation !== gen) return;

      // 在闪烁结束后才从算法中抽取队伍，避免暂停时丢失数据
      const result = store.drawAlgorithm.drawOne();
      if (!result) {
        renderDrawResultTable();
        updateDrawStatus();
        finishDraw();
        return;
      }

      store.drawCount++;
      result.team.group = result.groupIndex + 1;
      syncGroupToStore(result.team);
      saveSessionDebounced(store);

      store.drawAnimationState.phase = 'selected';

      // Phase 2: 显示选中的队伍和分组（独立 span，无箭头/br）
      slot.innerHTML = `<span class="slot-team slot-team-highlight">${escapeHtml(result.team.teamName)}</span><span class="slot-group">${getGroupLabel(result.groupIndex)}组</span>`;

      // Phase 3: 飞行动画到分组卡片
      requestAnimationFrame(() => {
        if (!store.drawAnimationState || store.drawAnimationState.generation !== gen) return;

        const targetCard = document.getElementById(`group-${result.groupIndex}`);
        const targetBody = document.getElementById(`group-body-${result.groupIndex}`);

        if (!targetCard || !targetBody) {
          store.drawAnimationState.nextTimer = setTimeout(drawNextTeam, 200);
          return;
        }

        store.drawAnimationState.flyControl = flyElement({
          source: slot,
          target: targetCard,
          text: result.team.teamName,
          highlightTarget: targetCard,
          guardFn: () => store.drawAnimationState && store.drawAnimationState.generation === gen,
          onLand: () => {
            if (!store.drawAnimationState || store.drawAnimationState.generation !== gen) return;

            const item = createTeamItem(result.team);
            insertTeamItem(targetBody, item);

            const countEl = document.getElementById(`group-count-${result.groupIndex}`);
            if (countEl) {
              const targetGroup = store.drawAlgorithm.getGroups()[result.groupIndex];
              countEl.textContent = `${targetGroup.teams.length} 支队伍`;
            }

            addDrawResultRow(result.team, result.team.drawOrder);
            updateDrawStatus();

            store.drawAnimationState.phase = 'idle';

            if (store.drawAnimationState.pendingPause) {
              store.drawAnimationState.pendingPause = false;
              store.drawAnimationState.isPaused = true;
              slot.classList.remove('active');
              slot.innerHTML = IDLE_SLOT_HTML;
              const pauseBtn = document.getElementById('start-draw-btn');
              pauseBtn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
              pauseBtn.className = 'btn btn-primary btn-large';
              return;
            }

            store.drawAnimationState.nextTimer = setTimeout(drawNextTeam, 200);
          }
        });
      });
    }
  });
}

export function finishDraw() {
  store.drawCompleted = true;

  if (store.currentProject && store.projectsData[store.currentProject]) {
    store.projectsData[store.currentProject].drawCompleted = true;
  }

  if (store.drawAnimationState) {
    store.drawAnimationState.isComplete = true;
    store.drawAnimationState.phase = 'idle';
  }

  const slot = document.getElementById('draw-slot');
  slot.classList.remove('active');
  slot.innerHTML = COMPLETE_SLOT_HTML;

  const btn = document.getElementById('start-draw-btn');
  btn.innerHTML = '<span class="btn-icon">✅</span>抽签完成';
  btn.className = 'btn btn-success btn-large';
  btn.disabled = true;

  document.getElementById('reset-draw-btn').disabled = false;
  document.getElementById('final-export-btn').disabled = false;
  document.getElementById('export-btn').disabled = false;

  updateDrawStatus();

  const validation = store.drawAlgorithm.validate();
  if (!validation.valid) {
    console.warn('分组验证问题:', validation.issues);
  }

  eventBus.emit('renderTeamTable');
  eventBus.emit('renderProjectList');
  saveSessionDebounced(store);
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

    store.drawAlgorithm = null;
    store.drawAnimationState = null;

    initGroupsDisplay();
    renderDrawResultTable();

    eventBus.emit('renderTeamTable');
    eventBus.emit('renderProjectList');

    store.drawCount = 0;
    const slot = document.getElementById('draw-slot');
    slot.classList.remove('active');
    slot.innerHTML = IDLE_SLOT_HTML;
    updateDrawStatus();

    const btn = document.getElementById('start-draw-btn');
    btn.innerHTML = '<span class="btn-icon">🎰</span>开始抽签';
    btn.className = 'btn btn-success btn-large';
    btn.disabled = false;

    document.getElementById('reset-draw-btn').disabled = true;
    document.getElementById('final-export-btn').disabled = true;
    document.getElementById('export-btn').disabled = true;
    saveSessionDebounced(store);
  });
}

export function pauseDrawAnimation() {
  if (!store.drawAnimationState) return;
  if (pauseAnimState(store.drawAnimationState)) {
    const slot = document.getElementById('draw-slot');
    slot.classList.remove('active');
    slot.innerHTML = IDLE_SLOT_HTML;
    const btn = document.getElementById('start-draw-btn');
    btn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
    btn.className = 'btn btn-primary btn-large';
  }
}

export function stopDrawAnimation() {
  stopAnimState(store.drawAnimationState);
  store.drawAnimationState = null;
}

export function restoreDrawDisplay() {
  if (!store.drawAlgorithm) return;
  const groups = store.drawAlgorithm.getGroups();
  groups.forEach(group => {
    const body = document.getElementById(`group-body-${group.index - 1}`);
    if (body) {
      group.teams.forEach(team => {
        insertTeamItem(body, createTeamItem(team));
      });
      const countEl = document.getElementById(`group-count-${group.index - 1}`);
      if (countEl) countEl.textContent = `${group.teams.length} 支队伍`;
    }
  });
}

function restoreDrawUI() {
  const btn = document.getElementById('start-draw-btn');
  const slot = document.getElementById('draw-slot');

  if (store.drawCompleted) {
    btn.innerHTML = '<span class="btn-icon">✅</span>抽签完成';
    btn.className = 'btn btn-success btn-large';
    btn.disabled = true;
    document.getElementById('reset-draw-btn').disabled = false;
    document.getElementById('final-export-btn').disabled = false;
    slot.classList.remove('active');
    slot.innerHTML = COMPLETE_SLOT_HTML;
  } else if (store.drawAnimationState && store.drawAnimationState.isPaused) {
    btn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
    btn.className = 'btn btn-primary btn-large';
    btn.disabled = false;
    document.getElementById('reset-draw-btn').disabled = false;
    document.getElementById('final-export-btn').disabled = true;
    slot.classList.remove('active');
    slot.innerHTML = IDLE_SLOT_HTML;
  } else if (store.drawAlgorithm && store.drawAlgorithm.drawnTeams.length > 0) {
    btn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
    btn.className = 'btn btn-primary btn-large';
    btn.disabled = false;
    document.getElementById('reset-draw-btn').disabled = false;
    document.getElementById('final-export-btn').disabled = true;
    slot.classList.remove('active');
    slot.innerHTML = IDLE_SLOT_HTML;
  } else {
    btn.innerHTML = '<span class="btn-icon">🎰</span>开始抽签';
    btn.className = 'btn btn-success btn-large';
    btn.disabled = store.teamsData.length === 0;
    document.getElementById('reset-draw-btn').disabled = true;
    document.getElementById('final-export-btn').disabled = true;
    slot.classList.remove('active');
    slot.innerHTML = IDLE_SLOT_HTML;
  }
}

export function initDrawPage() {
  if (store.drawAlgorithm) {
    initGroupsDisplay();
    restoreDrawDisplay();
  } else if (store.currentProject && store.projectsData[store.currentProject]?.groupCount > 0 && store.teamsData.length > 0) {
    initGroupsDisplay();
  }
  renderDrawResultTable();
  updateDrawStatus();
  restoreDrawUI();
}
