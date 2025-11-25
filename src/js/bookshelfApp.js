import { CONFIG } from './core/config.js';
import { formatTimeAgo } from './core/utils.js';
import { initAddBooksModal, openAddBooksModal } from './modules/addBooksModal.js';

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
  fileInput: document.getElementById('bookFileInput'),
  toast: document.getElementById('toast'),
  template: document.getElementById('bookCardTemplate'),
  dragOverlay: document.getElementById('dragOverlay')
};

const THEME_STORAGE_KEY = 'local_reader_theme';

function showToast(message, type = 'info') {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.dataset.type = type;
  els.toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2500);
}

function loadLocalHistory() {
  try {
    const historyRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.READING_HISTORY);
    if (historyRaw) state.readingHistory = JSON.parse(historyRaw);

    const lastRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK);
    if (lastRaw) state.lastReadBook = JSON.parse(lastRaw);
  } catch (error) {
    console.warn('Failed to load history:', error);
  }
}

function applyTheme(theme) {
  state.theme = theme;

  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }

  if (els.themeToggle) {
    els.themeToggle.textContent = theme === 'light' ? '夜间模式' : '日间模式';
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function sortBooks(list) {
  const history = state.readingHistory;
  const sortKey = state.sort;
  return [...list].sort((a, b) => {
    if (sortKey === 'recent') {
      const aTime = history[a.path]?.lastReadTime || 0;
      const bTime = history[b.path]?.lastReadTime || 0;
      if (aTime === bTime) return (b.modifiedAt || 0) - (a.modifiedAt || 0);
      return bTime - aTime;
    }
    if (sortKey === 'title') return a.name.localeCompare(b.name, 'zh-CN');
    return (b.addedAt || 0) - (a.addedAt || 0);
  });
}

function filterBooks(list) {
  if (!state.search) return list;
  const term = state.search.toLowerCase();
  return list.filter(book => book.name.toLowerCase().includes(term));
}

function updateSummary() {
  if (!els.summary) return;
  const total = state.books.length;
  els.summary.textContent = `共 ${total} 本`;
}

async function fetchBooks() {
  const response = await fetch(CONFIG.SERVER_API.BOOKSHELF);
  if (!response.ok) throw new Error('无法加载书架');
  state.books = await response.json();
}

async function loadCover(book, card) {
  const img = card.querySelector('img');
  const placeholder = card.querySelector('.qd-cover-placeholder');

  if (!book.coverAvailable) {
    if (placeholder) {
      placeholder.textContent = book.name[0];
      placeholder.hidden = false;
    }
    if (img) img.hidden = true;
    return;
  }

  const cached = state.covers.get(book.path);
  if (cached) {
    img.src = cached;
    img.hidden = false;
    if (placeholder) placeholder.hidden = true;
    return;
  }

  try {
    const response = await fetch(`${CONFIG.SERVER_API.BOOK_COVER}?path=${encodeURIComponent(book.path)}`);
    if (response.ok) {
      const result = await response.json();
      if (result.cover) {
        state.covers.set(book.path, result.cover);
        img.src = result.cover;
        img.hidden = false;
        if (placeholder) placeholder.hidden = true;
        return;
      }
    }
  } catch (e) {
    console.warn('Cover load failed', e);
  }

  if (placeholder) {
    placeholder.textContent = book.name[0];
    placeholder.hidden = false;
  }
  if (img) img.hidden = true;
}

function createBookCard(book) {
  const fragment = els.template.content.cloneNode(true);
  const card = fragment.querySelector('.qd-book-card');

  const title = card.querySelector('.qd-book-title');
  title.textContent = book.name;
  title.title = book.name;

  const metaInfo = card.querySelector('.meta-info');
  const metaTag = card.querySelector('.meta-tag');

  const history = state.readingHistory[book.path];

  if (state.lastReadBook && state.lastReadBook.path === book.path) {
    metaTag.textContent = '上次阅读';
    metaTag.className = 'qd-tag reading';
    metaInfo.textContent = formatTimeAgo(history?.lastReadTime);
  } else if (history?.lastReadTime) {
    metaInfo.textContent = formatTimeAgo(history.lastReadTime) + '读过';
  } else {
    metaInfo.textContent = '未读';
  }

  const deleteBtn = card.querySelector('.qd-delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteBook(book);
  });

  card.addEventListener('click', () => {
    const url = new URL('reader.html', window.location.href);
    url.searchParams.set('path', book.path);
    url.searchParams.set('name', book.name);
    window.location.href = url.toString();
  });

  loadCover(book, card);
  return card;
}

function renderBookshelf() {
  if (!els.grid) return;
  const sorted = sortBooks(filterBooks(state.books));
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
  if (!confirm(`确认删除《${book.name}》?`)) return;
  try {
    const response = await fetch(`${CONFIG.SERVER_API.BOOK}?path=${encodeURIComponent(book.path)}`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '未知错误' }));
      throw new Error(error.error || '删除失败');
    }
    showToast('删除成功', 'success');
    await refreshBooks();
  } catch (e) {
    console.error('删除书籍失败:', e);
    showToast('删除失败: ' + e.message, 'error');
  }
}

async function uploadBooks(files) {
  if (!files.length) return;
  const formData = new FormData();
  Array.from(files).forEach(f => formData.append('books', f));

  try {
    const res = await fetch(CONFIG.SERVER_API.UPLOAD, { method: 'POST', body: formData });
    if (res.ok) {
      showToast('上传成功', 'success');
      await refreshBooks();
    } else {
      throw new Error('Upload failed');
    }
  } catch (e) {
    showToast('上传失败', 'error');
  } finally {
    if (els.fileInput) els.fileInput.value = '';
  }
}

async function refreshBooks() {
  await fetchBooks();
  updateSummary();
  renderBookshelf();
}

function setupEventListeners() {
  if (els.sort) els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    renderBookshelf();
  });

  if (els.search) els.search.addEventListener('input', () => {
    state.search = els.search.value.trim();
    renderBookshelf();
  });

  // 点击添加书籍按钮打开弹窗
  if (els.addBtn) els.addBtn.addEventListener('click', openAddBooksModal);

  // 保留原有的文件输入（用于拖拽上传）
  if (els.fileInput) els.fileInput.addEventListener('change', (e) => uploadBooks(e.target.files));

  if (els.themeToggle) els.themeToggle.addEventListener('click', () => {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
  });

  // Drag and Drop（页面级别）
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (els.dragOverlay) els.dragOverlay.classList.add('active');
  });

  if (els.dragOverlay) {
    els.dragOverlay.addEventListener('dragleave', (e) => {
      if (e.target === els.dragOverlay) {
        els.dragOverlay.classList.remove('active');
      }
    });

    els.dragOverlay.addEventListener('dragover', (e) => e.preventDefault());

    els.dragOverlay.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dragOverlay.classList.remove('active');
      if (e.dataTransfer.files.length) {
        uploadBooks(e.dataTransfer.files);
      }
    });
  }
  
  // 初始化添加书籍弹窗（传入上传处理函数）
  initAddBooksModal(async (files) => {
    await uploadBooks(files);
  });
}

async function init() {
  loadLocalHistory();
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  applyTheme(savedTheme);
  setupEventListeners();
  await refreshBooks();
}

init();
