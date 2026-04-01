// 文件操作逻辑

import { store, DEFAULT_GROUP_COUNT } from './store.js';
import { showAlertDialog } from './dialog.js';
import { renderProjectList } from './settings-page.js';
import { updateNavigationState } from './navigation.js';
import { eventBus } from './events.js';

export async function selectFile() {
  const result = await window.electronAPI.importExcel();

  if (result.success && !result.canceled) {
    store.currentFilePath = result.fileName;
    document.getElementById('selected-file').textContent = `已选择: ${result.fileName}`;

    processImportedData(result.data);
  } else if (!result.canceled && result.error) {
    showAlertDialog('读取文件失败: ' + result.error);
  }
}

function processImportedData(data) {
  store.sheetNames = [];
  store.projectsData = {};

  data.sheetNames.forEach(sheetName => {
    const sheetData = data.sheets[sheetName];
    const projectInfo = parseSheetData(sheetData);

    if (projectInfo) {
      const projectName = projectInfo.projectName || sheetName;
      store.sheetNames.push(projectName);
      store.projectsData[projectName] = {
        teams: projectInfo.teams,
        groupCount: projectInfo.groupCount || (projectInfo.teams.length > 0 ? DEFAULT_GROUP_COUNT : 0),
        drawOrderGenerated: false,
        drawCompleted: false
      };
    }
  });

  if (store.sheetNames.length > 0) {
    eventBus.emit('selectProject', store.sheetNames[0]);
  }

  renderProjectList();
  updateNavigationState();
}

export function parseSheetData(data) {
  if (!data || data.length === 0) return null;

  let groupCount = 0;
  if (data[0] && data[0].length > 4) {
    const eValue = parseInt(data[0][4]);
    if (eValue > 0 && eValue <= 20) {
      groupCount = eValue;
    }
  }

  let headerRowIndex = -1;
  let projectName = '';

  for (let i = 0; i < Math.min(5, data.length); i++) {
    if (data[i] && data[i][0] === '序号') {
      headerRowIndex = i;
      for (let j = 0; j < data[i].length; j++) {
        const cell = data[i][j];
        if (cell && typeof cell === 'string' && cell !== '序号' && cell !== '学校' &&
            cell !== '参赛队伍' && cell !== '种子队' && cell !== '队伍名称') {
          if (cell.includes('棋') || cell.includes('赛') || cell.includes('项目')) {
            projectName = cell;
            break;
          }
        }
      }
      break;
    }
  }

  if (!projectName && data[0] && data[0].length > 0) {
    const firstCell = data[0][0];
    if (firstCell && typeof firstCell === 'string' && firstCell !== '序号') {
      projectName = firstCell;
    }
  }

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

export async function exportResult() {
  const projects = [];

  store.sheetNames.forEach(projectName => {
    const project = store.projectsData[projectName];
    if (!project || !project.drawCompleted) {
      return;
    }

    const teams = [...project.teams].sort((a, b) => {
      if (a.group !== b.group) {
        return a.group - b.group;
      }
      return a.drawOrder - b.drawOrder;
    });

    const data = [
      [projectName],
      ['分组号', '队伍代号', '参赛队伍', '学校', '种子队']
    ];

    teams.forEach(team => {
      data.push([
        String(team.group),
        team.id,
        team.teamName,
        team.school,
        team.isSeeded ? '是' : ''
      ]);
    });

    projects.push({ name: projectName, data });
  });

  if (projects.length === 0) {
    showAlertDialog('请先完成至少一个项目的抽签');
    return;
  }

  const result = await window.electronAPI.exportExcel({ projects });

  if (result.success) {
    showAlertDialog('导出成功！');
  } else if (!result.canceled) {
    showAlertDialog('导出失败: ' + result.error);
  }
}
