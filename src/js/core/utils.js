// 通用工具函数模块
// 用于在多个模块之间共享的工具函数

/**
 * 默认阅读偏好设置
 */
export const DEFAULT_READING_PREFS = {
  paraSpacing: 1,
  letterSpacing: 0.2,
  lineHeight: 1.8,
  pageWidth: 800,
  pagePadding: 40,
  progressBarEnabled: true
};

/**
 * 根据水平内边距计算垂直内边距
 * @param {number} horizontalPadding - 水平内边距
 * @returns {number} 垂直内边距
 */
export function computeVerticalPadding(horizontalPadding) {
  const horizontal = Number(horizontalPadding);
  if (!Number.isFinite(horizontal)) {
    return Math.round(DEFAULT_READING_PREFS.pagePadding * 0.75);
  }
  return Math.max(8, Math.round(horizontal * 0.75));
}

/**
 * 值范围限制函数
 * @param {*} value - 输入值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {number} fallback - 默认值
 * @returns {number} 限制后的值
 */
export function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (Number.isFinite(num)) {
    return Math.min(Math.max(num, min), max);
  }
  return fallback;
}

/**
 * 规范化阅读偏好设置
 * @param {Object} raw - 原始设置对象
 * @returns {Object} 规范化后的设置对象
 */
export function normalizePrefs(raw = {}) {
  const merged = { ...DEFAULT_READING_PREFS, ...raw };

  return {
    paraSpacing: clamp(merged.paraSpacing, 0.2, 4, DEFAULT_READING_PREFS.paraSpacing),
    letterSpacing: clamp(merged.letterSpacing, 0, 5, DEFAULT_READING_PREFS.letterSpacing),
    lineHeight: clamp(merged.lineHeight, 1.0, 3.5, DEFAULT_READING_PREFS.lineHeight),
    pageWidth: Math.round(clamp(merged.pageWidth, 400, 2000, DEFAULT_READING_PREFS.pageWidth)),
    pagePadding: Math.round(clamp(merged.pagePadding, 10, 150, DEFAULT_READING_PREFS.pagePadding)),
    progressBarEnabled: merged.progressBarEnabled !== false
  };
}

/**
 * 格式化时间为相对时间字符串
 * @param {number} timestamp - 时间戳
 * @returns {string} 相对时间字符串
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  
  const now = Date.now();
  const diff = now - Number(timestamp);
  
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < week) return `${Math.floor(diff / day)}天前`;
  if (diff < month) return `${Math.floor(diff / week)}周前`;
  
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小字符串
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} 扩展名（小写）
 */
export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * 格式化小数显示
 * @param {number} value - 数值
 * @returns {string} 格式化后的字符串
 */
export function formatDecimal(value) {
  return Number(value).toFixed(2).replace(/\.0+$/, '').replace(/\.([1-9])0$/, '.$1');
}

/**
 * 应用进度条显示/隐藏
 * @param {boolean} enabled - 是否显示
 */
export function applyProgressBarPreference(enabled) {
  const display = enabled ? '' : 'none';
  const selectors = [
    '#readingProgress', '.reading-progress', '.top-progress',
    '#readingProgressBar', '.reading-progress__bar', '.progress-bar'
  ];
  
  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = display;
    });
  });
}

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要执行的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 从路径中提取书名
 * @param {string} path - 文件路径
 * @returns {string} 书名
 */
export function deriveBookNameFromPath(path) {
  if (!path) return '未知书籍';
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  return lastSegment || normalized || '未知书籍';
}

/**
 * 显示保存成功指示器
 */
export function showSavedIndicator() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  clearTimeout(showSavedIndicator._t);
  showSavedIndicator._t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
  }, 1200);
}
