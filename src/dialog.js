// 带输入框的弹窗（用于分组数量设置等场景）
export function showPromptDialog(message, defaultValue, onConfirm, hint) {
  const dialog = document.getElementById('prompt-dialog');
  const msgEl = document.getElementById('prompt-message');
  const hintEl = document.getElementById('prompt-hint');
  const inputEl = document.getElementById('prompt-input');
  const confirmBtn = document.getElementById('prompt-confirm');
  const cancelBtn = document.getElementById('prompt-cancel');

  msgEl.textContent = message;
  hintEl.textContent = hint || '';
  hintEl.style.display = hint ? 'block' : 'none';
  inputEl.value = defaultValue || '';
  dialog.classList.remove('hidden');
  inputEl.focus();

  const closeDialog = () => {
    dialog.classList.add('hidden');
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', closeDialog);
    inputEl.removeEventListener('keydown', handleKeydown);
  };

  const handleConfirm = () => {
    const value = inputEl.value;
    closeDialog();
    if (onConfirm) onConfirm(value);
  };

  const handleKeydown = (e) => {
    if (e.key === 'Enter') handleConfirm();
  };

  inputEl.addEventListener('keydown', handleKeydown);
  confirmBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', closeDialog);
}

// 统一弹窗系统

export function showConfirmDialog(message, onConfirm) {
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
export function showAlertDialog(message) {
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
