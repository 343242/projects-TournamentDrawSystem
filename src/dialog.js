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
