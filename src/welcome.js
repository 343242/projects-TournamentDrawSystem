// Startup page logic

function sanitizeImagePath(path) {
  // Escape characters that could break out of CSS url() string context
  return path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

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
    const rawPath = result.filePaths[0];
    const safePath = sanitizeImagePath(rawPath);
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${safePath}')`;

    // Store the raw path (safe in localStorage, only rendered via sanitizeImagePath)
    localStorage.setItem('customBackground', rawPath);
  }
}

export function loadCustomBackground() {
  const rawPath = localStorage.getItem('customBackground');
  if (rawPath) {
    const safePath = sanitizeImagePath(rawPath);
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${safePath}')`;
  }
}
