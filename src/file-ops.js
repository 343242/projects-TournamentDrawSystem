// 文件操作逻辑

import { store } from './store.js';
import { showAlertDialog } from './dialog.js';
import { renderProjectList } from './settings-page.js';
import { updateNavigationState } from './navigation.js';

export async function selectFile() {
  const result = await window.electronAPI.importExcel();

  if (result.success && !result.canceled) {
    store.currentFilePath = result.filePath;
    const fileName = store.currentFilePath.split(/[\\/]/).pop();
    document.getElementById('selected-file').textContent = `已选择: ${fileName}`;

    processImportedData(result.data);
  } else if (!result.canceled && result.error) {
    showAlertDialog('读取文件失败: ' + result.error);
  }
}

function processImportedData(data) {
  store.sheetNames = [];
  store.projectsData = {};

  // 解析每个Sheet的数据
  data.sheetNames.forEach(sheetName => {
    const sheetData = data.sheets[sheetName];
    const projectInfo = parseSheetData(sheetData);

    if (projectInfo) {
      // 使用从表头提取的项目名称作为key
      const projectName = projectInfo.projectName || sheetName;
      store.sheetNames.push(projectName);
      store.projectsData[projectName] = {
        teams: projectInfo.teams,
        groupCount: projectInfo.groupCount || (projectInfo.teams.length > 0 ? 9 : 0),
        drawOrderGenerated: false,
        drawCompleted: false
      };
    }
  });

  // 默认选中第一个项目
  if (store.sheetNames.length > 0) {
    if (typeof window._selectProject === 'function') {
      window._selectProject(store.sheetNames[0]);
    }
  }

  renderProjectList();
  updateNavigationState();
}

export function parseSheetData(data) {
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

export async function exportResult() {
  if (!store.drawCompleted || !store.drawAlgorithm) {
    showAlertDialog('请先完成抽签');
    return;
  }

  // 准备导出数据
  const groups = store.drawAlgorithm.getGroups();
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

  const result = await window.electronAPI.exportExcel(exportData);

  if (result.success) {
    showAlertDialog('导出成功！');
  } else if (!result.canceled) {
    showAlertDialog('导出失败: ' + result.error);
  }
}
