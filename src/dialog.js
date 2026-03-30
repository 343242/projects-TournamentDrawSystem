// 带输入框的弹窗（用于分组数量设置等场景）
export function showPromptDialog(message, defaultValue, onConfirm, hint, min, max) {
  const dialog = document.getElementById('prompt-dialog');
  const msgEl = document.getElementById('prompt-message');
  const hintEl = document.getElementById('prompt-hint');
  const inputEl = document.getElementById('prompt-input');
  const confirmBtn = document.getElementById('prompt-confirm');
  const cancelBtn = document.getElementById('prompt-cancel');

  msgEl.textContent = message;
  inputEl.value = defaultValue || '';

  // Set min/max attributes and show range hint
  if (min != null) inputEl.min = min;
  if (max != null) inputEl.max = max;

  if (hint) {
    hintEl.textContent = hint;
    hintEl.style.display = 'block';
  } else if (min != null && max != null) {
    hintEl.textContent = `范围: ${min} ~ ${max}`;
    hintEl.style.display = 'block';
  } else {
    hintEl.textContent = '';
    hintEl.style.display = 'none';
  }

  dialog.classList.remove('hidden');
  inputEl.focus();

  const clampValue = () => {
    const val = parseInt(inputEl.value);
    if (isNaN(val)) return;
    if (min != null && val < min) inputEl.value = min;
    if (max != null && val > max) inputEl.value = max;
  };

  const closeDialog = () => {
    dialog.classList.add('hidden');
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', closeDialog);
    inputEl.removeEventListener('keydown', handleKeydown);
    inputEl.removeEventListener('input', clampValue);
    inputEl.removeEventListener('change', clampValue);
  };

  const handleConfirm = () => {
    clampValue();
    const value = inputEl.value;
    closeDialog();
    if (onConfirm) onConfirm(value);
  };

  const handleKeydown = (e) => {
    if (e.key === 'Enter') handleConfirm();
  };

  inputEl.addEventListener('keydown', handleKeydown);
  inputEl.addEventListener('input', clampValue);
  inputEl.addEventListener('change', clampValue);
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
