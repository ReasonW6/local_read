// Theme management functionality
import { state, updateState } from '../core/state.js';
import { DOM, CONFIG } from '../core/config.js';
import { applyFontSize } from './epubReader.js';
import { applyTxtFontSize } from './txtReader.js';

const THEME_STORAGE_KEY = 'local_reader_theme';

/**
 * 应用主题到页面（内部共享函数）
 * @param {string} theme - 主题名称
 * @param {boolean} save - 是否保存到 localStorage
 */
function applyThemeToPage(theme, save = true) {
  // 更新 DOM
  document.body.dataset.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  
  if (save) {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
  
  // 更新切换按钮文本
  const themeToggle = DOM.themeToggle();
  if (themeToggle) {
    const themeLabel = themeToggle.querySelector('span');
    if (themeLabel) {
      themeLabel.textContent = theme === CONFIG.THEMES.LIGHT ? '夜间' : '日间';
    }
  }
  
  // 应用到 EPUB
  if (state.rendition && state.type === 'epub') {
    import('./epubCore.js').then(({ registerAndApplyEpubTheme }) => {
      registerAndApplyEpubTheme(theme);
    });
  }
}

/**
 * 应用字体大小（内部共享函数）
 */
function applyFontSizeToContent() {
  if (state.type === 'epub') {
    applyFontSize();
  } else if (state.type === 'txt') {
    applyTxtFontSize();
  }
}

/**
 * 切换主题（日间/夜间）
 */
export function toggleTheme() {
  const newTheme = (state.theme === CONFIG.THEMES.LIGHT) ? CONFIG.THEMES.DARK : CONFIG.THEMES.LIGHT;
  updateState({ theme: newTheme });
  applyThemeToPage(newTheme);
}

/**
 * 调整字体大小
 * @param {number} delta - 变化量（正数增大，负数减小）
 */
export function changeFontSize(delta) {
  const newSize = state.fontSize + delta;
  if (newSize < CONFIG.MIN_FONT_SIZE || newSize > CONFIG.MAX_FONT_SIZE) return;
  
  updateState({ fontSize: newSize });
  applyFontSizeToContent();
}

/**
 * 直接设置字体大小
 * @param {number} fontSize - 字体大小
 */
export function setFontSize(fontSize) {
  if (fontSize < CONFIG.MIN_FONT_SIZE || fontSize > CONFIG.MAX_FONT_SIZE) return;
  
  updateState({ fontSize });
  applyFontSizeToContent();
}

/**
 * 直接设置主题
 * @param {string} theme - 主题名称
 */
export function setTheme(theme) {
  if (theme !== CONFIG.THEMES.LIGHT && theme !== CONFIG.THEMES.DARK) return;
  
  updateState({ theme });
  applyThemeToPage(theme);
}

/**
 * 初始化主题（页面加载时调用）
 */
export function initializeTheme() {
  applyThemeToPage(state.theme, false);
}
