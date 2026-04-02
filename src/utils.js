// 纯工具函数

const SAFE_DATA_URI_RE = /^data:image\/[a-z]+;base64,[a-zA-Z0-9+/=]+$/;

export function isSafeImageDataUri(str) {
  return typeof str === 'string' && SAFE_DATA_URI_RE.test(str);
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
