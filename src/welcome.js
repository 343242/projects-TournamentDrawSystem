// 启动页面逻辑

export function startDrawSystem() {
  const welcomePage = document.getElementById('welcome-page');
  const mainApp = document.getElementById('main-app');

  welcomePage.classList.add('fade-out');

  setTimeout(() => {
    welcomePage.style.display = 'none';
    mainApp.classList.remove('hidden');
  }, 500);
}

export async function changeBackground() {
  const result = await window.electronAPI.openImageDialog();

  if (!result.canceled && result.filePaths.length > 0) {
    const imagePath = result.filePaths[0];
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${imagePath}')`;

    // 保存背景设置到本地存储
    localStorage.setItem('customBackground', imagePath);
  }
}

export function loadCustomBackground() {
  const customBackground = localStorage.getItem('customBackground');
  if (customBackground) {
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${customBackground}')`;
  }
}
