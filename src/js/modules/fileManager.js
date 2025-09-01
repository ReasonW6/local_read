// File management and bookshelf operations
import { state, updateState } from '../core/state.js';
import { DOM, CONFIG, getFileKey } from '../core/config.js';

// Get book access history from localStorage
function getBookAccessHistory() {
  try {
    const history = localStorage.getItem(CONFIG.STORAGE_KEYS.BOOK_ACCESS_HISTORY);
    return history ? JSON.parse(history) : {};
  } catch (error) {
    console.warn('Failed to load book access history:', error);
    return {};
  }
}

// Update book access history
function updateBookAccessHistory(bookPath) {
  const history = getBookAccessHistory();
  history[bookPath] = Date.now();
  localStorage.setItem(CONFIG.STORAGE_KEYS.BOOK_ACCESS_HISTORY, JSON.stringify(history));
}

// Load bookshelf from server
export async function loadBookshelf() {
  try {
    const response = await fetch(CONFIG.SERVER_API.BOOKSHELF);
    if (!response.ok) throw new Error('Failed to fetch bookshelf');
    const books = await response.json();
    updateState({ bookshelf: books });
    
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
  
  // 获取访问历史
  const accessHistory = getBookAccessHistory();
  
  // 按访问历史排序，最近访问的在最前面
  const sortedBooks = [...state.bookshelf].sort((a, b) => {
    const aTime = accessHistory[a.path] || 0;
    const bTime = accessHistory[b.path] || 0;
    return bTime - aTime; // 降序排列，最新的在前面
  });
  
  sortedBooks.forEach((book, index) => {
    const el = document.createElement('div');
    el.className = 'book-item';
    
    // 检查是否是当前正在阅读的书籍
    const isCurrentBook = state.currentFileKey === getFileKey(book.path);
    const isRecentlyAccessed = accessHistory[book.path] && index < 5; // 前5本显示为最近访问
    
    if (isCurrentBook) {
      el.classList.add('current-reading');
    } else if (isRecentlyAccessed) {
      el.classList.add('recently-accessed');
    }
    
    // 格式化最后访问时间
    let timeInfo = '';
    if (accessHistory[book.path]) {
      const accessTime = new Date(accessHistory[book.path]);
      const now = new Date();
      const timeDiff = now - accessTime;
      
      if (timeDiff < 60000) { // 1分钟内
        timeInfo = '刚刚阅读';
      } else if (timeDiff < 3600000) { // 1小时内
        timeInfo = `${Math.floor(timeDiff / 60000)}分钟前`;
      } else if (timeDiff < 86400000) { // 24小时内
        timeInfo = `${Math.floor(timeDiff / 3600000)}小时前`;
      } else if (timeDiff < 2592000000) { // 30天内
        timeInfo = `${Math.floor(timeDiff / 86400000)}天前`;
      } else {
        timeInfo = accessTime.toLocaleDateString();
      }
    }
    
    // 创建书籍状态标识
    let statusBadge = '';
    if (isCurrentBook) {
      statusBadge = '<span class="book-status current">正在阅读</span>';
    } else if (index === 0 && accessHistory[book.path]) {
      statusBadge = '<span class="book-status recent">最近阅读</span>';
    }
    
    el.innerHTML = `
      <div style="flex:1">
        <div class="book-title" style="font-weight: ${isCurrentBook ? '700' : '600'}; color: ${isCurrentBook ? 'var(--accent)' : 'inherit'}">${book.name}</div>
        <div class="book-info">
          <span class="book-path">${book.path}</span>
          ${timeInfo ? `<span class="book-time">${timeInfo}</span>` : ''}
        </div>
        ${statusBadge}
      </div>
    `;
    el.onclick = () => window.openBookFromServer(book);
    bookshelfList.appendChild(el);
  });
}

// Load book from server
export async function openBookFromServer(book) {
  try {
    const response = await fetch(`${CONFIG.SERVER_API.BOOK}?path=${encodeURIComponent(book.path)}`);
    if (!response.ok) throw new Error(`Book not found or failed to load: ${book.name}`);
    const fileData = await response.arrayBuffer();
    updateState({ currentFileKey: getFileKey(book.path) });
    
    // 记录访问历史
    updateBookAccessHistory(book.path);
    
    // 更新最后阅读的书籍
    updateState({ lastReadBook: book });
    localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK, JSON.stringify(book));
    
    // 重新渲染书架以更新排序和状态显示
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