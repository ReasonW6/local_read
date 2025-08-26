// Bookmark management functionality
import { state, updateState } from '../core/state.js';
import { DOM, CONFIG } from '../core/config.js';

// Get current reading location
export function getCurrentReadingLocation() {
  if (state.type === 'epub' && state.rendition) {
    const location = state.rendition.currentLocation();
    if (location && location.start) {
      return {
        type: 'epub',
        cfi: location.start.cfi,
        href: location.start.href,
        chapterTitle: state.chapters[state.currentIndex]?.label || '未知章节'
      };
    }
  } else if (state.type === 'txt') {
    return {
      type: 'txt',
      chapterIndex: state.currentIndex,
      chapterTitle: state.chapters[state.currentIndex]?.label || '未知章节'
    };
  } else if (state.type === 'pdf') {
    return {
      type: 'pdf',
      pageIndex: state.currentIndex,
      chapterTitle: state.chapters[state.currentIndex]?.label || `第${state.currentIndex + 1}页`
    };
  }
  return null;
}

// Add bookmark
export function addBookmark() {
  if (!state.currentFileKey || !state.chapters.length) {
    alert('请先打开一本书');
    return;
  }

  const location = getCurrentReadingLocation();
  if (!location) {
    alert('无法获取当前阅读位置');
    return;
  }

  // 生成简单的用户输入对话框来命名书签
  let bookmarkTitle = prompt('请为书签命名 (留空将使用默认名称):', location.chapterTitle);
  if (bookmarkTitle === null) return; // 用户取消

  if (!bookmarkTitle.trim()) {
    bookmarkTitle = location.chapterTitle;
  }

  let level = parseInt(prompt('选择书签级别：1=一级, 2=二级, 3=三级', '1') || '1', 10);
  if (isNaN(level) || level < 1) level = 1;
  if (level > 3) level = 3;

  const bookmark = {
    id: Date.now().toString(),
    title: bookmarkTitle.trim(),
    level: level,
    bookKey: state.currentFileKey,
    bookName: state.book ? (state.book.package ? state.book.package.metadata.title : '当前书籍') : '当前书籍',
    location: location,
    createdAt: new Date().toLocaleString('zh-CN')
  };

  // 保存书签
  saveBookmark(bookmark);
  
  // 显示成功提示
  showIndicator('书签已添加');

  // 如果书签面板是打开的，刷新显示
  const sidebar = DOM.sidebar();
  if (state.sidebarView === CONFIG.SIDEBAR_VIEWS.BOOKMARK && sidebar && sidebar.classList.contains('visible')) {
    renderBookmarkList();
  }
}

// Save bookmark to localStorage
export function saveBookmark(bookmark) {
  const bookmarks = getBookmarksForCurrentBook();
  bookmarks.push(bookmark);
  
  try {
    const allBookmarks = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.BOOKMARKS) || '{}');
    allBookmarks[state.currentFileKey] = bookmarks;
    localStorage.setItem(CONFIG.STORAGE_KEYS.BOOKMARKS, JSON.stringify(allBookmarks));
  } catch (e) {
    console.warn('Failed to save bookmark:', e);
  }
}

// Get bookmarks for current book
export function getBookmarksForCurrentBook() {
  if (!state.currentFileKey) return [];
  
  try {
    const allBookmarks = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.BOOKMARKS) || '{}');
    return allBookmarks[state.currentFileKey] || [];
  } catch (e) {
    console.warn('Failed to load bookmarks:', e);
    return [];
  }
}

// Load and display bookmark list
export function loadBookmarks() {
  const bookmarks = getBookmarksForCurrentBook();
  updateState({ bookmarks });
  renderBookmarkList();
}

// Render bookmark list
export function renderBookmarkList() {
  const bookmarkList = DOM.bookmarkList();
  if (!bookmarkList) return;
  
  bookmarkList.innerHTML = '';
  
  if (state.bookmarks.length === 0) {
    bookmarkList.innerHTML = '<div class="muted" style="padding: 10px;">暂无书签，在阅读时点击"书签"按钮添加。</div>';
    return;
  }
  
  // 按创建时间倒序排列（最新的在前面）
  const sortedBookmarks = [...state.bookmarks].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  sortedBookmarks.forEach(bookmark => {
    const el = document.createElement('div');
    const lvl = bookmark.level || 1;
    el.className = 'bookmark-item level-' + lvl;
    el.style.paddingLeft = ((lvl - 1) * 12) + 'px';
    el.innerHTML = `
      <div class="bookmark-title"><span style="display:inline-block;min-width:28px;padding:2px 6px;margin-right:6px;border-radius:10px;font-size:12px;opacity:.7;background:rgba(127,127,127,.15);">Lv${lvl}</span>${bookmark.title}</div>
      <div class="bookmark-location">${bookmark.location.chapterTitle}</div>
      <div class="bookmark-time">${bookmark.createdAt}</div>
      <button class="bookmark-delete" onclick="window.removeBookmark('${bookmark.id}')" title="删除书签">×</button>
    `;
    
    el.onclick = (e) => {
      if (e.target.className !== 'bookmark-delete') {
        goToBookmark(bookmark);
      }
    };
    
    bookmarkList.appendChild(el);
  });
}

// Go to bookmark location
export function goToBookmark(bookmark) {
  if (!bookmark.location) return;
  
  const location = bookmark.location;
  
  if (location.type === 'epub' && state.type === 'epub' && state.rendition) {
    updateState({ isNavigating: true });
    state.rendition.display(location.cfi).then(() => {
      // 更新当前章节索引
      const spineItem = state.book.spine.get(location.href);
      if (spineItem) {
        updateState({ currentIndex: spineItem.index });
        // Import here to avoid circular dependency
        import('./uiController.js').then(({ updateActiveTOC, renderChapterNav }) => {
          updateActiveTOC();
          renderChapterNav();
        });
      }
      setTimeout(() => {
        updateState({ isNavigating: false });
      }, 100);
    });
  } else if (location.type === 'txt' && state.type === 'txt') {
    // Import here to avoid circular dependency
    import('./txtReader.js').then(({ goToTxtChapter }) => {
      goToTxtChapter(location.chapterIndex);
    });
  } else if (location.type === 'pdf' && state.type === 'pdf') {
    import('./pdfReader.js').then(({ goToPdfChapter }) => {
      const idx = typeof location.pageIndex === 'number' ? location.pageIndex : 0;
      goToPdfChapter(idx);
    });
  }
  
  // 关闭侧边栏
  const sidebar = DOM.sidebar();
  if (sidebar) {
    sidebar.classList.remove('visible');
  }
}

// Remove bookmark
export function removeBookmark(bookmarkId) {
  if (!confirm('确定要删除这个书签吗？')) return;
  
  try {
    const allBookmarks = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.BOOKMARKS) || '{}');
    const currentBookmarks = allBookmarks[state.currentFileKey] || [];
    
    allBookmarks[state.currentFileKey] = currentBookmarks.filter(b => b.id !== bookmarkId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.BOOKMARKS, JSON.stringify(allBookmarks));
    
    // 更新状态并重新渲染
    loadBookmarks();
    
    // 显示删除成功提示
    showIndicator('书签已删除');
  } catch (e) {
    console.warn('Failed to remove bookmark:', e);
    alert('删除书签失败');
  }
}

// Clear all bookmarks for current book
export function clearAllBookmarks() {
  if (state.bookmarks.length === 0) {
    alert('当前书籍没有书签');
    return;
  }
  
  if (!confirm(`确定要清空当前书籍的所有 ${state.bookmarks.length} 个书签吗？此操作不可撤销。`)) return;
  
  try {
    const allBookmarks = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.BOOKMARKS) || '{}');
    allBookmarks[state.currentFileKey] = [];
    localStorage.setItem(CONFIG.STORAGE_KEYS.BOOKMARKS, JSON.stringify(allBookmarks));
    
    // 更新状态并重新渲染
    loadBookmarks();
    
    // 显示清空成功提示
    showIndicator('书签已清空');
  } catch (e) {
    console.warn('Failed to clear bookmarks:', e);
    alert('清空书签失败');
  }
}

// Show indicator message
function showIndicator(message) {
  const indicator = document.getElementById('save-indicator');
  if (indicator) {
    indicator.textContent = message;
    indicator.style.opacity = '1';
    setTimeout(() => { 
      indicator.style.opacity = '0';
      setTimeout(() => {
        indicator.textContent = '已保存';
      }, 500);
    }, 1500);
  }
}

// Make removeBookmark available globally for onclick handlers
window.removeBookmark = removeBookmark;