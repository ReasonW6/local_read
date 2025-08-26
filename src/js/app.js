// Main application entry point
import { state } from './core/state.js';
import { DOM, CONFIG, getFileKey } from './core/config.js';
import { 
  loadBookshelf, 
  openBookFromServer, 
  readArrayBufferWithEncoding,
  saveLastReadBook,
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

/* ========== 设置面板与阅读偏好 ========== */
const PREFS_KEY = 'reader_prefs_v1';
const defaultPrefs = { paraSpacing: 1, letterSpacing: 0.2 };

function getReadingPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw);
    return { ...defaultPrefs, ...parsed };
  } catch {
    return { ...defaultPrefs };
  }
}

function saveReadingPrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyTypography(prefs) {
  document.documentElement.style.setProperty('--para-spacing', String(prefs.paraSpacing));
  document.documentElement.style.setProperty('--letter-spacing', `${prefs.letterSpacing}px`);
  applyEpubTypographyToContents(prefs);
  requestAnimationFrame(updateReadingProgress);
}

function applyEpubTypographyToContents(prefs) {
  if (!state.rendition) return;
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
        p { 
          letter-spacing: ${prefs.letterSpacing}px !important; 
          margin-bottom: calc(${prefs.paraSpacing} * 1em) !important; 
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
    if (savedState.paraSpacing !== undefined || savedState.letterSpacing !== undefined) {
      const newPrefs = {
        paraSpacing: savedState.paraSpacing || defaultPrefs.paraSpacing,
        letterSpacing: savedState.letterSpacing || defaultPrefs.letterSpacing
      };
      saveReadingPrefs(newPrefs);
      applyTypography(newPrefs);
      
      // 更新设置面板UI
      updateSettingsPanelUI(newPrefs);
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
  const paraInput = document.getElementById('paraSpacingInput');
  const letterInput = document.getElementById('letterSpacingInput');
  const paraVal = document.getElementById('paraSpacingVal');
  const letterVal = document.getElementById('letterSpacingVal');
  
  if (paraInput) paraInput.value = String(prefs.paraSpacing);
  if (letterInput) letterInput.value = String(prefs.letterSpacing);
  if (paraVal) paraVal.textContent = `${prefs.paraSpacing}`;
  if (letterVal) letterVal.textContent = `${prefs.letterSpacing}px`;
}

// Enhanced save function - saves progress + settings
function manualSaveProgress() {
  // 保存阅读进度
  if (state.type === 'epub') {
    manualSaveEpubProgress();
  } else if (state.type === 'txt') {
    manualSaveTxtProgress();
  } else if (state.type === 'pdf') {
    manualSavePdfProgress();
  }
  
  // 保存完整的阅读设置（包括阅读进度百分比）
  saveCompleteReadingState();
  
  // 显示保存指示器
  showSavedIndicator();
  
  // 更新顶部进度条显示
  updateReadingProgress();
}

// Enhanced book opening function
async function openBook(book, fileData) {
  try {
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
    
    // 延迟加载完整的阅读状态（包括字体、主题、排版和阅读进度百分比等）
    setTimeout(() => {
      loadCompleteReadingState();
    }, 500); // 增加延迟时间，确保内容完全加载
    
  } catch (error) {
    console.error('Error opening book:', error);
    throw error;
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
        updateReadingProgress(); // 先保存当前百分比
        changeFontSize(1);
        saveCompleteReadingState();
        restoreScrollPositionByPercentage(); // 恢复到相同百分比位置
        e.preventDefault();
        break;
      case '-':
      case '_':
        updateReadingProgress(); // 先保存当前百分比
        changeFontSize(-1);
        saveCompleteReadingState();
        restoreScrollPositionByPercentage(); // 恢复到相同百分比位置
        e.preventDefault();
        break;
      case 't':
      case 'T':
        toggleTheme();
        saveCompleteReadingState();
        requestAnimationFrame(() => applyTypography(getReadingPrefs()));
        requestAnimationFrame(updateReadingProgress);
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
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('settingsClose');
  const paraInput = document.getElementById('paraSpacingInput');
  const letterInput = document.getElementById('letterSpacingInput');
  const paraVal = document.getElementById('paraSpacingVal');
  const letterVal = document.getElementById('letterSpacingVal');
  const resetBtn = document.getElementById('resetReadingPrefsBtn');

  // 初始化导航功能
  initSettingsNavigation();

  const prefs = getReadingPrefs();
  if (paraInput) paraInput.value = String(prefs.paraSpacing);
  if (letterInput) letterInput.value = String(prefs.letterSpacing);
  if (paraVal) paraVal.textContent = `${prefs.paraSpacing}`;
  if (letterVal) letterVal.textContent = `${prefs.letterSpacing}px`;

  applyTypography(prefs);
  updateSettingsStatus();

  // 顶部进度条开关初始化与监听（默认开启）
  const progressToggle = document.getElementById('progressBarToggle');
  const progressEnabled = prefs.progressBarEnabled !== false;
  if (progressToggle) {
    progressToggle.checked = progressEnabled;
    applyProgressBarPreference(progressEnabled);
    progressToggle.addEventListener('change', () => {
      const next = { ...getReadingPrefs(), progressBarEnabled: progressToggle.checked };
      saveReadingPrefs(next);
      applyProgressBarPreference(progressToggle.checked);
      if (typeof saveCompleteReadingState === 'function') {
        saveCompleteReadingState();
      }
    });
  }

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
      const val = Number(paraInput.value);
      const next = { ...getReadingPrefs(), paraSpacing: Math.max(0.4, Math.min(3, val)) };
      if (paraVal) paraVal.textContent = `${next.paraSpacing}`;
      saveReadingPrefs(next);
      applyTypography(next);
      saveCompleteReadingState();
    });
  }
  if (letterInput) {
    letterInput.addEventListener('input', () => {
      const val = Number(letterInput.value);
      const next = { ...getReadingPrefs(), letterSpacing: Math.max(0, Math.min(3, val)) };
      if (letterVal) letterVal.textContent = `${next.letterSpacing}px`;
      saveReadingPrefs(next);
      applyTypography(next);
      saveCompleteReadingState();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const next = { ...defaultPrefs };
      if (paraInput) paraInput.value = String(next.paraSpacing);
      if (letterInput) letterInput.value = String(next.letterSpacing);
      if (paraVal) paraVal.textContent = `${next.paraSpacing}`;
      if (letterVal) letterVal.textContent = `${next.letterSpacing}px`;
      saveReadingPrefs(next);
      applyTypography(next);
      // 重置后也保存完整状态
      saveCompleteReadingState();
      // 更新状态显示
      updateSettingsStatus();
    });
  }
}

// 暴露函数到全局，供 HTML 中的 onclick 使用
window.changeFontSize = (delta) => {
  updateReadingProgress(); // 先保存当前百分比
  changeFontSize(delta);
  saveCompleteReadingState();
  updateSettingsStatus();
  restoreScrollPositionByPercentage(); // 恢复到相同百分比位置
};

window.toggleTheme = () => {
  toggleTheme();
  saveCompleteReadingState();
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

// Setup event listeners
function setupEventListeners() {
  // Core functionality
  document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    initReadingProgress();
    initKeyboardShortcuts();
    initSettingsPanel();
    initSidebarAutoClose();
    applyTypography(getReadingPrefs());

    loadBookshelf().then(() => {
      toggleSidebar(CONFIG.SIDEBAR_VIEWS.BOOKSHELF);
      requestAnimationFrame(updateReadingProgress);
    });

    const readerInnerEl = DOM.readerInner && DOM.readerInner();
    if (readerInnerEl) {
      const observer = new MutationObserver(() => requestAnimationFrame(updateReadingProgress));
      observer.observe(readerInnerEl, { childList: true, subtree: true });
    }
  });
  
  // Sidebar navigation
  const bookshelfBtn = DOM.bookshelfBtn();
  const tocToggleBtn = DOM.tocToggleBtn();
  const bookmarkListBtn = DOM.bookmarkListBtn();
  
  if (bookshelfBtn) {
    bookshelfBtn.addEventListener('click', () => toggleSidebar(CONFIG.SIDEBAR_VIEWS.BOOKSHELF));
  }
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
  
  // Theme and font controls
  const themeToggle = DOM.themeToggle();
  const fontIncreaseBtn = DOM.fontIncreaseBtn();
  const fontDecreaseBtn = DOM.fontDecreaseBtn();
  
  if (themeToggle) {
    themeToggle.addEventListener('click', () => { 
      toggleTheme(); 
      saveCompleteReadingState();
      requestAnimationFrame(() => applyTypography(getReadingPrefs()));
      requestAnimationFrame(updateReadingProgress); 
    });
  }
  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => { 
      updateReadingProgress(); // 先保存当前百分比
      changeFontSize(1); 
      saveCompleteReadingState();
      restoreScrollPositionByPercentage(); // 恢复到相同百分比位置
    });
  }
  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => { 
      updateReadingProgress(); // 先保存当前百分比
      changeFontSize(-1); 
      saveCompleteReadingState();
      restoreScrollPositionByPercentage(); // 恢复到相同百分比位置
    });
  }
  
  // Bookmark and progress controls
  const saveProgressBtn = DOM.saveProgressBtn();
  const addBookmarkBtn = DOM.addBookmarkBtn();
  const clearAllBookmarksBtn = DOM.clearAllBookmarksBtn();
  
  if (saveProgressBtn) {
    saveProgressBtn.addEventListener('click', manualSaveProgress);
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
      // 自动保存完整的阅读状态
      saveCompleteReadingState();
    }
  });
}

// Make necessary functions available globally for HTML onclick handlers
window.openBookFromServer = handleOpenBookFromServer;

// Initialize application
setupEventListeners();

console.log('Local E-book Reader initialized');