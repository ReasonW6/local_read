import { CONFIG } from './core/config.js';

const state = {
  books: [],
  filtered: [],
  sort: 'recent',
  search: '',
  covers: new Map(),
  readingHistory: {},
  lastReadBook: null,
  theme: 'light'
};

const els = {
  grid: document.getElementById('bookshelfGrid'),
  empty: document.getElementById('bookshelfEmpty'),
  summary: document.getElementById('bookshelfSummary'),
  sort: document.getElementById('sortSelect'),
  search: document.getElementById('bookSearchInput'),
  themeToggle: document.getElementById('themeToggle'),
  addBtn: document.getElementById('addBookBtn'),
  emptyAddBtn: document.getElementById('emptyAddBtn'),
  fileInput: document.getElementById('bookFileInput'),
  toast: document.getElementById('toast'),
  template: document.getElementById('bookCardTemplate')
};

const THEME_STORAGE_KEY = 'local_reader_theme';

function showToast(message, type = 'info') {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.dataset.type = type;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('show'));
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.classList.remove('show');
    setTimeout(() => {
      els.toast.hidden = true;
    }, 200);
  }, 2600);
}

function formatFileSize(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '尚未阅读';
  const diff = Date.now() - Number(timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < week) return `${Math.floor(diff / day)} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function loadLocalHistory() {
  try {
    const historyRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.READING_HISTORY);
    if (historyRaw) {
      state.readingHistory = JSON.parse(historyRaw);
    }
  } catch (error) {
    console.warn('Failed to load reading history:', error);
    state.readingHistory = {};
  }

  try {
    const lastRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK);
    if (lastRaw) {
      state.lastReadBook = JSON.parse(lastRaw);
    }
  } catch (error) {
    console.warn('Failed to load last read book:', error);
    state.lastReadBook = null;
  }
}

function applyTheme(theme) {
  state.theme = theme;
  document.body.dataset.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  if (els.themeToggle) {
    const label = els.themeToggle.querySelector('span');
    if (label) {
      label.textContent = theme === 'light' ? '夜间' : '日间';
    }
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

async function initializeTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    applyTheme(stored);
    return;
  }
  try {
    const response = await fetch('/api/load-config/user-config.json');
    if (response.ok) {
      const { config } = await response.json();
      const theme = config?.settings?.theme;
      if (theme === 'light' || theme === 'dark') {
        applyTheme(theme);
        return;
      }
    }
  } catch (error) {
    console.warn('Unable to load theme from config:', error);
  }
  applyTheme('light');
}

function sortBooks(list) {
  const history = state.readingHistory;
  const sortKey = state.sort;
  return [...list].sort((a, b) => {
    if (sortKey === 'recent') {
      const aTime = history[a.path]?.lastReadTime || 0;
      const bTime = history[b.path]?.lastReadTime || 0;
      if (aTime === bTime) {
        return (b.modifiedAt || 0) - (a.modifiedAt || 0);
      }
      return bTime - aTime;
    }
    if (sortKey === 'title') {
      return a.name.localeCompare(b.name, 'zh-CN');
    }
    // added
    return (b.addedAt || 0) - (a.addedAt || 0);
  });
}

function filterBooks(list) {
  if (!state.search) return list;
  const term = state.search.toLowerCase();
  return list.filter(book => book.name.toLowerCase().includes(term) || book.path.toLowerCase().includes(term));
}

function updateSummary() {
  if (!els.summary) return;
  const total = state.books.length;
  const readCount = Object.keys(state.readingHistory).length;
  const lastLabel = state.lastReadBook?.name ? `最近阅读：《${state.lastReadBook.name}》` : '尚未记录最近阅读';
  els.summary.textContent = `共 ${total} 本书 · ${readCount} 本有阅读记录 · ${lastLabel}`;
}

async function fetchBooks() {
  const response = await fetch(CONFIG.SERVER_API.BOOKSHELF);
  if (!response.ok) {
    throw new Error('无法加载书架');
  }
  const books = await response.json();
  state.books = Array.isArray(books) ? books : [];
}

async function loadCover(book, card) {
  if (!card) return;
  const coverEl = card.querySelector('.book-cover');
  const img = card.querySelector('img');
  const placeholder = card.querySelector('.cover-placeholder');

  if (!coverEl || !img) return;

  if (!book.coverAvailable) {
    state.covers.set(book.path, null);
    if (placeholder) {
      placeholder.textContent = deriveInitial(book.name);
      placeholder.hidden = false;
    }
    return;
  }

  const cached = state.covers.get(book.path);
  if (cached !== undefined) {
    if (cached) {
      img.src = cached;
      coverEl.classList.add('has-cover');
      if (placeholder) placeholder.hidden = true;
    }
    return;
  }

  try {
    const response = await fetch(`${CONFIG.SERVER_API.BOOK_COVER}?path=${encodeURIComponent(book.path)}`);
    if (!response.ok) throw new Error('Cover request failed');
    const result = await response.json();
    const cover = result?.cover || null;
    state.covers.set(book.path, cover);
    if (cover) {
      img.src = cover;
      coverEl.classList.add('has-cover');
      if (placeholder) placeholder.hidden = true;
    } else if (placeholder) {
      placeholder.textContent = deriveInitial(book.name);
      placeholder.hidden = false;
    }
  } catch (error) {
    state.covers.set(book.path, null);
    if (placeholder) {
      placeholder.textContent = deriveInitial(book.name);
      placeholder.hidden = false;
    }
    console.warn('Failed to load cover for', book.path, error);
  }
}

function deriveInitial(name = '') {
  const clean = name.trim();
  if (!clean) return '📕';
  const first = clean[0];
  if (/^[\da-zA-Z]$/.test(first)) {
    return first.toUpperCase();
  }
  return first;
}

function renderTags(book, container) {
  if (!container) return;
  container.innerHTML = '';
  const history = state.readingHistory[book.path];
  const tags = [];

  if (state.lastReadBook && state.lastReadBook.path === book.path) {
    tags.push({ label: '上次阅读', className: 'tag tag-accent' });
  }
  if (history?.lastReadTime) {
    tags.push({ label: `最近 ${formatTimeAgo(history.lastReadTime)}`, className: 'tag tag-info' });
  }
  if (history?.readCount) {
    tags.push({ label: `阅读 ${history.readCount} 次`, className: 'tag tag-muted' });
  }
  if (tags.length === 0) {
    tags.push({ label: '尚未阅读', className: 'tag tag-muted' });
  }

  tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = tag.className;
    span.textContent = tag.label;
    container.appendChild(span);
  });
}

function createBookCard(book) {
  if (!els.template) return null;
  const fragment = els.template.content.cloneNode(true);
  const card = fragment.querySelector('.book-card');
  if (!card) return null;

  card.dataset.path = book.path;
  card.dataset.name = book.name;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const placeholder = card.querySelector('.cover-placeholder');
  if (placeholder) {
    placeholder.textContent = deriveInitial(book.name);
  }

  const img = card.querySelector('img');
  if (img) {
    img.alt = `${book.name} 封面`;
  }

  const titleEl = card.querySelector('.book-title');
  if (titleEl) {
    titleEl.textContent = book.name;
  }

  const metaEl = card.querySelector('.book-meta');
  if (metaEl) {
    const sizeLine = formatFileSize(book.size);
    const addedLine = book.addedAt ? new Date(book.addedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric' }) : '';
    const location = book.path.split(/[\\/]/).slice(0, -1).join('/') || '书架根目录';
    metaEl.innerHTML = '';

    const locationSpan = document.createElement('span');
    locationSpan.textContent = location;
    locationSpan.title = book.path;

    const detailSpan = document.createElement('span');
    detailSpan.textContent = addedLine ? `${sizeLine} · 添加于 ${addedLine}` : sizeLine;

    metaEl.appendChild(locationSpan);
    metaEl.appendChild(detailSpan);
  }

  renderTags(book, card.querySelector('.book-tags'));

  if (state.lastReadBook && state.lastReadBook.path === book.path) {
    card.classList.add('book-card--last-read');
  }

  const deleteBtn = card.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleDeleteBook(book);
    });
  }

  card.addEventListener('click', () => {
    const url = new URL('reader.html', window.location.href);
    url.searchParams.set('path', book.path);
    url.searchParams.set('name', book.name);
    if (state.theme) {
      url.searchParams.set('theme', state.theme);
    }
    window.location.href = url.toString();
  });

  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      card.click();
    }
  });

  loadCover(book, card);
  return card;
}

function renderBookshelf() {
  if (!els.grid) return;
  const sorted = sortBooks(filterBooks(state.books));
  state.filtered = sorted;
  els.grid.innerHTML = '';

  if (sorted.length === 0) {
    if (els.empty) els.empty.hidden = false;
    return;
  }

  if (els.empty) els.empty.hidden = true;
  const fragment = document.createDocumentFragment();
  sorted.forEach(book => {
    const card = createBookCard(book);
    if (card) fragment.appendChild(card);
  });
  els.grid.appendChild(fragment);
}

async function handleDeleteBook(book) {
  const confirmed = window.confirm(`确认删除《${book.name}》?\n该操作会从磁盘移除该文件。`);
  if (!confirmed) return;
  try {
    const response = await fetch(`${CONFIG.SERVER_API.BOOK}?path=${encodeURIComponent(book.path)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('删除失败');
    showToast(`已删除《${book.name}》`, 'success');
    state.covers.delete(book.path);
    await refreshBooks();
  } catch (error) {
    console.error(error);
    showToast('删除书籍失败，请稍后重试', 'error');
  }
}

async function uploadBooks(files) {
  if (!files || files.length === 0) return;
  const formData = new FormData();
  Array.from(files).forEach(file => formData.append('books', file));
  try {
    const response = await fetch(CONFIG.SERVER_API.UPLOAD, {
      method: 'POST',
      body: formData
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || '上传失败');
    }
    const result = await response.json();
    showToast(result.message || '上传成功', 'success');
    await refreshBooks();
  } catch (error) {
    console.error('Upload failed:', error);
    showToast(error.message || '上传失败，请稍后再试', 'error');
  } finally {
    if (els.fileInput) {
      els.fileInput.value = '';
    }
  }
}

async function refreshBooks() {
  await fetchBooks();
  updateSummary();
  renderBookshelf();
}

function setupEventListeners() {
  if (els.sort) {
    els.sort.addEventListener('change', () => {
      state.sort = els.sort.value;
      renderBookshelf();
    });
  }

  if (els.search) {
    els.search.addEventListener('input', () => {
      state.search = els.search.value.trim().toLowerCase();
      renderBookshelf();
    });
  }

  const triggerUpload = () => {
    els.fileInput?.click();
  };

  if (els.addBtn) {
    els.addBtn.addEventListener('click', triggerUpload);
  }

  if (els.emptyAddBtn) {
    els.emptyAddBtn.addEventListener('click', triggerUpload);
  }

  if (els.fileInput) {
    els.fileInput.addEventListener('change', (event) => {
      const input = event.target;
      uploadBooks(input.files);
    });
  }

  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', () => {
      const next = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
    });
  }

  const dropZone = document.querySelector('.bookshelf-main');
  if (dropZone) {
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, prevent, false);
    });
    let dragDepth = 0;
    dropZone.addEventListener('dragenter', () => {
      dragDepth += 1;
      dropZone.classList.add('drag-active');
    });
    dropZone.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        dropZone.classList.remove('drag-active');
      }
    });
    dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-active'));
    dropZone.addEventListener('drop', (event) => {
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        uploadBooks(files);
      }
      dragDepth = 0;
      dropZone.classList.remove('drag-active');
    });
  }
}

async function init() {
  loadLocalHistory();
  await initializeTheme();
  setupEventListeners();
  try {
    await refreshBooks();
  } catch (error) {
    console.error(error);
    showToast(error.message || '书架加载失败', 'error');
  }
}

init();
