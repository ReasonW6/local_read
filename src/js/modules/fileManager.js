// File management and bookshelf operations
import { state, updateState } from '../core/state.js';
import { DOM, CONFIG, getFileKey } from '../core/config.js';

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
  
  // 按最后阅读状态排序，最后阅读的书籍排在最前面
  const sortedBooks = [...state.bookshelf].sort((a, b) => {
    const aIsLastRead = state.lastReadBook && a.path === state.lastReadBook.path;
    const bIsLastRead = state.lastReadBook && b.path === state.lastReadBook.path;
    if (aIsLastRead && !bIsLastRead) return -1;
    if (!aIsLastRead && bIsLastRead) return 1;
    return 0;
  });
  
  sortedBooks.forEach((book) => {
    const el = document.createElement('div');
    el.className = 'book-item';
    
    // 检查是否是最后阅读的书籍
    const isLastRead = state.lastReadBook && book.path === state.lastReadBook.path;
    if (isLastRead) {
      el.classList.add('last-read');
    }
    
    el.innerHTML = `
      <div style="flex:1">
        <div class="${isLastRead ? 'book-title' : ''}" style="font-weight:600">${book.name}</div>
        <div class="muted" style="font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${book.path}</div>
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
    
    // 检查是否是最近阅读的书籍，如果是则清除标识
    const wasLastRead = state.lastReadBook && book.path === state.lastReadBook.path;
    if (wasLastRead) {
      // 清除最近阅读标识
      updateState({ lastReadBook: null });
      localStorage.removeItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK);
      // 重新渲染书架以移除"最近阅读"标识
      renderBookshelf();
    }
    
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