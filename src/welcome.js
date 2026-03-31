// Startup page logic

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

  if (!result.canceled && result.dataUri) {
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${result.dataUri}')`;

    try {
      localStorage.setItem('customBackground', result.dataUri);
    } catch (e) {
      console.warn('Failed to persist background:', e.message);
    }
  }
}

export function loadCustomBackground() {
  const saved = localStorage.getItem('customBackground');
  if (saved) {
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${saved}')`;
  }
}
