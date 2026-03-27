// 页面导航逻辑

import { store } from './store.js';

// 页面进入时的初始化回调注册
const pageInitCallbacks = {};
// 页面离开时的回调注册
const pageLeaveCallbacks = {};
let currentPage = null;

export function registerPageInit(pageId, callback) {
  pageInitCallbacks[pageId] = callback;
}

export function registerPageLeave(pageId, callback) {
  pageLeaveCallbacks[pageId] = callback;
}

export function updatePageHeaders() {
  const name = store.currentProject || '未选择项目';
  const prefix = `2025大学生计算机大赛项目分组(${name})`;
  const headerSettings = document.getElementById('header-settings');
  const headerOrder = document.getElementById('header-order');
  const headerDraw = document.getElementById('header-draw');
  if (headerSettings) headerSettings.textContent = `${prefix}-抽签设置`;
  if (headerOrder) headerOrder.textContent = `${prefix}-抽签顺序`;
  if (headerDraw) headerDraw.textContent = `${prefix}-分组抽签`;
}

export function updateNavigationState() {
  const navOrder = document.getElementById('nav-order');
  const navDraw = document.getElementById('nav-draw');

  // 初始状态：只有抽签设置可点击
  const hasData = store.sheetNames.length > 0;
  const hasDrawOrder = hasData && store.currentProject && store.projectsData[store.currentProject]?.drawOrderGenerated;
  const hasCompletedDraw = hasData && store.currentProject && store.projectsData[store.currentProject]?.drawCompleted;

  // 抽签顺序导航：有数据时可点击
  if (navOrder) {
    if (hasData) {
      navOrder.classList.remove('disabled');
      navOrder.disabled = false;
    } else {
      navOrder.classList.add('disabled');
      navOrder.disabled = true;
    }
  }

  // 分组抽签导航：生成抽签顺序后可点击
  if (navDraw) {
    if (hasDrawOrder) {
      navDraw.classList.remove('disabled');
      navDraw.disabled = false;
    } else {
      navDraw.classList.add('disabled');
      navDraw.disabled = true;
    }
  }
}

export function switchPage(pageId) {
  // 检查导航是否被禁用
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem && navItem.classList.contains('disabled')) {
    return;
  }

  // 执行当前页面的离开回调（如离开抽签顺序页时暂停动画）
  if (currentPage && pageLeaveCallbacks[currentPage]) {
    pageLeaveCallbacks[currentPage]();
  }

  // 更新导航状态
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });

  // 切换页面
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(`page-${pageId}`).classList.add('active');

  // 记录当前页面
  currentPage = pageId;

  // 执行页面进入回调（如切换到抽签页时初始化分组显示）
  if (pageInitCallbacks[pageId]) {
    pageInitCallbacks[pageId]();
  }
}

export function goToNext(pageId) {
  switchPage(pageId);
}

export function goToPrev(pageId) {
  switchPage(pageId);
}
