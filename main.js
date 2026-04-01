const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

let mainWindow;

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');

  const windowOptions = {
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: '大赛抽签系统'
  };

  // Only set icon if the file exists
  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('index.html');
  mainWindow.maximize();  // 窗口默认最大化

  // 安全：阻止新窗口创建（防止 window.open 等绕过沙箱）
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // 安全：阻止导航到外部/不可信内容
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = 'file://';
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 导入Excel：主进程内部完成对话框+文件读取，不暴露文件路径给renderer
ipcMain.handle('import-excel', async (event) => {
  if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) return { success: false, error: 'Invalid sender' };
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    const filePath = result.filePaths[0];
    const workbook = XLSX.readFile(filePath);
    const data = {
      sheetNames: workbook.SheetNames,
      sheets: {}
    };
    workbook.SheetNames.forEach(name => {
      const sheet = workbook.Sheets[name];
      data.sheets[name] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    });
    return { success: true, canceled: false, fileName: path.basename(filePath), data };
  } catch (error) {
    return { success: false, canceled: false, error: error.message };
  }
});

// 导出Excel：主进程内部完成对话框+文件写入，renderer只发送数据
ipcMain.handle('export-excel', async (event, { projects }) => {
  if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) return { success: false, error: 'Invalid sender' };
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] }
      ],
      defaultPath: '分组结果.xlsx'
    });
    if (result.canceled) {
      return { success: false, canceled: true };
    }

    let wb;
    try {
      wb = XLSX.readFile(result.filePath);
    } catch (e) {
      wb = XLSX.utils.book_new();
    }

    for (const project of projects) {
      if (wb.SheetNames.includes(project.name)) {
        delete wb.Sheets[project.name];
        wb.SheetNames.splice(wb.SheetNames.indexOf(project.name), 1);
      }
      const ws = XLSX.utils.aoa_to_sheet(project.data);

      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

      const projectNameCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
      if (!ws[projectNameCell]) ws[projectNameCell] = {};
      ws[projectNameCell].s = {
        alignment: { horizontal: 'center', vertical: 'center' },
        font: { bold: true, sz: 14 }
      };

      for (let c = 0; c < 5; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r: 1, c });
        if (!ws[cellAddr]) ws[cellAddr] = {};
        ws[cellAddr].s = {
          alignment: { horizontal: 'center', vertical: 'center' },
          font: { bold: true }
        };
      }

      for (let r = 2; r < project.data.length; r++) {
        for (let c = 0; c < 5; c++) {
          const cellAddr = XLSX.utils.encode_cell({ r, c });
          if (!ws[cellAddr]) ws[cellAddr] = {};
          ws[cellAddr].s = {
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, project.name);
    }

    XLSX.writeFile(wb, result.filePath);
    return { success: true, canceled: false };
  } catch (error) {
    return { success: false, canceled: false, error: error.message };
  }
});

// 打开图片选择对话框：读取图片并返回 data URI，不暴露文件路径给 renderer
ipcMain.handle('open-image-dialog', async (event) => {
  if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) return { canceled: true };

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const imageBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
    const mimeType = mimeTypes[ext] || 'image/png';
    const dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    return { canceled: false, dataUri };
  } catch (error) {
    return { canceled: true, error: error.message };
  }
});
