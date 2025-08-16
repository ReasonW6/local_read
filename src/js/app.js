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
import { toggleSidebar, closeSidebarIfBookshelf } from './modules/uiController.js';

// Manual save progress function
function manualSaveProgress() {
  if (state.type === 'epub') {
    manualSaveEpubProgress();
  } else if (state.type === 'txt') {
    manualSaveTxtProgress();
  }
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

// Setup event listeners
function setupEventListeners() {
  // Core functionality
  document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    loadBookshelf().then(() => {
      toggleSidebar(CONFIG.SIDEBAR_VIEWS.BOOKSHELF);
    });
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
    themeToggle.addEventListener('click', toggleTheme);
  }
  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => changeFontSize(1));
  }
  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => changeFontSize(-1));
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