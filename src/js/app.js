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
import { toggleTheme, changeFontSize, initializeTheme } from './modules/themeManager.js';
import { 
  addBookmark, 
  clearAllBookmarks, 
  loadBookmarks 
} from './modules/bookmarkManager.js';
import { toggleSidebar, closeSidebarIfBookshelf, goToNextChapter, goToPreviousChapter } from './modules/uiController.js';

// Manual save progress function
function manualSaveProgress() {
  if (state.type === 'epub') {
    manualSaveEpubProgress();
  } else if (state.type === 'txt') {
    manualSaveTxtProgress();
  }
  showSavedIndicator();
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
    }
    
    // 关闭侧边栏（如果当前显示的是书架）
    closeSidebarIfBookshelf();
    // 应用当前阅读排版偏好（EPUB 将注入样式，TXT 走 CSS 变量）
    requestAnimationFrame(() => applyTypography(getReadingPrefs()));
    
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

/** 阅读进度条 */
function updateReadingProgress() {
  const scroller = document.querySelector('.main');
  const bar = document.getElementById('readingProgressBar');
  const text = document.getElementById('readingProgressText');
  if (!scroller || (!bar && !text)) return;
  const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  const pct = Math.min(100, Math.max(0, (scroller.scrollTop / max) * 100));
  if (bar) bar.style.width = pct.toFixed(2) + '%';
  if (text) text.textContent = Math.round(pct) + '%';
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
        changeFontSize(1);
        requestAnimationFrame(updateReadingProgress);
        e.preventDefault();
        break;
      case '-':
      case '_':
        changeFontSize(-1);
        requestAnimationFrame(updateReadingProgress);
        e.preventDefault();
        break;
      case 't':
      case 'T':
        toggleTheme();
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

function initSettingsPanel() {
  const settingsBtn = document.getElementById('settingsBtn');
  const mask = document.getElementById('settingsMask');
  const drawer = document.getElementById('settingsDrawer');
  const paraInput = document.getElementById('paraSpacingInput');
  const letterInput = document.getElementById('letterSpacingInput');
  const paraVal = document.getElementById('paraSpacingVal');
  const letterVal = document.getElementById('letterSpacingVal');
  const resetBtn = document.getElementById('resetReadingPrefsBtn');

  const prefs = getReadingPrefs();
  if (paraInput) paraInput.value = String(prefs.paraSpacing);
  if (letterInput) letterInput.value = String(prefs.letterSpacing);
  if (paraVal) paraVal.textContent = `${prefs.paraSpacing}`;
  if (letterVal) letterVal.textContent = `${prefs.letterSpacing}px`;

  applyTypography(prefs);

  function openSettings() {
    if (mask) mask.classList.add('show');
    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
  }
  function closeSettings() {
    if (mask) mask.classList.remove('show');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
  }

  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (mask) mask.addEventListener('click', closeSettings);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) {
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
    });
  }
  if (letterInput) {
    letterInput.addEventListener('input', () => {
      const val = Number(letterInput.value);
      const next = { ...getReadingPrefs(), letterSpacing: Math.max(0, Math.min(3, val)) };
      if (letterVal) letterVal.textContent = `${next.letterSpacing}px`;
      saveReadingPrefs(next);
      applyTypography(next);
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
    });
  }
}


// Setup event listeners
function setupEventListeners() {
  // Core functionality
  document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    initReadingProgress();
    initKeyboardShortcuts();
    initSettingsPanel();
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
      requestAnimationFrame(() => applyTypography(getReadingPrefs()));
      requestAnimationFrame(updateReadingProgress); 
    });
  }
  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => { 
      changeFontSize(1); 
      requestAnimationFrame(updateReadingProgress); 
    });
  }
  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => { 
      changeFontSize(-1); 
      requestAnimationFrame(updateReadingProgress); 
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
    }
  });
}

// Make necessary functions available globally for HTML onclick handlers
window.openBookFromServer = handleOpenBookFromServer;

// Initialize application
setupEventListeners();

console.log('Local E-book Reader initialized');