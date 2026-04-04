// Startup page logic

import { saveSessionNow } from './session-persistence.js';
import { store } from './store.js';
import { isSafeImageDataUri } from './utils.js';

function showMainApp({ immediate = false } = {}) {
  const welcomePage = document.getElementById('welcome-page');
  const mainApp = document.getElementById('main-app');

  if (!welcomePage || !mainApp) {
    return;
  }

  store.appStarted = true;

  if (immediate) {
    welcomePage.classList.remove('fade-out');
    welcomePage.style.display = 'none';
    mainApp.classList.remove('hidden');
    return;
  }

  welcomePage.classList.add('fade-out');

  setTimeout(() => {
    welcomePage.style.display = 'none';
    mainApp.classList.remove('hidden');
  }, 500);
}

export function startDrawSystem() {
  showMainApp();
  void saveSessionNow(store).catch((error) => {
    console.warn('Failed to persist app entry state:', error);
  });
}

export function restoreMainApp() {
  showMainApp({ immediate: true });
}

export function returnToLaunchScreen() {
  const welcomePage = document.getElementById('welcome-page');
  const mainApp = document.getElementById('main-app');

  if (!welcomePage || !mainApp) {
    return;
  }

  store.appStarted = false;
  welcomePage.classList.remove('fade-out');
  welcomePage.style.display = '';
  mainApp.classList.add('hidden');

  void saveSessionNow(store).catch((error) => {
    console.warn('Failed to persist launch screen state:', error);
  });
}

export async function changeBackground() {
  const result = await window.electronAPI.openImageDialog();

  if (!result.canceled && result.dataUri) {
    if (!isSafeImageDataUri(result.dataUri)) return;

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
  if (saved && isSafeImageDataUri(saved)) {
    const welcomePage = document.getElementById('welcome-page');
    welcomePage.style.backgroundImage = `url('${saved}')`;
  } else if (saved) {
    localStorage.removeItem('customBackground');
  }
}
