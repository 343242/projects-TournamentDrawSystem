// 共享动画工具函数

/**
 * 创建飞行动画：从 source 元素飞向目标位置
 * @param {Object} options
 * @param {HTMLElement} options.source - 起始位置元素
 * @param {HTMLElement} [options.target] - 目标元素（自动计算中心坐标）
 * @param {number} [options.targetX] - 目标 X 坐标（优先于 target）
 * @param {number} [options.targetY] - 目标 Y 坐标（优先于 target）
 * @param {string} options.text - 飞行元素显示文本
 * @param {number} [options.duration=600] - 飞行时长(ms)
 * @param {string} [options.easing] - CSS 缓动函数
 * @param {number} [options.scale=0.5] - 目标缩放
 * @param {HTMLElement} [options.highlightTarget] - 飞行期间高亮的元素
 * @param {Function} [options.onLand] - 到达后的回调
 * @param {Function} [options.guardFn] - 中途检查，返回 false 则中断
 * @returns {{ cancel: Function }}
 */
export function flyElement({ source, target, targetX, targetY, text, duration = 500, easing = 'cubic-bezier(0.22, 1, 0.36, 1)', scale = 0.85, highlightTarget, onLand, guardFn }) {
  const sourceRect = source.getBoundingClientRect();

  // 计算目标坐标：优先使用显式坐标，否则从 target 元素计算中心
  const destX = targetX != null ? targetX : (() => {
    const r = target.getBoundingClientRect();
    return r.left + r.width / 2;
  })();
  const destY = targetY != null ? targetY : (() => {
    const r = target.getBoundingClientRect();
    return r.top + r.height / 2;
  })();

  const flyer = document.createElement('div');
  flyer.className = 'team-flyer';
  flyer.textContent = text;

  Object.assign(flyer.style, {
    position: 'fixed',
    left: (sourceRect.left + sourceRect.width / 2) + 'px',
    top: (sourceRect.top + sourceRect.height / 2) + 'px',
    transform: 'translate(-50%, -50%) scale(1)',
    opacity: '1',
  });

  document.body.appendChild(flyer);
  flyer.offsetHeight; // force reflow

  if (highlightTarget) highlightTarget.classList.add('fly-target');

  Object.assign(flyer.style, {
    left: destX + 'px',
    top: destY + 'px',
    transform: `translate(-50%, -50%) scale(${scale})`,
    opacity: '1',
    transition: `all ${duration}ms ${easing}`,
  });

  let cancelled = false;

  const timer = setTimeout(() => {
    flyer.remove();
    if (highlightTarget) highlightTarget.classList.remove('fly-target');
    if (cancelled) return;
    if (guardFn && !guardFn()) return;
    if (onLand) onLand();
  }, duration);

  return {
    cancel() {
      cancelled = true;
      clearTimeout(timer);
      flyer.remove();
      if (highlightTarget) highlightTarget.classList.remove('fly-target');
    }
  };
}

/**
 * 闪烁随机队名动画
 * @param {Object} options
 * @param {HTMLElement} options.displayEl - 显示名称的元素
 * @param {Array} options.teams - 队伍数组
 * @param {Function} options.renderFn - (team) => string|void. Return HTML string to set innerHTML, or return nothing and mutate displayEl directly.
 * @param {number} [options.interval=60] - 闪烁间隔(ms)
 * @param {number} [options.duration=600] - 闪烁总时长(ms)
 * @param {Function} [options.onSelect] - 闪烁结束后的回调
 * @param {Function} [options.guardFn] - 每次闪烁前检查，返回 false 则停止
 * @returns {{ cancel: Function }}
 */
export function flashRandomNames({ displayEl, teams, renderFn, interval = 60, duration = 600, onSelect, guardFn }) {
  const flashInterval = setInterval(() => {
    if (guardFn && !guardFn()) {
      clearInterval(flashInterval);
      return;
    }
    const randomTeam = teams[Math.floor(Math.random() * teams.length)];
    const html = renderFn(randomTeam);
    if (html !== undefined) {
      displayEl.innerHTML = html;
    }
  }, interval);

  const flashTimer = setTimeout(() => {
    clearInterval(flashInterval);
    if (guardFn && !guardFn()) return;
    if (onSelect) onSelect();
  }, duration);

  return {
    cancel() {
      clearInterval(flashInterval);
      clearTimeout(flashTimer);
    }
  };
}
