// File management and bookshelf operations
import { state, updateState } from '../core/state.js';
import { DOM, CONFIG, getFileKey } from '../core/config.js';

// Load reading history from localStorage
export function loadReadingHistory() {
  try {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.READING_HISTORY);
    if (stored) {
      const readingHistory = JSON.parse(stored);
      updateState({ readingHistory });
    }
  } catch (e) {
    console.warn('Failed to load reading history:', e);
    updateState({ readingHistory: {} });
  }
}

// Save reading history to localStorage
export function saveReadingHistory() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEYS.READING_HISTORY, JSON.stringify(state.readingHistory));
  } catch (e) {
    console.warn('Failed to save reading history:', e);
  }
}

// Update reading history for a book
export function updateReadingHistory(book) {
  const now = Date.now();
  const history = { ...state.readingHistory };
  
  if (history[book.path]) {
    history[book.path].lastReadTime = now;
    history[book.path].readCount = (history[book.path].readCount || 0) + 1;
  } else {
    history[book.path] = {
      name: book.name,
      path: book.path,
      lastReadTime: now,
      readCount: 1
    };
  }
  
  updateState({ 
    readingHistory: history,
    currentlyReading: book.path
  });
  saveReadingHistory();
}

// Load bookshelf from server
export async function loadBookshelf() {
  try {
    const response = await fetch(CONFIG.SERVER_API.BOOKSHELF);
    if (!response.ok) throw new Error('Failed to fetch bookshelf');
    const books = await response.json();
    updateState({ bookshelf: books });
    
    // 加载阅读历史
    loadReadingHistory();
    
    // 应用启动时清除当前正在阅读状态，避免显示错误的"正在阅读"标识
    updateState({ currentlyReading: null });
    
    // 清理阅读历史中已不存在的书籍
    cleanupReadingHistory(books);
    
    // 加载最后阅读的书籍信息
    loadLastReadBook();
    renderBookshelf();
    return books;
  } catch (error) {
    console.error('Error loading bookshelf:', error);
    const bookshelfList = DOM.bookshelfList();
    if (bookshelfList) {
      bookshelfList.innerHTML = `<div class="muted" style="padding:10px;">加载书架失败。请确保服务器已运行，且'books'文件夹存在。</div>`;
    }
    throw error;
  }
}

// Render bookshelf UI
export function renderBookshelf() {
  const bookshelfList = DOM.bookshelfList();
  if (!bookshelfList) return;
  
  bookshelfList.innerHTML = '';
  if (state.bookshelf.length === 0) {
    bookshelfList.innerHTML = '<div class="muted" style="padding: 10px;">书架为空，请将书籍文件放入 "books" 文件夹后点击 "刷新书架"。</div>';
    return;
  }
  
  // 按阅读历史排序：当前正在阅读的书籍最前，然后按最后阅读时间排序，未读过的书籍最后
  const sortedBooks = [...state.bookshelf].sort((a, b) => {
    const aIsCurrentlyReading = state.currentlyReading === a.path;
    const bIsCurrentlyReading = state.currentlyReading === b.path;
    
    // 当前正在阅读的书籍排在最前面（实际阅读中才会有这个状态）
    if (aIsCurrentlyReading && !bIsCurrentlyReading) return -1;
    if (!aIsCurrentlyReading && bIsCurrentlyReading) return 1;
    
    // 按阅读历史排序（最近阅读的在前）
    const aHistory = state.readingHistory[a.path];
    const bHistory = state.readingHistory[b.path];
    
    // 有阅读历史的排在无阅读历史的前面
    if (aHistory && !bHistory) return -1;
    if (!aHistory && bHistory) return 1;
    
    // 都有阅读历史，按最后阅读时间降序排列（最近阅读的在前）
    if (aHistory && bHistory) {
      return bHistory.lastReadTime - aHistory.lastReadTime;
    }
    
    // 都没有阅读历史，按名称排序
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  
  sortedBooks.forEach((book) => {
    const el = document.createElement('div');
    el.className = 'book-item';
    
    // 检查书籍状态
    const isCurrentlyReading = state.currentlyReading === book.path;
    const history = state.readingHistory[book.path];
    const isLastRead = !isCurrentlyReading && state.lastReadBook && book.path === state.lastReadBook.path;
    
    // 应用样式类
    if (isCurrentlyReading) {
      el.classList.add('currently-reading');
    } else if (isLastRead) {
      el.classList.add('last-read');
    } else if (history) {
      el.classList.add('has-history');
    }
    
    // 构建显示信息
    let statusInfo = '';
    if (isCurrentlyReading) {
      statusInfo = '<span class="reading-status">📖 正在阅读</span>';
    } else if (isLastRead) {
      statusInfo = '<span class="last-read-status">📚 上次阅读</span>';
    } else if (history) {
      const timeAgo = formatTimeAgo(history.lastReadTime);
      statusInfo = `<span class="reading-history">📖 ${timeAgo}</span>`;
    }
    
    el.innerHTML = `
      <div style="flex:1">
        <div class="book-title" style="font-weight:600">${book.name}</div>
        <div class="muted book-path" style="font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${book.path}</div>
        ${statusInfo ? `<div class="book-status" style="font-size:11px; margin-top:2px;">${statusInfo}</div>` : ''}
      </div>
    `;
    el.onclick = () => window.openBookFromServer(book);
    bookshelfList.appendChild(el);
  });
}

// 格式化时间为相对时间
function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  
  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  } else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  } else if (diff < week) {
    return `${Math.floor(diff / day)}天前`;
  } else if (diff < month) {
    return `${Math.floor(diff / week)}周前`;
  } else {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

// Load book from server
export async function openBookFromServer(book) {
  try {
    const response = await fetch(`${CONFIG.SERVER_API.BOOK}?path=${encodeURIComponent(book.path)}`);
    if (!response.ok) throw new Error(`Book not found or failed to load: ${book.name}`);
    const fileData = await response.arrayBuffer();
    updateState({ currentFileKey: getFileKey(book.path) });
    
    // 更新阅读历史
    updateReadingHistory(book);
    
    // 清除"上次阅读"标识，因为现在有新的正在阅读的书籍了
    updateState({ lastReadBook: null });
    localStorage.removeItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK);
    
    // 重新渲染书架以显示最新的阅读状态
    renderBookshelf();
    
    // Set book metadata
    const bookMeta = DOM.bookMeta();
    if (bookMeta) {
      bookMeta.textContent = `书名: ${book.name}`;
    }
    
    return { book, fileData };
  } catch (error) {
    console.error('Error opening book from server:', error);
    alert(`打开书籍 "${book.name}" 失败: ${error.message}`);
    throw error;
  }
}

// Read ArrayBuffer with encoding detection
export async function readArrayBufferWithEncoding(arrayBuffer) {
  const decoderUtf8 = new TextDecoder('utf-8', { fatal: true });
  try { 
    return decoderUtf8.decode(arrayBuffer); 
  } catch (e) {
    console.log("UTF-8 decoding failed, trying GBK...");
    const decoderGbk = new TextDecoder('gbk');
    return decoderGbk.decode(arrayBuffer);
  }
}

// Save and load last read book
export function saveLastReadBook(book) {
  try {
    const lastReadData = {
      path: book.path,
      name: book.name,
      timestamp: Date.now()
    };
    localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK, JSON.stringify(lastReadData));
    updateState({ lastReadBook: lastReadData });
  } catch (e) {
    console.warn('Failed to save last read book:', e);
  }
}

export function loadLastReadBook() {
  try {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK);
    if (stored) {
      const lastReadBook = JSON.parse(stored);
      // 验证书籍是否仍在书架上
      const bookExists = state.bookshelf.some(book => book.path === lastReadBook.path);
      if (!bookExists) {
        // 如果书籍不在当前书架上，清除记录
        updateState({ lastReadBook: null });
        localStorage.removeItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK);
      } else {
        updateState({ lastReadBook });
      }
    }
  } catch (e) {
    console.warn('Failed to load last read book:', e);
    updateState({ lastReadBook: null });
  }
}

// Progress saving and loading
export function saveProgress(key, data) { 
  if (!key) return; 
  try { 
    localStorage.setItem(key, JSON.stringify(data)); 
    const indicator = document.getElementById('save-indicator');
    if (indicator) {
      indicator.style.opacity = '1';
      setTimeout(() => { indicator.style.opacity = '0'; }, 1500);
    }
  } catch (e) { 
    console.warn(e); 
  } 
}

export function loadProgress(key) { 
  if (!key) return null; 
  try { 
    const raw = localStorage.getItem(key); 
    return raw ? JSON.parse(raw) : null; 
  } catch (e) { 
    return null; 
  } 
}

// 清理阅读历史中已不存在的书籍
function cleanupReadingHistory(currentBooks) {
  const currentBookPaths = new Set(currentBooks.map(book => book.path));
  const history = { ...state.readingHistory };
  let hasChanges = false;
  
  // 移除不存在的书籍历史记录
  Object.keys(history).forEach(path => {
    if (!currentBookPaths.has(path)) {
      delete history[path];
      hasChanges = true;
    }
  });
  
  // 清理当前正在阅读的书籍标记
  if (state.currentlyReading && !currentBookPaths.has(state.currentlyReading)) {
    updateState({ currentlyReading: null });
    hasChanges = true;
  }
  
  if (hasChanges) {
    updateState({ readingHistory: history });
    saveReadingHistory();
  }
}