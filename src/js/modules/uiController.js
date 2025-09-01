// UI controller for sidebar, navigation, and general UI interactions
import { state, updateState } from '../core/state.js';
import { DOM, CONFIG } from '../core/config.js';
import { loadBookmarks } from './bookmarkManager.js';

// Toggle sidebar visibility
export function toggleSidebar(view) {
  const sidebar = DOM.sidebar();
  if (!sidebar) return;
  
  const isCurrentlyVisible = sidebar.classList.contains('visible');
  const isSameView = state.sidebarView === view;
  
  if (isCurrentlyVisible && isSameView) {
    sidebar.classList.remove('visible');
  } else {
    updateState({ sidebarView: view });
    sidebar.className = 'sidebar visible';
    
    if (view === CONFIG.SIDEBAR_VIEWS.TOC) {
      sidebar.classList.add('show-toc');
    } else if (view === CONFIG.SIDEBAR_VIEWS.BOOKSHELF) {
      sidebar.classList.add('show-bookshelf');
    } else if (view === CONFIG.SIDEBAR_VIEWS.BOOKMARK) {
      sidebar.classList.add('show-bookmark');
      loadBookmarks(); // 加载书签列表
    }
  }
}

// Clear reader content
export function clearReader() {
  const readerInner = DOM.readerInner();
  const chapterNav = DOM.chapterNav();
  const toc = DOM.toc();
  
  if (readerInner) readerInner.innerHTML = '';
  if (chapterNav) chapterNav.innerHTML = '';
  if (state.rendition) { 
    state.rendition.destroy(); 
    updateState({ rendition: null });
  }
  
  updateState({ 
    chapters: [], 
    currentIndex: 0 
  });
  
  if (toc) {
    toc.innerHTML = '<div class="muted" style="padding: 10px;">加载目录...</div>';
  }
}

// Render table of contents
export function renderTOC() {
  const toc = DOM.toc();
  if (!toc) return;
  
  toc.innerHTML = '';
  if (state.chapters.length === 0) {
    toc.innerHTML = '<div class="muted" style="padding: 10px;">无目录信息</div>';
    return;
  }
  
  state.chapters.forEach((c, i) => {
    const el = document.createElement('div');
    const lvl = Math.max(1, Math.min(3, Number(c.level) || 1));
    el.className = 'chapter-item level-' + lvl;

    // 样式：一级最大加粗；二级缩进并稍小；三级更小再缩进
    const fontSize = (lvl === 1 ? '16px' : (lvl === 2 ? '14px' : '13px'));
    const fontWeight = (lvl === 1 ? '600' : '400');
    const paddingLeft = (lvl === 1 ? 8 : (lvl === 2 ? 24 : 40)); // 缩进
    el.style.cssText = `font-size:${fontSize};font-weight:${fontWeight};padding-left:${paddingLeft}px;line-height:1.6;`;

    // 二/三级在标题前增加不可断空格，视觉上更明显
    const prefix = lvl === 1 ? '' : (lvl === 2 ? '\u00A0\u00A0' : '\u00A0\u00A0\u00A0\u00A0');
    el.textContent = prefix + (c.label || '');
    el.dataset.index = i;
    toc.appendChild(el);
  });
  
  updateActiveTOC();
  
  toc.onclick = (e) => {
    const targetEl = e.target.closest('.chapter-item');
    if (!targetEl) return;
    goToChapter(parseInt(targetEl.dataset.index, 10));
  };
}

// Update active TOC item
export function updateActiveTOC() {
  const toc = DOM.toc();
  if (!toc) return;

  let activeIndex = state.currentIndex;

  if (state.type === 'pdf') {
    // 优先使用 currentChapterIndex，如果没有则根据页面计算
    if (typeof state.currentChapterIndex === 'number' && state.currentChapterIndex >= 0) {
      activeIndex = state.currentChapterIndex;
    } else {
      // 根据当前页面找到最合适的章节
      const chapters = state.chapters || [];
      let bestIndex = 0;
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (typeof chapters[i].pageIndex === 'number' && chapters[i].pageIndex <= state.currentIndex) {
          bestIndex = i;
          break;
        }
      }
      activeIndex = bestIndex;
    }
  }

  Array.from(toc.children).forEach((el, idx) => {
    el.classList.toggle('active', idx === activeIndex);
    if (idx === activeIndex && el.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

// Render chapter navigation
export function renderChapterNav() {
  const chapterNav = DOM.chapterNav();
  if (!chapterNav) return;

  let activeIndex = state.currentIndex;

  if (state.type === 'pdf') {
    // 优先使用 currentChapterIndex，如果没有则根据页面计算
    if (typeof state.currentChapterIndex === 'number' && state.currentChapterIndex >= 0) {
      activeIndex = state.currentChapterIndex;
    } else {
      // 根据当前页面找到最合适的章节
      const chapters = state.chapters || [];
      let bestIndex = 0;
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (typeof chapters[i].pageIndex === 'number' && chapters[i].pageIndex <= state.currentIndex) {
          bestIndex = i;
          break;
        }
      }
      activeIndex = bestIndex;
    }
  }

  chapterNav.innerHTML = `
    <button id="prevChapBtn" ${activeIndex === 0 ? 'disabled' : ''}>上一章</button>
    <button id="tocNavBtn">目录</button>
    <button id="nextChapBtn" ${activeIndex >= state.chapters.length - 1 ? 'disabled' : ''}>下一章</button>
  `;

  const prevBtn = document.getElementById('prevChapBtn');
  const nextBtn = document.getElementById('nextChapBtn');
  const tocBtn = document.getElementById('tocNavBtn');

  if (prevBtn) prevBtn.onclick = goToPreviousChapter;
  if (nextBtn) nextBtn.onclick = goToNextChapter;
  if (tocBtn) tocBtn.onclick = () => {
    // 切换目录面板显示状态
    toggleSidebar(CONFIG.SIDEBAR_VIEWS.TOC);
  };
}

// Navigate to chapter
export function goToChapter(index) {
  if (index < 0 || index >= state.chapters.length || state.isNavigating) return;
  
  // Import specific reader functions based on type to avoid circular dependencies
  if (state.type === 'txt') {
    import('./txtReader.js').then(({ goToTxtChapter }) => {
      goToTxtChapter(index);
    });
  } else if (state.type === 'epub') {
    import('./epubReader.js').then(({ goToEpubChapter }) => {
      goToEpubChapter(index);
    });
  } else if (state.type === 'pdf') {
    import('./pdfReader.js').then(({ goToPdfChapter }) => {
      goToPdfChapter(index);
    });
  }
}

// Navigation helper functions
export function goToPreviousChapter() { 
  if (state.type === 'pdf') {
    // 获取当前章节索引
    let currentChapterIndex = state.currentChapterIndex;
    if (typeof currentChapterIndex !== 'number' || currentChapterIndex < 0) {
      // 如果没有明确的章节索引，根据页面计算
      const chapters = state.chapters || [];
      currentChapterIndex = 0;
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (typeof chapters[i].pageIndex === 'number' && chapters[i].pageIndex <= state.currentIndex) {
          currentChapterIndex = i;
          break;
        }
      }
    }
    goToChapter(currentChapterIndex - 1);
  } else {
    goToChapter(state.currentIndex - 1);
  }
}

export function goToNextChapter() { 
  if (state.type === 'pdf') {
    // 获取当前章节索引
    let currentChapterIndex = state.currentChapterIndex;
    if (typeof currentChapterIndex !== 'number' || currentChapterIndex < 0) {
      // 如果没有明确的章节索引，根据页面计算
      const chapters = state.chapters || [];
      currentChapterIndex = 0;
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (typeof chapters[i].pageIndex === 'number' && chapters[i].pageIndex <= state.currentIndex) {
          currentChapterIndex = i;
          break;
        }
      }
    }
    goToChapter(currentChapterIndex + 1);
  } else {
    goToChapter(state.currentIndex + 1);
  }
}

// Close sidebar when opening a book from bookshelf
export function closeSidebarIfBookshelf() {
  const sidebar = DOM.sidebar();
  if (state.sidebarView === CONFIG.SIDEBAR_VIEWS.BOOKSHELF && sidebar && sidebar.classList.contains('visible')) {
    sidebar.classList.remove('visible');
  }
}

// Close sidebar (general function)
export function closeSidebar() {
  const sidebar = DOM.sidebar();
  if (sidebar && sidebar.classList.contains('visible')) {
    sidebar.classList.remove('visible');
  }
}
