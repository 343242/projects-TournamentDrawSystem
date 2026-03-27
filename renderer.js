// 渲染进程脚本 - 大赛抽签系统

// ========== 全局变量 ==========
let teamsData = [];
let drawAlgorithm = null;
let autoDrawInterval = null;
let isAutoDrawing = false;
let currentFilePath = null;
let drawCompleted = false;

// 多项目支持
let projectsData = {};  // { sheetName: { teams: [], groupCount: 9, drawOrderGenerated: false, drawCompleted: false } }
let currentProject = null;
let sheetNames = [];

// 防抖保护
let isGeneratingOrder = false;
let isAutoDrawingNow = false;

// ========== 启动页面 ==========
function startDrawSystem() {
  const welcomePage = document.getElementById('welcome-page');
  const mainApp = document.getElementById('main-app');

  welcomePage.classList.add('fade-out');

  setTimeout(() => {
    welcomePage.style.display = 'none';
    mainApp.classList.remove('hidden');
  }, 500);
}

async function changeBackground() {
  const result = await window.electronAPI.openImageDialog();

  if (!result.canceled && result.filePaths.length > 0) {
    const imagePath = result.filePaths[0];
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${imagePath}')`;

    // 保存背景设置到本地存储
    localStorage.setItem('customBackground', imagePath);
  }
}

function loadCustomBackground() {
  const customBackground = localStorage.getItem('customBackground');
  if (customBackground) {
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${customBackground}')`;
  }
}

// ========== 导航状态控制 ==========
function updatePageHeaders() {
  const name = currentProject || '未选择项目';
  const prefix = `2025大学生计算机大赛项目分组(${name})`;
  const headerSettings = document.getElementById('header-settings');
  const headerOrder = document.getElementById('header-order');
  const headerDraw = document.getElementById('header-draw');
  if (headerSettings) headerSettings.textContent = `${prefix}-抽签设置`;
  if (headerOrder) headerOrder.textContent = `${prefix}-抽签顺序`;
  if (headerDraw) headerDraw.textContent = `${prefix}-分组抽签`;
}
function updateNavigationState() {
  const navOrder = document.getElementById('nav-order');
  const navDraw = document.getElementById('nav-draw');

  // 初始状态：只有抽签设置可点击
  const hasData = sheetNames.length > 0;
  const hasDrawOrder = hasData && currentProject && projectsData[currentProject]?.drawOrderGenerated;
  const hasCompletedDraw = hasData && currentProject && projectsData[currentProject]?.drawCompleted;

  // 抽签顺序导航：有数据时可点击
  if (navOrder) {
    if (hasData) {
      navOrder.classList.remove('disabled');
      navOrder.disabled = false;
    } else {
      navOrder.classList.add('disabled');
      navOrder.disabled = true;
    }
  }

  // 分组抽签导航：生成抽签顺序后可点击
  if (navDraw) {
    if (hasDrawOrder) {
      navDraw.classList.remove('disabled');
      navDraw.disabled = false;
    } else {
      navDraw.classList.add('disabled');
      navDraw.disabled = true;
    }
  }
}

// ========== 页面导航 ==========
function switchPage(pageId) {
  // 检查导航是否被禁用
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem && navItem.classList.contains('disabled')) {
    return;
  }

  // 更新导航状态
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });

  // 切换页面
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(`page-${pageId}`).classList.add('active');

  // 页面特定初始化
  if (pageId === 'draw' && drawAlgorithm) {
    initGroupsDisplay();
  }
}

function goToNext(pageId) {
  switchPage(pageId);
}

function goToPrev(pageId) {
  switchPage(pageId);
}

// ========== 自定义确认弹窗 ==========
function showConfirmDialog(message, onConfirm) {
  const dialog = document.getElementById('confirm-dialog');
  const msgEl = document.getElementById('dialog-message');
  const confirmBtn = document.getElementById('dialog-confirm');
  const cancelBtn = document.getElementById('dialog-cancel');

  msgEl.textContent = message;
  dialog.classList.remove('hidden');
  cancelBtn.style.display = 'inline-flex';

  const closeDialog = () => {
    dialog.classList.add('hidden');
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', closeDialog);
  };

  const handleConfirm = () => {
    closeDialog();
    if (onConfirm) onConfirm();
  };

  confirmBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', closeDialog);
}

// 统一风格的提示弹窗（只有确定按钮）
function showAlertDialog(message) {
  const dialog = document.getElementById('confirm-dialog');
  const msgEl = document.getElementById('dialog-message');
  const confirmBtn = document.getElementById('dialog-confirm');
  const cancelBtn = document.getElementById('dialog-cancel');

  msgEl.textContent = message;
  dialog.classList.remove('hidden');
  cancelBtn.style.display = 'none';

  const closeDialog = () => {
    dialog.classList.add('hidden');
    confirmBtn.removeEventListener('click', closeDialog);
    cancelBtn.style.display = 'inline-flex';
  };

  confirmBtn.addEventListener('click', closeDialog);
}

function exitApp() {
  showConfirmDialog('确定要退出系统吗？', () => {
    window.close();
  });
}

// ========== 文件操作 ==========
async function selectFile() {
  const result = await window.electronAPI.openFileDialog();

  if (!result.canceled && result.filePaths.length > 0) {
    currentFilePath = result.filePaths[0];
    const fileName = currentFilePath.split(/[\\/]/).pop();
    document.getElementById('selected-file').textContent = `已选择: ${fileName}`;

    // 自动加载文件
    await loadFile();
  }
}

async function loadFile() {
  if (!currentFilePath) return;

  const result = await window.electronAPI.readExcelSheets(currentFilePath);

  if (result.success) {
    sheetNames = [];
    projectsData = {};

    // 解析每个Sheet的数据
    result.data.sheetNames.forEach(sheetName => {
      const sheetData = result.data.sheets[sheetName];
      const projectInfo = parseSheetData(sheetData);

      if (projectInfo) {
        // 使用从表头提取的项目名称作为key
        const projectName = projectInfo.projectName || sheetName;
        sheetNames.push(projectName);
        projectsData[projectName] = {
          teams: projectInfo.teams,
          groupCount: projectInfo.groupCount || (projectInfo.teams.length > 0 ? 9 : 0),
          drawOrderGenerated: false,
          drawCompleted: false
        };
      }
    });

    // 默认选中第一个项目
    if (sheetNames.length > 0) {
      selectProject(sheetNames[0]);
    }

    renderProjectList();
    updateNavigationState();
  } else {
    showAlertDialog('读取文件失败: ' + result.error);
  }
}

function parseSheetData(data) {
  if (!data || data.length === 0) return null;

  // 读取E列(索引4)第一行的分组数量
  let groupCount = 0;
  if (data[0] && data[0].length > 4) {
    const eValue = parseInt(data[0][4]);
    if (eValue > 0 && eValue <= 20) {
      groupCount = eValue;
    }
  }

  // 查找表头行（包含"序号"的行）
  let headerRowIndex = -1;
  let projectName = '';

  for (let i = 0; i < Math.min(5, data.length); i++) {
    if (data[i] && data[i][0] === '序号') {
      headerRowIndex = i;
      // 从表头行提取项目名称（通常在最后一列或其他位置）
      // 假设项目名称在第一行的某个位置，或者在表头行的扩展列
      for (let j = 0; j < data[i].length; j++) {
        const cell = data[i][j];
        if (cell && typeof cell === 'string' && cell !== '序号' && cell !== '学校' &&
            cell !== '参赛队伍' && cell !== '种子队' && cell !== '队伍名称') {
          // 可能是项目名称
          if (cell.includes('棋') || cell.includes('赛') || cell.includes('项目')) {
            projectName = cell;
            break;
          }
        }
      }
      break;
    }
  }

  // 如果没找到项目名称，尝试从第一行获取
  if (!projectName && data[0] && data[0].length > 0) {
    const firstCell = data[0][0];
    if (firstCell && typeof firstCell === 'string' && firstCell !== '序号') {
      projectName = firstCell;
    }
  }

  // 尝试从表头行的下一行获取项目名称（有些格式是这样）
  if (!projectName && headerRowIndex >= 0 && headerRowIndex + 1 < data.length) {
    const nextRow = data[headerRowIndex + 1];
    if (nextRow) {
      for (let j = 4; j < nextRow.length; j++) {
        if (nextRow[j] && typeof nextRow[j] === 'string') {
          projectName = nextRow[j];
          break;
        }
      }
    }
  }

  const teams = [];
  const startIndex = headerRowIndex + 1;

  // 解析数据
  for (let i = startIndex; i < data.length; i++) {
    const row = data[i];
    if (row && row[0] !== undefined && row[0] !== null && row[0] !== '') {
      const id = parseInt(row[0]) || 0;
      if (id > 0 || (typeof row[0] === 'number')) {
        teams.push({
          id: id,
          school: String(row[1] || ''),
          teamName: String(row[2] || ''),
          isSeeded: row[3] === '是' || row[3] === true || row[3] === 1 || row[3] === '1',
          drawOrder: 0,
          group: 0
        });
      }
    }
  }

  return { projectName, teams, groupCount };
}

function selectProject(projectName) {
  if (!projectsData[projectName]) return;

  currentProject = projectName;
  const project = projectsData[projectName];
  teamsData = project.teams;

  // 重置 drawAlgorithm 以便重新初始化
  drawAlgorithm = null;
  drawCompleted = project.drawCompleted;

  updateUIForProject();
  renderProjectList();
  updateNavigationState();
  updatePageHeaders();
}

function updateUIForProject() {
  if (!currentProject) return;

  const project = projectsData[currentProject];

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
  if (project.drawCompleted && drawAlgorithm) {
    initGroupsDisplay();
    const groups = drawAlgorithm.getGroups();
    groups.forEach(group => {
      const body = document.getElementById(`group-body-${group.index - 1}`);
      if (body) {
        body.innerHTML = '';
        group.teams.forEach(team => {
          const item = createTeamItem(team);
          body.appendChild(item);
        });
      }
    });
    document.getElementById('start-draw-btn').disabled = true;
    document.getElementById('auto-draw-btn').disabled = true;
    document.getElementById('reset-draw-btn').disabled = false;
    document.getElementById('final-export-btn').disabled = false;
  } else {
    document.getElementById('start-draw-btn').disabled = project.teams.length === 0;
    document.getElementById('auto-draw-btn').disabled = true;
    document.getElementById('reset-draw-btn').disabled = true;
    document.getElementById('final-export-btn').disabled = true;
    document.getElementById('draw-slot').innerHTML = '<span class="slot-text">点击"开始抽签"进行分组</span>';
    document.getElementById('groups-container').innerHTML = '';
  }

  // 导出按钮状态
  document.getElementById('export-btn').disabled = !project.drawCompleted;
}

function renderProjectList() {
  const container = document.getElementById('project-list');
  if (!container) return;

  container.innerHTML = '';

  if (sheetNames.length === 0) {
    container.innerHTML = '<div class="project-card empty">暂无比赛项目</div>';
    return;
  }

  sheetNames.forEach(name => {
    const project = projectsData[name];
    const card = document.createElement('div');
    card.className = 'project-card' + (name === currentProject ? ' active' : '');
    card.innerHTML = `
      <div class="project-header-row">
        <span class="project-name">${name}</span>
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

function renderTeamTable() {
  const tbody = document.querySelector('#team-table tbody');
  tbody.innerHTML = '';

  if (teamsData.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无数据，请上传队伍数据</td></tr>';
    return;
  }

  teamsData.forEach((team, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${team.id}</td>
      <td>${team.teamName}</td>
      <td>${team.school}</td>
      <td class="seed-cell ${team.isSeeded ? 'seeded' : ''}" data-index="${index}">
        ${team.isSeeded ? '是' : '-'}
      </td>
      <td>${team.drawOrder || '-'}</td>
      <td>${team.group || '-'}</td>
    `;
    tbody.appendChild(tr);
  });

}

// ========== 分组设置 ==========
function updateGroupCount() {
  // 检查是否有队伍数据
  if (teamsData.length === 0) {
    showAlertDialog('请先上传队伍数据');
    return;
  }

  const groupCount = parseInt(document.getElementById('group-count').value) || 0;

  if (groupCount < 2 || groupCount > 20) return;
  if (teamsData.length > 0 && groupCount > teamsData.length) return;

  // 更新当前项目的分组数量
  if (currentProject && projectsData[currentProject]) {
    projectsData[currentProject].groupCount = groupCount;
  }

  // 重置算法以便使用新的分组数
  drawAlgorithm = null;
  renderProjectList();
}

function clearData() {
  showConfirmDialog('确定要清除所有数据吗？', () => {
    teamsData = [];
    projectsData = {};
    sheetNames = [];
    currentProject = null;
    currentFilePath = null;
    drawAlgorithm = null;
    drawCompleted = false;
    drawOrderState = null;

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
    document.getElementById('start-draw-btn').disabled = true;
    document.getElementById('auto-draw-btn').disabled = true;
    document.getElementById('reset-draw-btn').disabled = true;
    document.getElementById('final-export-btn').disabled = true;
    document.getElementById('draw-slot').innerHTML = '<span class="slot-text">点击"开始抽签"进行分组</span>';
  });
}

// ========== 抽签顺序 ==========
let drawOrderState = null; // 持久化抽签动画状态，支持暂停/恢复

function generateOrder() {
  if (teamsData.length === 0) {
    showAlertDialog('请先上传队伍数据');
    return;
  }

  const btn = document.getElementById('generate-order-btn');

  // 如果正在抽签中（未暂停），暂停
  if (drawOrderState && !drawOrderState.isPaused && !drawOrderState.isComplete) {
    const state = drawOrderState;

    // 已选中队伍但还未添加到表格 → 设置延迟暂停，让当前队伍完成
    if (state.phase === 'selected') {
      state.pendingPause = true;
      return;
    }

    // 闪烁阶段或空闲阶段 → 立即暂停
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
    return;
  }

  // 如果已暂停，恢复抽签
  if (drawOrderState && drawOrderState.isPaused) {
    drawOrderState.isPaused = false;
    drawOrderState.pendingPause = false;
    btn.innerHTML = '<span class="btn-icon">⏸️</span>暂停抽签';
    btn.className = 'btn btn-warning btn-large';
    drawNextFromState();
    return;
  }

  // 如果已完成，不重复执行
  if (drawOrderState && drawOrderState.isComplete) return;

  if (isGeneratingOrder) return;
  isGeneratingOrder = true;

  // 分离种子队和非种子队
  const seededTeams = teamsData.filter(t => t.isSeeded);
  const nonSeededTeams = teamsData.filter(t => !t.isSeeded);

  // 随机打乱
  shuffleArray(seededTeams);
  shuffleArray(nonSeededTeams);

  // 种子队排在前面，确定抽签顺序
  const drawSequence = [];
  seededTeams.forEach(team => drawSequence.push(team));
  nonSeededTeams.forEach(team => drawSequence.push(team));
  drawSequence.forEach((team, i) => team.drawOrder = i + 1);

  // 更新当前项目状态
  if (currentProject && projectsData[currentProject]) {
    projectsData[currentProject].drawOrderGenerated = true;
  }

  // 清空表格
  const tbody = document.querySelector('#order-table tbody');
  tbody.innerHTML = '';

  const statusLabel = document.getElementById('order-status-label');
  const statusText = document.getElementById('order-status-text');
  const statusCount = document.getElementById('order-status-count');

  // 初始化抽签状态
  drawOrderState = {
    drawSequence,
    seededTeams,
    nonSeededTeams,
    currentIndex: 0,
    flashInterval: null,
    isPaused: false,
    isComplete: false,
    pendingPause: false,
    phase: 'idle',
    statusLabel,
    statusText,
    statusCount,
    tbody
  };

  // 切换按钮为暂停
  btn.innerHTML = '<span class="btn-icon">⏸️</span>暂停抽签';
  btn.className = 'btn btn-warning btn-large';
  btn.disabled = false;

  // 确保下一步禁用
  document.getElementById('next-order-btn').disabled = true;

  drawNextFromState();
}

function drawNextFromState() {
  const state = drawOrderState;
  if (!state || state.isPaused || state.isComplete) return;

  if (state.currentIndex >= state.drawSequence.length) {
    // 全部抽签完成
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
    updateNavigationState();
    renderProjectList();
    isGeneratingOrder = false;
    return;
  }

  const team = state.drawSequence[state.currentIndex];
  const orderNum = state.currentIndex + 1;

  // 更新状态标签显示当前抽签序号
  state.statusLabel.textContent = `第 ${orderNum} 号`;
  state.statusCount.textContent = `剩余: ${state.drawSequence.length - state.currentIndex} 支`;

  // 进入闪烁阶段
  state.phase = 'flashing';

  function flashRandomName() {
    if (state.isPaused) return;
    const randomTeam = teamsData[Math.floor(Math.random() * teamsData.length)];
    state.statusText.textContent = randomTeam.teamName;
    state.statusText.classList.add('flash-rolling');
  }

  state.flashInterval = setInterval(flashRandomName, 60);

  // 闪烁一段时间后停在实际抽中的队伍上
  setTimeout(() => {
    if (state.isPaused) return;
    clearInterval(state.flashInterval);

    // 进入选中阶段
    state.phase = 'selected';

    // 停在实际队伍名称上，高亮显示
    state.statusText.textContent = team.teamName;
    state.statusText.classList.remove('flash-rolling');
    state.statusText.classList.add('flash-selected');

    // 短暂停留后，将队伍滑入表格
    setTimeout(() => {
      state.statusText.classList.remove('flash-selected');
      state.statusText.style.transform = '';
      state.statusText.style.color = '';
      state.statusText.style.textShadow = '';

      // 创建表格行
      const tr = document.createElement('tr');
      tr.classList.add('order-row-enter');
      tr.innerHTML = `
        <td><strong>${orderNum}</strong></td>
        <td>${team.id}</td>
        <td>${team.teamName}</td>
        <td>${team.school}</td>
        <td class="${team.isSeeded ? 'seeded' : ''}">${team.isSeeded ? '是' : '-'}</td>
      `;
      state.tbody.appendChild(tr);

      // 动画结束后移除动画类
      tr.addEventListener('animationend', () => {
        tr.classList.remove('order-row-enter');
      }, { once: true });

      // 平滑滚动到最新行
      const container = state.tbody.closest('.table-container');
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }

      state.currentIndex++;
      state.phase = 'idle';

      // 检查是否有延迟暂停请求
      if (state.pendingPause) {
        state.pendingPause = false;
        state.isPaused = true;
        state.statusText.textContent = '等待开始抽签';
        const btn = document.getElementById('generate-order-btn');
        btn.innerHTML = '<span class="btn-icon">▶️</span>继续抽签';
        btn.className = 'btn btn-primary btn-large';
        return;
      }

      // 间隔后抽下一个
      setTimeout(drawNextFromState, 300);
    }, 500);
  }, 800);
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function renderOrderTable() {
  const tbody = document.querySelector('#order-table tbody');
  tbody.innerHTML = '';

  if (teamsData.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">请先在"抽签设置"页面上传数据</td></tr>';
    return;
  }

  // 按抽签顺序排序
  const sortedTeams = [...teamsData].sort((a, b) => a.drawOrder - b.drawOrder);

  sortedTeams.forEach(team => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${team.drawOrder || '-'}</strong></td>
      <td>${team.id}</td>
      <td>${team.teamName}</td>
      <td>${team.school}</td>
      <td class="${team.isSeeded ? 'seeded' : ''}">${team.isSeeded ? '是' : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ========== 抽签顺序状态更新 ==========
function updateOrderStatus() {
  const project = currentProject ? projectsData[currentProject] : null;
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
  } else {
    labelEl.textContent = `共 ${project.teams.length} 支`;
    textEl.textContent = '等待开始抽签';
    countEl.textContent = `剩余: ${project.teams.length} 支`;
  }
}

// ========== 分组抽签 ==========
function initGroupsDisplay() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  const groupCount = parseInt(document.getElementById('group-count').value) || 9;

  for (let i = 0; i < groupCount; i++) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.id = `group-${i}`;
    card.innerHTML = `
      <div class="group-header">第 ${i + 1} 组</div>
      <div class="group-body" id="group-body-${i}"></div>
    `;
    container.appendChild(card);
  }
}

function startDrawAnimation() {
  if (teamsData.length === 0) {
    showAlertDialog('请先上传队伍数据');
    return;
  }

  const groupCount = parseInt(document.getElementById('group-count').value) || 9;

  // 如果没有抽签顺序，先生成
  if (teamsData[0].drawOrder === 0) {
    generateOrder();
  }

  // 初始化抽签算法
  drawAlgorithm = new DrawAlgorithm(teamsData, groupCount);
  drawAlgorithm.allocateSeededTeams();

  // 初始化分组显示
  initGroupsDisplay();

  // 更新按钮状态
  document.getElementById('start-draw-btn').disabled = true;
  document.getElementById('auto-draw-btn').disabled = false;
  document.getElementById('reset-draw-btn').disabled = false;

  // 显示种子队已分配
  const groups = drawAlgorithm.getGroups();
  groups.forEach(group => {
    const body = document.getElementById(`group-body-${group.index - 1}`);
    if (body) {
      body.innerHTML = '';
      group.teams.forEach(team => {
        team.group = group.index;
        const item = createTeamItem(team);
        body.appendChild(item);
      });
    }
  });
}

function createTeamItem(team) {
  const item = document.createElement('div');
  item.className = 'team-item' + (team.isSeeded ? ' seeded' : '');
  item.innerHTML = `
    <div class="team-info">
      <span class="team-id">#${team.id}</span>
      <span class="team-name">${team.teamName}</span>
      <div class="school-name">${team.school}</div>
    </div>
    ${team.isSeeded ? '<span class="seed-badge">种子</span>' : ''}
  `;
  return item;
}

function performDraw() {
  if (!drawAlgorithm) return null;

  const result = drawAlgorithm.drawOne();

  if (result) {
    // 显示抽中的队伍
    const slot = document.getElementById('draw-slot');
    slot.classList.add('active');
    slot.innerHTML = `
      <span class="slot-team">${result.team.teamName}</span>
      <span class="slot-school">${result.team.school} → 第 ${result.groupIndex + 1} 组</span>
    `;

    setTimeout(() => {
      slot.classList.remove('active');
    }, 300);

    // 添加到对应组
    result.team.group = result.groupIndex + 1;
    const body = document.getElementById(`group-body-${result.groupIndex}`);
    if (body) {
      const item = createTeamItem(result.team);
      item.style.animation = 'fadeIn 0.3s ease';
      body.appendChild(item);
    }

    // 检查是否完成
    if (drawAlgorithm.remainingTeams.length === 0) {
      finishDraw();
    }

    return result;
  }

  return null;
}

function autoDraw() {
  if (!drawAlgorithm) return;

  // 防抖保护
  if (isAutoDrawingNow) return;
  isAutoDrawingNow = true;

  document.getElementById('auto-draw-btn').disabled = true;

  autoDrawInterval = setInterval(() => {
    if (drawAlgorithm.remainingTeams.length === 0) {
      stopAutoDraw();
      finishDraw();
    } else {
      performDraw();
    }
  }, 200);
}

function stopAutoDraw() {
  if (autoDrawInterval) {
    clearInterval(autoDrawInterval);
    autoDrawInterval = null;
  }
  isAutoDrawingNow = false;
}

function finishDraw() {
  stopAutoDraw();
  drawCompleted = true;

  // 更新当前项目状态
  if (currentProject && projectsData[currentProject]) {
    projectsData[currentProject].drawCompleted = true;
  }

  document.getElementById('draw-slot').innerHTML = `
    <span class="slot-team">✓ 抽签完成！</span>
    <span class="slot-school">共 ${teamsData.length} 支队伍已分配到 ${drawAlgorithm.groupCount} 个组</span>
  `;

  document.getElementById('auto-draw-btn').disabled = true;
  document.getElementById('final-export-btn').disabled = false;
  document.getElementById('export-btn').disabled = false;

  // 验证结果
  const validation = drawAlgorithm.validate();
  if (!validation.valid) {
    console.warn('分组验证问题:', validation.issues);
  }

  // 更新主表格
  renderTeamTable();
  renderProjectList();
}

function resetDraw() {
  showConfirmDialog('确定要重新抽签吗？', () => {
    stopAutoDraw();
    drawCompleted = false;

    // 更新当前项目状态
    if (currentProject && projectsData[currentProject]) {
      projectsData[currentProject].drawCompleted = false;
    }

    // 重置分组信息
    teamsData.forEach(team => {
      team.group = 0;
    });

    // 重新初始化
    const groupCount = parseInt(document.getElementById('group-count').value) || 9;
    drawAlgorithm = new DrawAlgorithm(teamsData, groupCount);

    initGroupsDisplay();
    renderTeamTable();
    renderProjectList();

    document.getElementById('start-draw-btn').disabled = false;
    document.getElementById('auto-draw-btn').disabled = true;
    document.getElementById('reset-draw-btn').disabled = true;
    document.getElementById('final-export-btn').disabled = true;
    document.getElementById('export-btn').disabled = true;
    document.getElementById('draw-slot').innerHTML = '<span class="slot-text">点击"开始抽签"进行分组</span>';
  });
}

// ========== 导出功能 ==========
async function exportResult() {
  if (!drawCompleted || !drawAlgorithm) {
    showAlertDialog('请先完成抽签');
    return;
  }

  const result = await window.electronAPI.saveFileDialog();

  if (!result.canceled && result.filePath) {
    // 准备导出数据
    const groups = drawAlgorithm.getGroups();
    const exportData = [['分组号', '队伍代号', '参赛队伍', '学校', '种子队']];

    groups.forEach(group => {
      group.teams.forEach(team => {
        exportData.push([
          group.index,
          team.id,
          team.teamName,
          team.school,
          team.isSeeded ? '是' : ''
        ]);
      });
    });

    const saveResult = await window.electronAPI.saveExcel(result.filePath, exportData);

    if (saveResult.success) {
      showAlertDialog('导出成功！');
      document.getElementById('export-btn').disabled = false;
    } else {
      showAlertDialog('导出失败: ' + saveResult.error);
    }
  }
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  console.log('大赛抽签系统已加载');

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
    if (value >= 2 && value <= 20 && currentProject && projectsData[currentProject]) {
      projectsData[currentProject].groupCount = value;
      drawAlgorithm = null;
      renderProjectList();
    }
  });
});
