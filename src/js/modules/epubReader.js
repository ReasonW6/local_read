// EPUB reader functionality
import { state, updateState, setNavigating } from '../core/state.js';
import { DOM } from '../core/config.js';
import { loadProgress, saveProgress } from './fileManager.js';
import { clearReader, renderTOC, updateActiveTOC, renderChapterNav } from './uiController.js';
import { registerAndApplyEpubTheme, applyEpubFontSize } from './epubCore.js';

// Register EPUB themes (使用增强版本)
export function registerEpubThemes() {
  if (!state.rendition) return;
  registerAndApplyEpubTheme(state.theme);
}

// Apply font size to EPUB (使用增强版本)
export function applyFontSize() {
  applyEpubFontSize(state.fontSize);
}

// Open EPUB file
export async function openEpub(arrayBuffer) {
  clearReader();
  try {
    const book = ePub(arrayBuffer);
    updateState({ book, type: 'epub' });
    
    const readerInner = DOM.readerInner();
    if (readerInner) {
      readerInner.innerHTML = '<div id="epub-container" class="epub-container"></div>';
    }
    
    if (state.rendition) state.rendition.destroy();
    const rendition = book.renderTo('epub-container', { flow: 'scrolled-doc', width: '100%' });
    updateState({ rendition });

    registerEpubThemes();
    rendition.themes.select(state.theme);
    applyFontSize();

    await book.ready;

    // 1. 以书脊(Spine)为准，建立与 ePub.js 内部索引完全同步的章节列表
    const nav = await book.loaded.navigation;
    const spine = book.spine;
    const tocItems = new Map();
    
    function flattenToc(items) {
      items.forEach(item => {
        const key = item.href.split('#')[0];
        tocItems.set(key, item.label.trim());
        if (item.subitems && item.subitems.length) {
          flattenToc(item.subitems);
        }
      });
    }
    
    flattenToc(nav.toc || []);
    const chapters = spine.items.map(item => {
      const key = item.href.split('#')[0];
      const label = tocItems.get(key) || item.id || `章节 ${item.index + 1}`;
      return { label: label, href: item.href };
    });
    
    updateState({ chapters });
    renderTOC();
    
    // 2. 主动、同步地计算并设置好初始状态
    const saved = loadProgress(state.currentFileKey);
    const location = saved?.href || chapters[0]?.href;

    const spineItem = book.spine.get(location);
    updateState({ currentIndex: spineItem ? spineItem.index : 0 });

    // 3. 在显示内容前，强制更新UI，确保目录和导航栏正确
    updateActiveTOC();
    renderChapterNav();

    // 4. 'relocated' 事件现在只负责在章节变化时更新UI
    rendition.on('relocated', (relocatedEvent) => {
      if (state.isNavigating) {
        return; // 如果是程序化导航（用户点击），则忽略此事件
      }
      const spineIndex = relocatedEvent.start.index;
      if (spineIndex >= 0 && state.currentIndex !== spineIndex) {
        updateState({ currentIndex: spineIndex });
        updateActiveTOC();
        renderChapterNav();
      }
    });

    // 5. 最后，显示书籍内容
    await rendition.display(location);

  } catch (err) {
    console.error('Error opening EPUB:', err);
    alert('打开 EPUB 出错。可能文件损坏或受DRM保护。');
  }
}

// Navigate to chapter in EPUB
export function goToEpubChapter(index) {
  if (index < 0 || index >= state.chapters.length || state.isNavigating) return;
  
  setNavigating(true); // 上锁
  
  updateState({ currentIndex: index });
  updateActiveTOC();
  renderChapterNav();

  if (state.rendition) {
    state.rendition.display(state.chapters[index].href).then(() => {
      // 在EPUB异步显示完成后再解锁
      setTimeout(() => {
        setNavigating(false);
      }, 100);
    });
  }
}

// Manual save progress for EPUB
export function manualSaveEpubProgress() {
  if (!state.rendition) return;
  // rendition.currentLocation() 是获取当前精确位置的最可靠方法
  const location = state.rendition.currentLocation();
  if (location && location.start) {
    saveProgress(state.currentFileKey, { href: location.start.cfi });
  }
}