// Configuration constants and DOM element references
export const DOM = {
  toc: () => document.getElementById('toc'),
  reader: () => document.getElementById('reader'),
  readerInner: () => document.getElementById('readerInner'),
  bookshelfList: () => document.getElementById('bookshelfList'),
  sidebar: () => document.getElementById('sidebar'),
  tocToggleBtn: () => document.getElementById('tocToggleBtn'),
  bookshelfBtn: () => document.getElementById('bookshelfBtn'),
  bookmarkListBtn: () => document.getElementById('bookmarkListBtn'),
  themeToggle: () => document.getElementById('themeToggle'),
  bookMeta: () => document.getElementById('book-meta'),
  chapterNav: () => document.getElementById('chapter-nav'),
  refreshBookshelfBtn: () => document.getElementById('refreshBookshelfBtn'),
  fontIncreaseBtn: () => document.getElementById('fontIncreaseBtn'),
  fontDecreaseBtn: () => document.getElementById('fontDecreaseBtn'),
  saveProgressBtn: () => document.getElementById('saveProgressBtn'),
  addBookmarkBtn: () => document.getElementById('addBookmarkBtn'),
  bookmarkList: () => document.getElementById('bookmarkList'),
  clearAllBookmarksBtn: () => document.getElementById('clearAllBookmarksBtn')
};

// Configuration constants
export const CONFIG = {
  MIN_FONT_SIZE: 12,
  MAX_FONT_SIZE: 32,
  SERVER_API: {
    BOOKSHELF: '/api/bookshelf',
    BOOK: '/api/book'
  },
  STORAGE_KEYS: {
    BOOKMARKS: 'bookmarks',
    LAST_READ_BOOK: 'lastReadBook'
  },
  THEMES: {
    LIGHT: 'light',
    DARK: 'dark'
  },
  SIDEBAR_VIEWS: {
    TOC: 'toc',
    BOOKSHELF: 'bookshelf',
    BOOKMARK: 'bookmark'
  }
};

// Utility function to get file key for storage
export function getFileKey(bookPath) { 
  return 'server_reader_' + bookPath; 
}