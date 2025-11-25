// Main application entry point - 模块化重构版本
import { state, updateState } from './core/state.js';
import { DOM, CONFIG, getFileKey } from './core/config.js';
import { 
  normalizePrefs, 
  applyProgressBarPreference,
  showSavedIndicator,
  deriveBookNameFromPath,
  DEFAULT_READING_PREFS
} from './core/utils.js';
import { 
  loadBookshelf, 
  openBookFromServer, 
  readArrayBufferWithEncoding,
  saveLastReadBook
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
import { initAddBooksModal, openAddBooksModal } from './modules/addBooksModal.js';

// 导入新模块
import { 
  getReadingPrefs, 
  saveReadingPrefs, 
  applyTypography, 
  applyEpubTypographyToContents,
  updateSettingsPanelUI,
  updateSettingsStatus
} from './modules/readingPrefs.js';

/* ========== 全局常量与初始化 ========== */
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

/* ========== 阅读状态管理 ========== */

// 保存完整阅读状态
function saveCompleteReadingState() {
  if (!state.currentFileKey) return;
  
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
    readingPercentage: readingPercentage,
    timestamp: Date.now()
  };
  
  const stateKey = `reader_complete_state_${state.currentFileKey}`;
  localStorage.setItem(stateKey, JSON.stringify(completeState));
}

// 加载完整阅读状态
function loadCompleteReadingState() {
  if (!state.currentFileKey) return;
  
  const stateKey = `reader_complete_state_${state.currentFileKey}`;
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return;
    
    const savedState = JSON.parse(raw);
    
    if (savedState.fontSize && savedState.fontSize !== state.fontSize) {
      import('./modules/themeManager.js').then(({ setFontSize }) => {
        if (setFontSize) {
          setFontSize(savedState.fontSize);
        } else {
          state.fontSize = savedState.fontSize;
          const reader = DOM.reader();
          if (reader) reader.style.fontSize = savedState.fontSize + 'px';
        }
      });
    }
    
    if (savedState.theme && savedState.theme !== state.theme) {
      import('./modules/themeManager.js').then(({ setTheme }) => {
        if (setTheme) {
          setTheme(savedState.theme);
        }
      });
    }
    
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
      applyTypography(normalizedPrefs, updateReadingProgress);
      applyProgressBarPreference(normalizedPrefs.progressBarEnabled !== false);
      updateSettingsPanelUI(normalizedPrefs);
    }
    
    if (savedState.readingPercentage !== undefined) {
      setTimeout(() => {
        const scroller = document.querySelector('.main');
        if (scroller) {
          const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
          const scrollTop = (savedState.readingPercentage / 100) * max;
          scroller.scrollTop = scrollTop;
          updateReadingProgress();
        }
      }, 300);
    }
    
  } catch (error) {
    console.warn('Failed to load complete reading state:', error);
  }
}

/* ========== 保存功能 ========== */

async function saveAllData() {
  try {
    if (state.type === 'epub') {
      manualSaveEpubProgress();
    } else if (state.type === 'txt') {
      manualSaveTxtProgress();
    } else if (state.type === 'pdf') {
      manualSavePdfProgress();
    }
    
    saveCompleteReadingState();
    
    const config = configManager.collectAllData();
    const response = await fetch('/api/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, filename: 'user-config.json' })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save config to server');
    }
    
    showSavedIndicator();
    configManager.showMessage('所有数据已保存！', 'success');
    updateReadingProgress();
    
  } catch (error) {
    console.error('保存数据失败:', error);
    configManager.showMessage('保存失败: ' + error.message, 'error');
  }
}

// 预加载全局设置
async function preloadGlobalSettings() {
  try {
    const response = await fetch('/api/load-config/user-config.json');
    
    if (response.ok) {
      const result = await response.json();
      const config = result.config;
      
      if (config.settings && config.settings.fontSize) {
        state.fontSize = config.settings.fontSize;
        document.documentElement.style.setProperty('--font-size', config.settings.fontSize + 'px');
        const reader = DOM.reader();
        if (reader) {
          reader.style.fontSize = config.settings.fontSize + 'px';
        }
      }
      
      const overrideTheme = localStorage.getItem(THEME_STORAGE_KEY);
      const normalizedOverride = (overrideTheme === CONFIG.THEMES.DARK || overrideTheme === CONFIG.THEMES.LIGHT) ? overrideTheme : null;

      if (normalizedOverride) {
        state.theme = normalizedOverride;
        document.body.setAttribute('data-theme', normalizedOverride);
      } else if (config.settings && config.settings.theme) {
        state.theme = config.settings.theme;
        document.body.setAttribute('data-theme', config.settings.theme);
      }
      
      if (config.readingPrefs) {
        const normalizedPrefs = saveReadingPrefs(config.readingPrefs);
        applyTypography(normalizedPrefs, updateReadingProgress);
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

/* ========== 书籍打开功能 ========== */

async function openBook(book, fileData) {
  try {
    await preloadBookSettings();
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
    
    closeSidebarIfBookshelf();
    
    setTimeout(() => {
      loadRemainingReadingState();
    }, 200);
    
  } catch (error) {
    console.error('Error opening book:', error);
    throw error;
  }
}

async function preloadBookSettings() {
  if (!state.currentFileKey) return;
  
  const stateKey = `reader_complete_state_${state.currentFileKey}`;
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return;
    
    const savedState = JSON.parse(raw);
    
    if (savedState.fontSize && savedState.fontSize !== state.fontSize) {
      await applyFontSizeImmediately(savedState.fontSize);
    }
    
    if (savedState.theme && savedState.theme !== state.theme) {
      await applyThemeImmediately(savedState.theme);
    }
    
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
      applyTypography(normalizedPrefs, updateReadingProgress);
      applyProgressBarPreference(normalizedPrefs.progressBarEnabled !== false);
      updateSettingsPanelUI(normalizedPrefs);
    }
    
  } catch (error) {
    console.warn('Failed to preload book settings:', error);
  }
}

async function applyFontSizeImmediately(fontSize) {
  state.fontSize = fontSize;
  
  const reader = DOM.reader();
  if (reader) {
    reader.style.transition = 'none';
    reader.style.fontSize = fontSize + 'px';
    reader.offsetHeight;
    reader.style.transition = '';
  }
  
  const currentFontSize = document.getElementById('currentFontSize');
  if (currentFontSize) {
    currentFontSize.textContent = fontSize + 'px';
  }
}

async function applyThemeImmediately(theme) {
  state.theme = theme;
  document.body.setAttribute('data-theme', theme);
  
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

function loadRemainingReadingState() {
  if (!state.currentFileKey) return;
  
  const stateKey = `reader_complete_state_${state.currentFileKey}`;
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return;
    
    const savedState = JSON.parse(raw);
    
    if (savedState.readingPercentage !== undefined) {
      const scroller = document.querySelector('.main');
      if (scroller) {
        const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        const scrollTop = (savedState.readingPercentage / 100) * max;
        scroller.scrollTop = scrollTop;
        updateReadingProgress();
      }
    }
    
  } catch (error) {
    console.warn('Failed to load remaining reading state:', error);
  }
}

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

/* ========== 阅读进度 ========== */

let lastReadingPercentage = 0;

function updateReadingProgress() {
  const scroller = document.querySelector('.main');
  const bar = document.getElementById('readingProgressBar');
  const text = document.getElementById('readingProgressText');
  if (!scroller || (!bar && !text)) return;
  const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  const pct = Math.min(100, Math.max(0, (scroller.scrollTop / max) * 100));
  lastReadingPercentage = pct;
  if (bar) bar.style.width = pct.toFixed(2) + '%';
  if (text) text.textContent = Math.round(pct) + '%';
}

function restoreScrollPositionByPercentage() {
  const scroller = document.querySelector('.main');
  if (!scroller) return;
  
  setTimeout(() => {
    const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const scrollTop = (lastReadingPercentage / 100) * max;
    scroller.scrollTop = scrollTop;
    updateReadingProgress();
  }, 50);
}

function initReadingProgress() {
  const scroller = document.querySelector('.main');
  if (!scroller) return;
  scroller.addEventListener('scroll', updateReadingProgress, { passive: true });
  window.addEventListener('resize', updateReadingProgress);
  requestAnimationFrame(updateReadingProgress);
}

/* ========== 键盘快捷键 ========== */

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

function manualSaveProgress() {
  if (state.type === 'epub') {
    manualSaveEpubProgress();
  } else if (state.type === 'txt') {
    manualSaveTxtProgress();
  } else if (state.type === 'pdf') {
    manualSavePdfProgress();
  }
  saveCompleteReadingState();
  showSavedIndicator();
}

/* ========== 设置面板 ========== */

function initSettingsNavigation() {
  const navItems = document.querySelectorAll('.settings-nav-item');
  const categories = document.querySelectorAll('.settings-category');
  
  function switchCategory(targetCategory) {
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.category === targetCategory);
    });
    
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
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const category = item.dataset.category;
      switchCategory(category);
    });
  });
  
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

  initSettingsNavigation();

  const initialPrefs = normalizePrefs(getReadingPrefs());
  updateSettingsPanelUI(initialPrefs);
  applyTypography(initialPrefs, updateReadingProgress);
  applyProgressBarPreference(initialPrefs.progressBarEnabled !== false);
  updateSettingsStatus();

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

  let prefChangeTimeout = null;
  
  const handlePrefChange = (partial) => {
    const isLayoutChange = 'pageWidth' in partial || 'pagePadding' in partial;
    
    if (isLayoutChange) {
      updateReadingProgress();
    }
    
    const next = { ...getReadingPrefs(), ...partial };
    const normalized = saveReadingPrefs(next);
    
    updateSettingsPanelUI(normalized);
    applyTypography(normalized, updateReadingProgress);
    applyProgressBarPreference(normalized.progressBarEnabled !== false);
    
    clearTimeout(prefChangeTimeout);
    prefChangeTimeout = setTimeout(() => {
      saveCompleteReadingState();
      showSavedIndicator();
      
      if (isLayoutChange) {
        requestAnimationFrame(() => {
          restoreScrollPositionByPercentage();
        });
      }
    }, 100);
  };

  function openSettings() {
    if (mask) mask.classList.add('show');
    updateSettingsStatus();
  }
  function closeSettings() {
    if (mask) mask.classList.remove('show');
  }

  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (closeBtn) closeBtn.addEventListener('click', closeSettings);
  
  if (mask) {
    mask.addEventListener('click', (e) => {
      if (e.target === mask) {
        closeSettings();
      }
    });
  }
  
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
      const normalized = saveReadingPrefs(DEFAULT_READING_PREFS);
      updateSettingsPanelUI(normalized);
      applyTypography(normalized, updateReadingProgress);
      applyProgressBarPreference(normalized.progressBarEnabled !== false);
      saveCompleteReadingState();
      showSavedIndicator();
      updateSettingsStatus();
    });
  }
}

/* ========== 全局函数 ========== */

window.changeFontSize = (delta) => {
  updateReadingProgress();
  changeFontSize(delta);
  saveCompleteReadingState();
  showSavedIndicator();
  updateSettingsStatus();
  restoreScrollPositionByPercentage();
};

window.toggleTheme = () => {
  toggleTheme();
  saveCompleteReadingState();
  showSavedIndicator();
  updateSettingsStatus();
  requestAnimationFrame(() => applyTypography(getReadingPrefs(), updateReadingProgress));
  requestAnimationFrame(updateReadingProgress);
};

/* ========== 侧边栏自动收起 ========== */

function initSidebarAutoClose() {
  const mainContent = document.querySelector('.main');
  const sidebar = document.getElementById('sidebar');
  
  if (!mainContent || !sidebar) return;
  
  mainContent.addEventListener('click', (e) => {
    if (sidebar.classList.contains('visible')) {
      const clickedElement = e.target;
      const isInteractiveElement = clickedElement.closest('button, a, input, select, textarea, [contenteditable]');
      
      if (!isInteractiveElement) {
        closeSidebar();
      }
    }
  });
  
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('visible')) return;
    
    const clickedElement = e.target;
    const isInSidebar = clickedElement.closest('.sidebar');
    const isInToolbar = clickedElement.closest('.right-toolbar');
    const isInteractiveElement = clickedElement.closest('button, a, input, select, textarea, [contenteditable]');
    
    if (!isInSidebar && !isInToolbar && !isInteractiveElement) {
      closeSidebar();
    }
  });
}

/* ========== 文件上传功能 ========== */

async function uploadFiles(files) {
  if (files.length === 0) return;
  
  const formData = new FormData();
  files.forEach(file => {
    formData.append('books', file);
  });
  
  try {
    showUploadProgress(`正在上传 ${files.length} 个文件...`);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`上传失败: ${response.status}`);
    }
    
    const result = await response.json();
    showUploadProgress(result.message, 'success');
    
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
  
  requestAnimationFrame(() => {
    indicator.style.transform = 'translateX(0)';
  });
}

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

/* ========== 事件监听器设置 ========== */

function setupEventListeners() {
  document.addEventListener('DOMContentLoaded', async () => {
    await preloadGlobalSettings();
    
    initializeTheme();
    initReadingProgress();
    initKeyboardShortcuts();
    initSettingsPanel();
    initSidebarAutoClose();
    applyTypography(getReadingPrefs(), updateReadingProgress);

    let booksFromLoad;
    try {
      booksFromLoad = await loadBookshelf();
      requestAnimationFrame(updateReadingProgress);
    } catch (error) {
      // loadBookshelf 内部已处理错误提示
    }
    
    await autoLoadUserConfig();
    await openBookFromQueryIfNeeded(booksFromLoad);

    const readerInnerEl = DOM.readerInner && DOM.readerInner();
    if (readerInnerEl) {
      const observer = new MutationObserver(() => requestAnimationFrame(updateReadingProgress));
      observer.observe(readerInnerEl, { childList: true, subtree: true });
    }
  });
  
  const tocToggleBtn = DOM.tocToggleBtn();
  const bookmarkListBtn = DOM.bookmarkListBtn();
  
  if (tocToggleBtn) {
    tocToggleBtn.addEventListener('click', () => toggleSidebar(CONFIG.SIDEBAR_VIEWS.TOC));
  }
  if (bookmarkListBtn) {
    bookmarkListBtn.addEventListener('click', () => toggleSidebar(CONFIG.SIDEBAR_VIEWS.BOOKMARK));
  }
  
  const refreshBookshelfBtn = DOM.refreshBookshelfBtn();
  if (refreshBookshelfBtn) {
    refreshBookshelfBtn.addEventListener('click', loadBookshelf);
  }
  
  const addBooksBtn = document.getElementById('addBooksBtn');
  if (addBooksBtn) {
    addBooksBtn.addEventListener('click', openAddBooksModal);
  }
  
  // 初始化添加书籍弹窗（传入上传处理函数）
  initAddBooksModal(uploadFiles);
  
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
  
  const saveProgressBtn = DOM.saveProgressBtn();
  const addBookmarkBtn = DOM.addBookmarkBtn();
  const clearAllBookmarksBtn = DOM.clearAllBookmarksBtn();
  
  if (saveProgressBtn) {
    saveProgressBtn.addEventListener('click', saveAllData);
  }
  if (addBookmarkBtn) {
    addBookmarkBtn.addEventListener('click', addBookmark);
  }
  if (clearAllBookmarksBtn) {
    clearAllBookmarksBtn.addEventListener('click', clearAllBookmarks);
  }
  
  window.addEventListener('beforeunload', () => {
    if (state.currentFileKey && state.bookshelf.length > 0) {
      const currentBook = state.bookshelf.find(book => getFileKey(book.path) === state.currentFileKey);
      if (currentBook) {
        saveLastReadBook(currentBook);
      }
      
      updateState({ currentlyReading: null });
      
      try {
        const config = configManager.collectAllData();
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

// 全局暴露
window.openBookFromServer = handleOpenBookFromServer;
window.saveAllData = saveAllData;

// 初始化应用
setupEventListeners();

console.log('Local E-book Reader initialized');
