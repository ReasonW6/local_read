// Main application entry point
import { state } from './core/state.js';
import { DOM, CONFIG, getFileKey } from './core/config.js';
import { 
  loadBookshelf, 
  openBookFromServer, 
  readArrayBufferWithEncoding,
  saveLastReadBook,
  loadReadingHistory,
  saveProgress,
  loadProgress 
} from './modules/fileManager.js';
import { openEpub, manualSaveEpubProgress } from './modules/epubReader.js';
import { openTxt, manualSaveTxtProgress } from './modules/txtReader.js';
import { openPdf, manualSavePdfProgress } from './modules/pdfReader.js';
import { toggleTheme, changeFontSize, initializeTheme } from './modules/themeManager.js';
import { 
  addBookmark, 
  clearAllBookmarks, 
  loadBookmarks 
} from './modules/bookmarkManager.js';
import { toggleSidebar, closeSidebarIfBookshelf, closeSidebar, goToNextChapter, goToPreviousChapter } from './modules/uiController.js';
import { configManager } from './modules/configManager.js';

const THEME_STORAGE_KEY = 'local_reader_theme';
const queryParams = new URLSearchParams(window.location.search);
const queryTheme = queryParams.get('theme');
const queryPath = queryParams.get('path');
const queryName = queryParams.get('name');
const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);

const initialTheme = (queryTheme === CONFIG.THEMES.DARK || queryTheme === CONFIG.THEMES.LIGHT)
  ? queryTheme
  : (storedTheme === CONFIG.THEMES.DARK || storedTheme === CONFIG.THEMES.LIGHT)
    ? storedTheme
    : null;

let pendingQueryBook = queryPath ? {
  path: queryPath,
  name: queryName || null
} : null;

if (initialTheme && initialTheme !== state.theme) {
  state.theme = initialTheme;
  document.body.dataset.theme = initialTheme;
}

if (queryTheme === CONFIG.THEMES.DARK || queryTheme === CONFIG.THEMES.LIGHT) {
  localStorage.setItem(THEME_STORAGE_KEY, queryTheme);
}

/* ========== 设置面板与阅读偏好 ========== */
const PREFS_KEY = 'reader_prefs_v1';
const defaultPrefs = {
  paraSpacing: 1,
  letterSpacing: 0.2,
  lineHeight: 1.8,
  pageWidth: 800,
  pagePadding: 40,
  progressBarEnabled: true
};

function computeVerticalPadding(horizontalPadding) {
  const horizontal = Number(horizontalPadding);
  if (!Number.isFinite(horizontal)) {
    return Math.round(defaultPrefs.pagePadding * 0.75);
  }
  return Math.max(20, Math.round(horizontal * 0.75));
}

function normalizePrefs(raw = {}) {
  const merged = { ...defaultPrefs, ...raw };
  const clamp = (value, min, max, fallback) => {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return Math.min(Math.max(num, min), max);
    }
    return fallback;
  };

  const paraSpacing = clamp(merged.paraSpacing, 0.4, 3, defaultPrefs.paraSpacing);
  const letterSpacing = clamp(merged.letterSpacing, 0, 3, defaultPrefs.letterSpacing);
  const lineHeight = clamp(merged.lineHeight, 1.2, 2.8, defaultPrefs.lineHeight);
  const pageWidth = Math.round(clamp(merged.pageWidth, 480, 1400, defaultPrefs.pageWidth));
  const pagePadding = Math.round(clamp(merged.pagePadding, 16, 120, defaultPrefs.pagePadding));
  const progressBarEnabled = merged.progressBarEnabled !== false;

  return { paraSpacing, letterSpacing, lineHeight, pageWidth, pagePadding, progressBarEnabled };
}

function getReadingPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw);
    return normalizePrefs(parsed);
  } catch {
    return { ...defaultPrefs };
  }
}

function saveReadingPrefs(prefs) {
  const normalized = normalizePrefs(prefs);
  localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
  return normalized;
}

function applyTypography(prefs) {
  const normalized = normalizePrefs(prefs);
  document.documentElement.style.setProperty('--para-spacing', String(normalized.paraSpacing));
  document.documentElement.style.setProperty('--letter-spacing', `${normalized.letterSpacing}px`);
  document.documentElement.style.setProperty('--line-height', String(normalized.lineHeight));
  document.documentElement.style.setProperty('--page-width', `${normalized.pageWidth}px`);
  document.documentElement.style.setProperty('--page-padding-x', `${normalized.pagePadding}px`);
  document.documentElement.style.setProperty('--page-padding-y', `${computeVerticalPadding(normalized.pagePadding)}px`);
  applyEpubTypographyToContents(normalized);
  requestAnimationFrame(updateReadingProgress);
}

function applyEpubTypographyToContents(prefs) {
  if (!state.rendition) return;
  const normalized = normalizePrefs(prefs);
  const verticalPadding = computeVerticalPadding(normalized.pagePadding);
  const contents = state.rendition.getContents();
  contents.forEach(content => {
    try {
      const doc = content?.document;
      if (!doc) return;
      const id = 'epub-typography-override';
      let style = doc.getElementById(id);
      if (!style) {
        style = doc.createElement('style');
        style.id = id;
        doc.head.appendChild(style);
      }
      style.textContent = `
        html, body {
          margin: 0 auto !important;
          padding: ${verticalPadding}px ${normalized.pagePadding}px !important;
          max-width: ${normalized.pageWidth}px !important;
          line-height: ${normalized.lineHeight} !important;
        }
        p { 
          letter-spacing: ${normalized.letterSpacing}px !important; 
          margin-bottom: calc(${normalized.paraSpacing} * 1em) !important; 
          line-height: inherit !important;
        }
      `;
    } catch {}
  });
  if (!state.rendition._typographyHooked) {
    try {
      state.rendition.on('rendered', () => {
        applyEpubTypographyToContents(getReadingPrefs());
      });
      state.rendition._typographyHooked = true;
    } catch {}
  }
  
  // 强制重新渲染 EPUB 内容以应用新的布局设置
  try {
    if (state.rendition && state.rendition.manager && state.rendition.manager.layout) {
      // 触发重新计算布局
      requestAnimationFrame(() => {
        state.rendition.resize();
      });
    }
  } catch (e) {
    // 忽略错误，某些 EPUB 可能不支持 resize
  }
}

// Save complete reading state (progress + settings)
function saveCompleteReadingState() {
  if (!state.currentFileKey) return;
  
  // 获取当前阅读进度百分比
  const scroller = document.querySelector('.main');
  let readingPercentage = 0;
  if (scroller) {
    const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    readingPercentage = Math.min(100, Math.max(0, (scroller.scrollTop / max) * 100));
  }
  
  const currentPrefs = getReadingPrefs();
  const completeState = {
    fontSize: state.fontSize,
    theme: state.theme,
    paraSpacing: currentPrefs.paraSpacing,
    letterSpacing: currentPrefs.letterSpacing,
    lineHeight: currentPrefs.lineHeight,
    pageWidth: currentPrefs.pageWidth,
    pagePadding: currentPrefs.pagePadding,
    progressBarEnabled: currentPrefs.progressBarEnabled !== false,
    readingPercentage: readingPercentage, // 保存阅读进度百分比
    timestamp: Date.now()
  };
  
  const stateKey = `reader_complete_state_${state.currentFileKey}`;
  localStorage.setItem(stateKey, JSON.stringify(completeState));
}

// Load and apply complete reading state
function loadCompleteReadingState() {
  if (!state.currentFileKey) return;
  
  const stateKey = `reader_complete_state_${state.currentFileKey}`;
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return;
    
    const savedState = JSON.parse(raw);
    
    // 应用字体大小（如果与当前不同）
    if (savedState.fontSize && savedState.fontSize !== state.fontSize) {
      // 直接更新状态，避免触发额外的保存
      import('./modules/themeManager.js').then(({ setFontSize }) => {
        if (setFontSize) {
          setFontSize(savedState.fontSize);
        } else {
          // 备用方案：直接设置
          state.fontSize = savedState.fontSize;
          const reader = DOM.reader();
          if (reader) reader.style.fontSize = savedState.fontSize + 'px';
        }
      });
    }
    
    // 应用主题（如果与当前不同）
    if (savedState.theme && savedState.theme !== state.theme) {
      import('./modules/themeManager.js').then(({ setTheme }) => {
        if (setTheme) {
          setTheme(savedState.theme);
        }
      });
    }
    
    // 应用排版设置
    const hasTypographyState = ['paraSpacing', 'letterSpacing', 'lineHeight', 'pageWidth', 'pagePadding', 'progressBarEnabled']
      .some(key => savedState[key] !== undefined);

    if (hasTypographyState) {
      const mergedPrefs = { ...getReadingPrefs() };
      ['paraSpacing', 'letterSpacing', 'lineHeight', 'pageWidth', 'pagePadding', 'progressBarEnabled'].forEach(key => {
        if (savedState[key] !== undefined) {
          mergedPrefs[key] = savedState[key];
        }
      });

      const normalizedPrefs = saveReadingPrefs(mergedPrefs);
      applyTypography(normalizedPrefs);
      applyProgressBarPreference(normalizedPrefs.progressBarEnabled !== false);
      
      // 更新设置面板UI
      updateSettingsPanelUI(normalizedPrefs);
    }
    
    // 恢复阅读进度百分比
    if (savedState.readingPercentage !== undefined) {
      // 延迟执行，确保内容已加载
      setTimeout(() => {
        const scroller = document.querySelector('.main');
        if (scroller) {
          const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
          const scrollTop = (savedState.readingPercentage / 100) * max;
          scroller.scrollTop = scrollTop;
          // 更新进度条显示
          updateReadingProgress();
        }
      }, 300); // 给予足够的时间让内容渲染完成
    }
    
  } catch (error) {
    console.warn('Failed to load complete reading state:', error);
  }
}

// Update settings panel UI with loaded values
function updateSettingsPanelUI(prefs) {
  const normalized = normalizePrefs(prefs);
  const formatDecimal = (value) => Number(value).toFixed(2).replace(/\.0+$/, '').replace(/\.([1-9])0$/, '.$1');

  const paraInput = document.getElementById('paraSpacingInput');
  const letterInput = document.getElementById('letterSpacingInput');
  const lineHeightInput = document.getElementById('lineHeightInput');
  const pageWidthInput = document.getElementById('pageWidthInput');
  const pageMarginInput = document.getElementById('pageMarginInput');

  const paraVal = document.getElementById('paraSpacingVal');
  const letterVal = document.getElementById('letterSpacingVal');
  const lineHeightVal = document.getElementById('lineHeightVal');
  const pageWidthVal = document.getElementById('pageWidthVal');
  const pageMarginVal = document.getElementById('pageMarginVal');
  const progressToggle = document.getElementById('progressBarToggle');

  if (paraInput) paraInput.value = String(normalized.paraSpacing);
  if (letterInput) letterInput.value = String(normalized.letterSpacing);
  if (lineHeightInput) lineHeightInput.value = String(normalized.lineHeight);
  if (pageWidthInput) pageWidthInput.value = String(normalized.pageWidth);
  if (pageMarginInput) pageMarginInput.value = String(normalized.pagePadding);

  if (paraVal) paraVal.textContent = formatDecimal(normalized.paraSpacing);
  if (letterVal) letterVal.textContent = `${formatDecimal(normalized.letterSpacing)}px`;
  if (lineHeightVal) lineHeightVal.textContent = formatDecimal(normalized.lineHeight);
  if (pageWidthVal) pageWidthVal.textContent = `${Math.round(normalized.pageWidth)}px`;
  if (pageMarginVal) pageMarginVal.textContent = `${Math.round(normalized.pagePadding)}px`;
  if (progressToggle) progressToggle.checked = normalized.progressBarEnabled !== false;
}

function deriveBookNameFromPath(path) {
  if (!path) return '未知书籍';
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  return lastSegment || normalized || '未知书籍';
}

// 增强的一键保存所有数据功能
async function saveAllData() {
  try {
    // 1. 保存当前阅读进度
    if (state.type === 'epub') {
      manualSaveEpubProgress();
    } else if (state.type === 'txt') {
      manualSaveTxtProgress();
    } else if (state.type === 'pdf') {
      manualSavePdfProgress();
    }
    
    // 2. 保存完整的阅读状态
    saveCompleteReadingState();
    
    // 3. 保存完整配置到服务器（固定文件名）
    const config = configManager.collectAllData();
    
    const response = await fetch('/api/save-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: config,
        filename: 'user-config.json' // 固定文件名
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save config to server');
    }
    
    // 4. 显示保存成功指示器
    showSavedIndicator();
    configManager.showMessage('所有数据已保存！', 'success');
    
    // 5. 更新顶部进度条显示
    updateReadingProgress();
    
  } catch (error) {
    console.error('保存数据失败:', error);
    configManager.showMessage('保存失败: ' + error.message, 'error');
  }
}

// 预加载全局设置（字体大小、主题等），确保启动时就是正确的设置
async function preloadGlobalSettings() {
  try {
    const response = await fetch('/api/load-config/user-config.json');
    
    if (response.ok) {
      const result = await response.json();
      const config = result.config;
      
      // 立即应用全局字体设置
      if (config.settings && config.settings.fontSize) {
        state.fontSize = config.settings.fontSize;
        document.documentElement.style.setProperty('--font-size', config.settings.fontSize + 'px');
        // 更新reader的字体大小（如果reader元素已存在）
        const reader = DOM.reader();
        if (reader) {
          reader.style.fontSize = config.settings.fontSize + 'px';
        }
      }
      
      const overrideTheme = localStorage.getItem(THEME_STORAGE_KEY);
      const normalizedOverride = (overrideTheme === CONFIG.THEMES.DARK || overrideTheme === CONFIG.THEMES.LIGHT) ? overrideTheme : null;

      // 立即应用主题设置，优先使用本地偏好
      if (normalizedOverride) {
        state.theme = normalizedOverride;
        document.body.setAttribute('data-theme', normalizedOverride);
      } else if (config.settings && config.settings.theme) {
        state.theme = config.settings.theme;
        document.body.setAttribute('data-theme', config.settings.theme);
      }
      
      // 立即应用阅读偏好
      if (config.readingPrefs) {
        const normalizedPrefs = saveReadingPrefs(config.readingPrefs);
        applyTypography(normalizedPrefs);
        applyProgressBarPreference(normalizedPrefs.progressBarEnabled !== false);
        updateSettingsPanelUI(normalizedPrefs);
      }
      
      console.log('全局设置已预加载');
    }
  } catch (error) {
    console.log('没有找到用户配置文件，使用默认设置');
  }
}

// 自动加载用户配置
async function autoLoadUserConfig() {
  try {
    const response = await fetch('/api/load-config/user-config.json');
    
    if (response.ok) {
      const result = await response.json();
      await configManager.applyConfig(result.config);
      console.log('用户配置已自动加载');
      
      // 重新渲染书架以显示最新的"最近阅读"状态
      if (state.bookshelf.length > 0) {
        import('./modules/fileManager.js').then(({ renderBookshelf }) => {
          renderBookshelf();
        });
      }
    } else {
      console.log('没有找到用户配置文件，使用默认设置');
    }
  } catch (error) {
    console.warn('自动加载配置失败，使用默认设置:', error);
  }
}

// Enhanced book opening function
async function openBook(book, fileData) {
  try {
    // 在打开书籍前，预先加载字体和主题设置，避免突兀的变化
    await preloadBookSettings();
    
    // 加载书签
    loadBookmarks();
    
    const name = book.name.toLowerCase();
    if (name.endsWith('.epub')) {
      await openEpub(fileData);
    } else if (name.endsWith('.txt')) {
      const text = await readArrayBufferWithEncoding(fileData);
      await openTxt(text, book.name);
    } else if (name.endsWith('.pdf')) {
      await openPdf(fileData);
    }
    
    // 关闭侧边栏（如果当前显示的是书架）
    closeSidebarIfBookshelf();
    
    // 在内容加载完成后应用阅读进度和其他设置
    setTimeout(() => {
      loadRemainingReadingState();
    }, 200); // 减少延迟时间，因为字体设置已经预先应用
    
  } catch (error) {
    console.error('Error opening book:', error);
    throw error;
  }
}

// 预加载书籍设置（字体、主题等），避免突兀的变化
async function preloadBookSettings() {
  if (!state.currentFileKey) return;
  
  const stateKey = `reader_complete_state_${state.currentFileKey}`;
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return;
    
    const savedState = JSON.parse(raw);
    
    // 立即应用字体大小，避免视觉闪烁
    if (savedState.fontSize && savedState.fontSize !== state.fontSize) {
      await applyFontSizeImmediately(savedState.fontSize);
    }
    
    // 立即应用主题，避免视觉闪烁
    if (savedState.theme && savedState.theme !== state.theme) {
      await applyThemeImmediately(savedState.theme);
    }
    
    // 立即应用排版设置
    const hasTypographyState = ['paraSpacing', 'letterSpacing', 'lineHeight', 'pageWidth', 'pagePadding', 'progressBarEnabled']
      .some(key => savedState[key] !== undefined);

    if (hasTypographyState) {
      const mergedPrefs = { ...getReadingPrefs() };
      ['paraSpacing', 'letterSpacing', 'lineHeight', 'pageWidth', 'pagePadding', 'progressBarEnabled'].forEach(key => {
        if (savedState[key] !== undefined) {
          mergedPrefs[key] = savedState[key];
        }
      });

      const normalizedPrefs = saveReadingPrefs(mergedPrefs);
      applyTypography(normalizedPrefs);
      applyProgressBarPreference(normalizedPrefs.progressBarEnabled !== false);
      updateSettingsPanelUI(normalizedPrefs);
    }
    
  } catch (error) {
    console.warn('Failed to preload book settings:', error);
  }
}

// 立即应用字体大小（无动画，无闪烁）
async function applyFontSizeImmediately(fontSize) {
  // 更新状态
  state.fontSize = fontSize;
  
  // 直接设置CSS，无过渡效果
  const reader = DOM.reader();
  if (reader) {
    reader.style.transition = 'none'; // 禁用过渡动画
    reader.style.fontSize = fontSize + 'px';
    // 强制重绘
    reader.offsetHeight;
    reader.style.transition = ''; // 恢复过渡动画
  }
  
  // 更新UI显示
  const currentFontSize = document.getElementById('currentFontSize');
  if (currentFontSize) {
    currentFontSize.textContent = fontSize + 'px';
  }
}

// 立即应用主题（无动画，无闪烁）
async function applyThemeImmediately(theme) {
  // 更新状态
  state.theme = theme;
  
  // 直接设置主题，无过渡效果
  document.body.setAttribute('data-theme', theme);
  
  // 更新UI显示
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    const span = themeToggle.querySelector('span');
    if (span) {
      span.textContent = theme === 'dark' ? '日间' : '夜间';
    }
  }
  
  const currentTheme = document.getElementById('currentTheme');
  if (currentTheme) {
    currentTheme.textContent = theme === 'dark' ? '夜间模式' : '日间模式';
  }
}

// 加载剩余的阅读状态（主要是阅读进度）
function loadRemainingReadingState() {
  if (!state.currentFileKey) return;
  
  const stateKey = `reader_complete_state_${state.currentFileKey}`;
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return;
    
    const savedState = JSON.parse(raw);
    
    // 恢复阅读进度百分比
    if (savedState.readingPercentage !== undefined) {
      const scroller = document.querySelector('.main');
      if (scroller) {
        const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        const scrollTop = (savedState.readingPercentage / 100) * max;
        scroller.scrollTop = scrollTop;
        // 更新进度条显示
        updateReadingProgress();
      }
    }
    
  } catch (error) {
    console.warn('Failed to load remaining reading state:', error);
  }
}

// Enhanced book opening from server
async function handleOpenBookFromServer(book) {
  try {
    const result = await openBookFromServer(book);
    await openBook(result.book, result.fileData);
  } catch (error) {
    // Error is already handled in openBookFromServer
  }
}

async function openBookFromQueryIfNeeded(booksFromLoad) {
  if (!pendingQueryBook || !pendingQueryBook.path) {
    pendingQueryBook = null;
    return;
  }

  const allBooks = Array.isArray(booksFromLoad) && booksFromLoad.length > 0
    ? booksFromLoad
    : Array.isArray(state.bookshelf) ? state.bookshelf : [];
  const matched = allBooks.find(item => item.path === pendingQueryBook.path);

  const targetBook = matched || {
    path: pendingQueryBook.path,
    name: pendingQueryBook.name || deriveBookNameFromPath(pendingQueryBook.path)
  };

  try {
    await handleOpenBookFromServer(targetBook);
  } catch (error) {
    console.warn('自动打开书籍失败:', error);
  } finally {
    pendingQueryBook = null;
  }
}

// 保存提示
function showSavedIndicator() {
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

// 保存当前阅读位置的百分比
let lastReadingPercentage = 0;

/** 阅读进度条 */
function updateReadingProgress() {
  const scroller = document.querySelector('.main');
  const bar = document.getElementById('readingProgressBar');
  const text = document.getElementById('readingProgressText');
  if (!scroller || (!bar && !text)) return;
  const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  const pct = Math.min(100, Math.max(0, (scroller.scrollTop / max) * 100));
  lastReadingPercentage = pct; // 保存当前百分比
  if (bar) bar.style.width = pct.toFixed(2) + '%';
  if (text) text.textContent = Math.round(pct) + '%';
}

// 根据保存的阅读百分比恢复滚动位置
function restoreScrollPositionByPercentage() {
  const scroller = document.querySelector('.main');
  if (!scroller) return;
  
  // 等待DOM更新完成后再计算新的滚动位置
  setTimeout(() => {
    const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const scrollTop = (lastReadingPercentage / 100) * max;
    scroller.scrollTop = scrollTop;
    updateReadingProgress(); // 更新进度条显示
  }, 50);
}

function initReadingProgress() {
  const scroller = document.querySelector('.main');
  if (!scroller) return;
  scroller.addEventListener('scroll', updateReadingProgress, { passive: true });
  window.addEventListener('resize', updateReadingProgress);
  requestAnimationFrame(updateReadingProgress);
}

/** 键盘快捷键 */
function initKeyboardShortcuts() {
  function onKeydown(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.isComposing) return;
    switch (e.key) {
      case 'ArrowLeft':
        goToPreviousChapter();
        e.preventDefault();
        break;
      case 'ArrowRight':
        goToNextChapter();
        e.preventDefault();
        break;
      case '+':
      case '=':
        window.changeFontSize(1);
        e.preventDefault();
        break;
      case '-':
      case '_':
        window.changeFontSize(-1);
        e.preventDefault();
        break;
      case 't':
      case 'T':
        window.toggleTheme();
        e.preventDefault();
        break;
      case 'b':
      case 'B':
        addBookmark();
        e.preventDefault();
        break;
      case 's':
      case 'S':
        manualSaveProgress();
        e.preventDefault();
        break;
      case ' ':
        goToNextChapter();
        e.preventDefault();
        break;
      default:
        break;
    }
  }
  window.addEventListener('keydown', onKeydown);
}

/* 更新设置面板中的状态显示 */
function updateSettingsStatus() {
  const currentFontSize = document.getElementById('currentFontSize');
  const currentTheme = document.getElementById('currentTheme');
  
  if (currentFontSize) {
    currentFontSize.textContent = `${state.fontSize}px`;
  }
  
  if (currentTheme) {
    currentTheme.textContent = state.theme === 'light' ? '日间模式' : '夜间模式';
  }
}

/* 顶部进度条显示/隐藏应用 */
function applyProgressBarPreference(enabled) {
  // 支持多种可能的结构/选择器，尽量兼容现有实现
  const containers = Array.from(document.querySelectorAll('#readingProgress, .reading-progress, .top-progress'));
  const bars = Array.from(document.querySelectorAll('#readingProgressBar, .reading-progress__bar, .progress-bar'));
  if (containers.length === 0 && bars.length === 0) return;

  const display = enabled ? '' : 'none';
  containers.forEach(el => { el.style.display = display; });
  bars.forEach(el => { el.style.display = display; });
}

// 设置导航切换功能
function initSettingsNavigation() {
  const navItems = document.querySelectorAll('.settings-nav-item');
  const categories = document.querySelectorAll('.settings-category');
  
  function switchCategory(targetCategory) {
    // 更新导航项状态
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.category === targetCategory);
    });
    
    // 更新分类显示状态
    categories.forEach(category => {
      const categoryId = `category-${targetCategory}`;
      if (category.id === categoryId) {
        category.style.display = 'block';
        category.classList.add('active');
      } else {
        category.style.display = 'none';
        category.classList.remove('active');
      }
    });
  }
  
  // 绑定导航点击事件
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const category = item.dataset.category;
      switchCategory(category);
    });
  });
  
  // 默认显示第一个分类
  switchCategory('reading');
}

function initSettingsPanel() {
  const settingsBtn = document.getElementById('settingsBtn');
  const mask = document.getElementById('settingsMask');
  const closeBtn = document.getElementById('settingsClose');
  const paraInput = document.getElementById('paraSpacingInput');
  const letterInput = document.getElementById('letterSpacingInput');
  const lineHeightInput = document.getElementById('lineHeightInput');
  const pageWidthInput = document.getElementById('pageWidthInput');
  const pageMarginInput = document.getElementById('pageMarginInput');
  const resetBtn = document.getElementById('resetReadingPrefsBtn');

  // 初始化导航功能
  initSettingsNavigation();

  const initialPrefs = normalizePrefs(getReadingPrefs());
  updateSettingsPanelUI(initialPrefs);
  applyTypography(initialPrefs);
  applyProgressBarPreference(initialPrefs.progressBarEnabled !== false);
  updateSettingsStatus();

  // 顶部进度条开关初始化与监听（默认开启）
  const progressToggle = document.getElementById('progressBarToggle');
  if (progressToggle) {
    progressToggle.checked = initialPrefs.progressBarEnabled !== false;
    progressToggle.addEventListener('change', () => {
      const next = { ...getReadingPrefs(), progressBarEnabled: progressToggle.checked };
      const normalized = saveReadingPrefs(next);
      applyProgressBarPreference(normalized.progressBarEnabled !== false);
      updateSettingsPanelUI(normalized);
      saveCompleteReadingState();
      showSavedIndicator();
    });
  }

  // 使用防抖来优化性能，避免频繁调整时造成卡顿
  let prefChangeTimeout = null;
  
  const handlePrefChange = (partial) => {
    // 判断是否是会影响页面布局的设置（页宽、页边距）
    const isLayoutChange = 'pageWidth' in partial || 'pagePadding' in partial;
    
    // 如果是布局变化，先保存当前阅读进度百分比
    if (isLayoutChange) {
      updateReadingProgress();
    }
    
    const next = { ...getReadingPrefs(), ...partial };
    const normalized = saveReadingPrefs(next);
    
    // 立即更新UI显示
    updateSettingsPanelUI(normalized);
    
    // 应用排版样式（立即生效）
    applyTypography(normalized);
    applyProgressBarPreference(normalized.progressBarEnabled !== false);
    
    // 防抖保存状态和恢复位置
    clearTimeout(prefChangeTimeout);
    prefChangeTimeout = setTimeout(() => {
      saveCompleteReadingState();
      showSavedIndicator();
      
      // 如果是布局变化，恢复到相同的阅读进度百分比
      if (isLayoutChange) {
        requestAnimationFrame(() => {
          restoreScrollPositionByPercentage();
        });
      }
    }, 100); // 100ms 防抖延迟
  };

  function openSettings() {
    if (mask) mask.classList.add('show');
    // 打开时更新状态显示
    updateSettingsStatus();
  }
  function closeSettings() {
    if (mask) mask.classList.remove('show');
  }

  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (closeBtn) closeBtn.addEventListener('click', closeSettings);
  
  // 点击遮罩关闭（但不包括模态窗口本身）
  if (mask) {
    mask.addEventListener('click', (e) => {
      if (e.target === mask) {
        closeSettings();
      }
    });
  }
  
  // ESC 键关闭
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mask && mask.classList.contains('show')) {
      closeSettings();
    }
  });

  if (paraInput) {
    paraInput.addEventListener('input', () => {
      handlePrefChange({ paraSpacing: Number(paraInput.value) });
    });
  }
  if (letterInput) {
    letterInput.addEventListener('input', () => {
      handlePrefChange({ letterSpacing: Number(letterInput.value) });
    });
  }
  if (lineHeightInput) {
    lineHeightInput.addEventListener('input', () => {
      handlePrefChange({ lineHeight: Number(lineHeightInput.value) });
    });
  }
  if (pageWidthInput) {
    pageWidthInput.addEventListener('input', () => {
      handlePrefChange({ pageWidth: Number(pageWidthInput.value) });
    });
  }
  if (pageMarginInput) {
    pageMarginInput.addEventListener('input', () => {
      handlePrefChange({ pagePadding: Number(pageMarginInput.value) });
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const normalized = saveReadingPrefs(defaultPrefs);
      updateSettingsPanelUI(normalized);
      applyTypography(normalized);
      applyProgressBarPreference(normalized.progressBarEnabled !== false);
      saveCompleteReadingState();
      showSavedIndicator();
      updateSettingsStatus();
    });
  }
}

// 暴露函数到全局，供 HTML 中的 onclick 使用
window.changeFontSize = (delta) => {
  updateReadingProgress(); // 先保存当前百分比
  changeFontSize(delta);
  saveCompleteReadingState();
  showSavedIndicator();
  updateSettingsStatus();
  restoreScrollPositionByPercentage(); // 恢复到相同百分比位置
};

window.toggleTheme = () => {
  toggleTheme();
  saveCompleteReadingState();
  showSavedIndicator();
  updateSettingsStatus();
  requestAnimationFrame(() => applyTypography(getReadingPrefs()));
  requestAnimationFrame(updateReadingProgress);
};

// 初始化侧边栏自动收起功能
function initSidebarAutoClose() {
  const mainContent = document.querySelector('.main');
  const sidebar = document.getElementById('sidebar');
  
  if (!mainContent || !sidebar) return;
  
  // 点击主内容区域时，如果侧边栏是打开的，则关闭它
  mainContent.addEventListener('click', (e) => {
    // 检查侧边栏是否可见
    if (sidebar.classList.contains('visible')) {
      // 确保点击的不是功能按钮或交互元素
      const clickedElement = e.target;
      const isInteractiveElement = clickedElement.closest('button, a, input, select, textarea, [contenteditable]');
      
      // 如果不是交互元素，则关闭侧边栏
      if (!isInteractiveElement) {
        closeSidebar();
      }
    }
  });
  
  // 也可以通过点击侧边栏外的其他区域关闭（但不包括右侧工具栏）
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('visible')) return;
    
    const clickedElement = e.target;
    const isInSidebar = clickedElement.closest('.sidebar');
    const isInToolbar = clickedElement.closest('.right-toolbar');
    const isInteractiveElement = clickedElement.closest('button, a, input, select, textarea, [contenteditable]');
    
    // 如果点击的不在侧边栏内，不在工具栏内，且不是交互元素，则关闭侧边栏
    if (!isInSidebar && !isInToolbar && !isInteractiveElement) {
      closeSidebar();
    }
  });
}

/* ========== 文件上传与拖拽功能 ========== */

// 处理文件选择上传
async function handleFileUpload(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;
  
  await uploadFiles(files);
  // 清除选择，允许重复选择同一文件
  event.target.value = '';
}

// 处理拖拽进入
function handleDragEnter(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}

// 处理拖拽悬停
function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

// 处理拖拽离开
function handleDragLeave(event) {
  event.preventDefault();
  // 只有当拖拽完全离开容器时才移除样式
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-over');
  }
}

// 处理文件拖拽放置
async function handleDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  
  const files = Array.from(event.dataTransfer.files);
  if (files.length === 0) return;
  
  // 过滤支持的文件类型
  const supportedFiles = files.filter(file => {
    const ext = file.name.toLowerCase();
    return ext.endsWith('.epub') || ext.endsWith('.txt') || ext.endsWith('.pdf');
  });
  
  if (supportedFiles.length === 0) {
    alert('请拖拽 .epub、.txt 或 .pdf 格式的文件');
    return;
  }
  
  if (supportedFiles.length !== files.length) {
    const skipped = files.length - supportedFiles.length;
    alert(`已忽略 ${skipped} 个不支持的文件，只处理 .epub、.txt、.pdf 格式`);
  }
  
  await uploadFiles(supportedFiles);
}

// 上传文件到服务器
async function uploadFiles(files) {
  if (files.length === 0) return;
  
  const formData = new FormData();
  files.forEach(file => {
    formData.append('books', file);
  });
  
  try {
    // 显示上传提示
    showUploadProgress(`正在上传 ${files.length} 个文件...`);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`上传失败: ${response.status}`);
    }
    
    const result = await response.json();
    
    // 显示成功消息
    showUploadProgress(result.message, 'success');
    
    // 自动刷新书架
    setTimeout(() => {
      loadBookshelf();
      hideUploadProgress();
    }, 1500);
    
  } catch (error) {
    console.error('Upload error:', error);
    showUploadProgress(`上传失败: ${error.message}`, 'error');
    setTimeout(hideUploadProgress, 3000);
  }
}

// 显示上传进度提示
function showUploadProgress(message, type = 'info') {
  let indicator = document.getElementById('upload-indicator');
  
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'upload-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--toolbar-bg);
      color: var(--text);
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px var(--shadow-color);
      border: 1px solid var(--border-color);
      z-index: 2000;
      font-size: 14px;
      max-width: 300px;
      transition: all 0.3s ease;
      transform: translateX(100%);
    `;
    document.body.appendChild(indicator);
  }
  
  indicator.textContent = message;
  
  // 设置不同类型的样式
  if (type === 'success') {
    indicator.style.borderLeftColor = '#4CAF50';
    indicator.style.borderLeftWidth = '4px';
  } else if (type === 'error') {
    indicator.style.borderLeftColor = '#F44336';
    indicator.style.borderLeftWidth = '4px';
  } else {
    indicator.style.borderLeftColor = 'var(--accent)';
    indicator.style.borderLeftWidth = '4px';
  }
  
  // 显示动画
  requestAnimationFrame(() => {
    indicator.style.transform = 'translateX(0)';
  });
}

// 隐藏上传进度提示
function hideUploadProgress() {
  const indicator = document.getElementById('upload-indicator');
  if (indicator) {
    indicator.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  }
}

/* ========== 添加书籍弹窗功能 ========== */

// 弹窗状态管理
let addBooksModalState = {
  files: [],
  isUploading: false
};

// 打开添加书籍弹窗
function openAddBooksModal() {
  const mask = document.getElementById('addBooksMask');
  if (mask) {
    // 重置状态
    addBooksModalState.files = [];
    addBooksModalState.isUploading = false;
    
    // 更新UI
    updateFilesDisplay();
    updateConfirmButton();
    
    // 显示弹窗
    mask.classList.add('show');
  }
}

// 关闭添加书籍弹窗
function closeAddBooksModal() {
  const mask = document.getElementById('addBooksMask');
  if (mask) {
    mask.classList.remove('show');
    // 清理状态
    addBooksModalState.files = [];
    addBooksModalState.isUploading = false;
  }
}

// 初始化添加书籍弹窗
function initAddBooksModal() {
  const mask = document.getElementById('addBooksMask');
  const modal = document.getElementById('addBooksModal');
  const closeBtn = document.getElementById('addBooksClose');
  const dropZone = document.getElementById('dropZone');
  const selectFilesBtn = document.getElementById('selectFilesBtn');
  const fileInput = document.getElementById('fileInputModal');
  const clearFilesBtn = document.getElementById('clearFilesBtn');
  const cancelBtn = document.getElementById('cancelAddBtn');
  const confirmBtn = document.getElementById('confirmAddBtn');

  // 关闭按钮事件
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAddBooksModal);
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeAddBooksModal);
  }

  // 点击遮罩关闭
  if (mask) {
    mask.addEventListener('click', (e) => {
      if (e.target === mask) {
        closeAddBooksModal();
      }
    });
  }

  // ESC键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mask && mask.classList.contains('show')) {
      closeAddBooksModal();
    }
  });

  // 拖拽区域事件
  if (dropZone) {
    dropZone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
    
    dropZone.addEventListener('dragover', handleModalDragOver);
    dropZone.addEventListener('dragenter', handleModalDragEnter);
    dropZone.addEventListener('dragleave', handleModalDragLeave);
    dropZone.addEventListener('drop', handleModalDrop);
  }

  // 选择文件按钮
  if (selectFilesBtn) {
    selectFilesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fileInput) fileInput.click();
    });
  }

  // 文件输入变化
  if (fileInput) {
    fileInput.addEventListener('change', handleModalFileSelect);
  }

  // 清空文件按钮
  if (clearFilesBtn) {
    clearFilesBtn.addEventListener('click', () => {
      addBooksModalState.files = [];
      updateFilesDisplay();
      updateConfirmButton();
    });
  }

  // 确认添加按钮
  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleConfirmAdd);
  }
}

// 拖拽事件处理 - 弹窗版本
function handleModalDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

function handleModalDragEnter(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}

function handleModalDragLeave(event) {
  event.preventDefault();
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-over');
  }
}

function handleModalDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  
  const files = Array.from(event.dataTransfer.files);
  addFilesToModal(files);
}

// 文件选择事件处理
function handleModalFileSelect(event) {
  const files = Array.from(event.target.files);
  addFilesToModal(files);
  // 清除选择，允许重复选择
  event.target.value = '';
}

// 添加文件到弹窗
function addFilesToModal(files) {
  const supportedFiles = files.filter(file => {
    const ext = file.name.toLowerCase();
    return ext.endsWith('.epub') || ext.endsWith('.txt') || ext.endsWith('.pdf');
  });

  if (supportedFiles.length === 0) {
    alert('请选择 .epub、.txt 或 .pdf 格式的文件');
    return;
  }

  if (supportedFiles.length !== files.length) {
    const skipped = files.length - supportedFiles.length;
    alert(`已忽略 ${skipped} 个不支持的文件，只添加 .epub、.txt、.pdf 格式`);
  }

  // 避免重复文件
  supportedFiles.forEach(file => {
    const exists = addBooksModalState.files.some(f => 
      f.name === file.name && f.size === file.size
    );
    if (!exists) {
      addBooksModalState.files.push(file);
    }
  });

  updateFilesDisplay();
  updateConfirmButton();
}

// 更新文件显示
function updateFilesDisplay() {
  const filesList = document.getElementById('filesList');
  if (!filesList) return;

  if (addBooksModalState.files.length === 0) {
    filesList.innerHTML = `
      <div class="files-empty">
        <p>还没有选择任何文件</p>
      </div>
    `;
    return;
  }

  filesList.innerHTML = addBooksModalState.files.map((file, index) => {
    const ext = getFileExtension(file.name);
    const size = formatFileSize(file.size);
    
    return `
      <div class="file-item">
        <div class="file-icon ${ext}">
          ${ext}
        </div>
        <div class="file-info">
          <p class="file-name" title="${file.name}">${file.name}</p>
          <p class="file-size">${size}</p>
        </div>
        <button class="file-remove" onclick="removeFileFromModal(${index})" title="移除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }).join('');
}

// 移除文件
function removeFileFromModal(index) {
  addBooksModalState.files.splice(index, 1);
  updateFilesDisplay();
  updateConfirmButton();
}

// 更新确认按钮状态
function updateConfirmButton() {
  const confirmBtn = document.getElementById('confirmAddBtn');
  if (!confirmBtn) return;

  const hasFiles = addBooksModalState.files.length > 0;
  const isUploading = addBooksModalState.isUploading;
  
  confirmBtn.disabled = !hasFiles || isUploading;
  
  const btnText = confirmBtn.querySelector('.btn-text');
  const btnLoading = confirmBtn.querySelector('.btn-loading');
  
  if (btnText && btnLoading) {
    if (isUploading) {
      btnText.style.display = 'none';
      btnLoading.style.display = 'flex';
    } else {
      btnText.style.display = 'block';
      btnLoading.style.display = 'none';
      btnText.textContent = hasFiles ? `添加 ${addBooksModalState.files.length} 个书籍` : '添加书籍';
    }
  }
}

// 确认添加书籍
async function handleConfirmAdd() {
  if (addBooksModalState.files.length === 0 || addBooksModalState.isUploading) return;

  addBooksModalState.isUploading = true;
  updateConfirmButton();

  try {
    await uploadFiles(addBooksModalState.files);
    
    // 上传成功，关闭弹窗
    setTimeout(() => {
      closeAddBooksModal();
    }, 1500);
    
  } catch (error) {
    // 错误已在uploadFiles中处理
    addBooksModalState.isUploading = false;
    updateConfirmButton();
  }
}

// 辅助函数
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 将函数暴露到全局作用域供HTML使用
window.removeFileFromModal = removeFileFromModal;

// Setup event listeners
function setupEventListeners() {
  // Core functionality
  document.addEventListener('DOMContentLoaded', async () => {
    // 1. 首先加载用户配置中的基础设置（字体、主题）
    await preloadGlobalSettings();
    
    // 2. 初始化各种功能模块
    initializeTheme();
    initReadingProgress();
    initKeyboardShortcuts();
    initSettingsPanel();
    initSidebarAutoClose();
    applyTypography(getReadingPrefs());

    // 3. 加载书架
    let booksFromLoad;
    try {
      booksFromLoad = await loadBookshelf();
      requestAnimationFrame(updateReadingProgress);
    } catch (error) {
      // loadBookshelf 内部已处理错误提示
    }
    
    // 4. 加载其他用户配置（书签、阅读进度等）
    await autoLoadUserConfig();

    // 5. 若通过URL携带书籍路径，自动打开对应书籍
    await openBookFromQueryIfNeeded(booksFromLoad);

    const readerInnerEl = DOM.readerInner && DOM.readerInner();
    if (readerInnerEl) {
      const observer = new MutationObserver(() => requestAnimationFrame(updateReadingProgress));
      observer.observe(readerInnerEl, { childList: true, subtree: true });
    }
  });
  
  // Sidebar navigation
  const tocToggleBtn = DOM.tocToggleBtn();
  const bookmarkListBtn = DOM.bookmarkListBtn();
  
  if (tocToggleBtn) {
    tocToggleBtn.addEventListener('click', () => toggleSidebar(CONFIG.SIDEBAR_VIEWS.TOC));
  }
  if (bookmarkListBtn) {
    bookmarkListBtn.addEventListener('click', () => toggleSidebar(CONFIG.SIDEBAR_VIEWS.BOOKMARK));
  }
  
  // Bookshelf refresh
  const refreshBookshelfBtn = DOM.refreshBookshelfBtn();
  if (refreshBookshelfBtn) {
    refreshBookshelfBtn.addEventListener('click', loadBookshelf);
  }
  
  // Add books functionality - Modal based
  const addBooksBtn = document.getElementById('addBooksBtn');
  
  if (addBooksBtn) {
    addBooksBtn.addEventListener('click', openAddBooksModal);
  }
  
  // Initialize add books modal
  initAddBooksModal();
  
  // Theme and font controls
  const themeToggle = DOM.themeToggle();
  const fontIncreaseBtn = DOM.fontIncreaseBtn();
  const fontDecreaseBtn = DOM.fontDecreaseBtn();
  
  if (themeToggle) {
    themeToggle.addEventListener('click', () => window.toggleTheme());
  }
  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => window.changeFontSize(1));
  }
  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => window.changeFontSize(-1));
  }
  
  // Bookmark and progress controls
  const saveProgressBtn = DOM.saveProgressBtn();
  const addBookmarkBtn = DOM.addBookmarkBtn();
  const clearAllBookmarksBtn = DOM.clearAllBookmarksBtn();
  
  if (saveProgressBtn) {
    // 简化为一键保存功能
    saveProgressBtn.addEventListener('click', saveAllData);
  }
  if (addBookmarkBtn) {
    addBookmarkBtn.addEventListener('click', addBookmark);
  }
  if (clearAllBookmarksBtn) {
    clearAllBookmarksBtn.addEventListener('click', clearAllBookmarks);
  }
  
  // Save current book as last read when leaving page
  window.addEventListener('beforeunload', () => {
    if (state.currentFileKey && state.bookshelf.length > 0) {
      // 找到当前正在阅读的书籍
      const currentBook = state.bookshelf.find(book => getFileKey(book.path) === state.currentFileKey);
      if (currentBook) {
        saveLastReadBook(currentBook);
      }
      
      // 清除"正在阅读"状态，下次启动时应显示为"上次阅读"
      updateState({ currentlyReading: null });
      
      // 自动保存所有数据（同步方式，避免页面关闭时丢失）
      try {
        const config = configManager.collectAllData();
        // 使用 sendBeacon 或同步请求确保数据保存
        const blob = new Blob([JSON.stringify({ config, filename: 'user-config.json' })], {
          type: 'application/json'
        });
        navigator.sendBeacon('/api/save-config', blob);
      } catch (e) {
        console.warn('自动保存失败:', e);
      }
    }
  });
}

// Make necessary functions available globally for HTML onclick handlers
window.openBookFromServer = handleOpenBookFromServer;

// 将简化后的函数暴露到全局作用域
window.saveAllData = saveAllData;

// Initialize application
setupEventListeners();

console.log('Local E-book Reader initialized');