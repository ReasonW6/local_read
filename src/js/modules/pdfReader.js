// PDF reader functionality
import { state, updateState, setNavigating } from '../core/state.js';
import { DOM } from '../core/config.js';
import { loadProgress, saveProgress } from './fileManager.js';
import { clearReader, renderTOC, updateActiveTOC, renderChapterNav } from './uiController.js';

const PDFJS_CDN_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_CDN_VERSION}`;
let pdfScrollSyncBound = false;
let activePdfObserver = null;

// 动态加载 pdf.js（仅加载一次）
async function ensurePdfJsLoaded() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PDFJS_BASE}/pdf.min.js`;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
  }
  return window.pdfjsLib;
}

function createPdfContainer() {
  const readerInner = DOM.readerInner();
  if (readerInner) {
    readerInner.innerHTML = '<div id="pdf-container" class="pdf-container" style="width:100%;"></div>';
  }
  return document.getElementById('pdf-container');
}

function makePagePlaceholder(pageNum) {
  const el = document.createElement('div');
  el.className = 'pdf-page';
  el.id = `pdf-page-${pageNum}`;
  el.style.cssText = 'position:relative;margin:0 auto 16px;max-width:100%;min-height:200px;';
  return el;
}

function widthFitScale(page, containerWidth) {
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.max(0.5, containerWidth / viewport.width);
  return scale;
}

async function renderPdfPage(pdfDoc, pageNum, container, renderedSet, progress) {
  if (renderedSet.has(pageNum)) return;
  const host = document.getElementById(`pdf-page-${pageNum}`);
  if (!host) return;

  const page = await pdfDoc.getPage(pageNum);
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = 'auto';

  const containerWidth = host.clientWidth || container.clientWidth || 800;
  const scale = widthFitScale(page, containerWidth);
  const viewport = page.getViewport({ scale });

  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  host.innerHTML = '';
  host.appendChild(canvas);
  host.style.minHeight = viewport.height + 'px';

  renderedSet.add(pageNum);
  if (progress) {
    const count = renderedSet.size;
    progress.set(count);
  }
}

async function buildChaptersFromOutline(pdfDoc, outline) {
  const chapters = [];

  async function resolveItem(item, level = 1) {
    const lvl = Math.max(1, Math.min(3, level));
    try {
      let dest = item.dest || null;
      let pageIndex = null;
      let yOffset = null;

      // 处理目标引用
      if (typeof dest === 'string') {
        dest = await pdfDoc.getDestination(dest);
      }

      if (Array.isArray(dest) && dest.length > 0) {
        // 获取页面索引
        if (dest[0] && typeof dest[0] === 'object') {
          pageIndex = await pdfDoc.getPageIndex(dest[0]);
        }

        // 解析目标位置信息
        // PDF目标格式: [page, type, left, top, right, bottom, zoom]
        // 常见类型: /XYZ (left, top, zoom), /Fit, /FitH (top), /FitV (left)
        if (dest.length >= 4) {
          const destType = dest[1];
          if (destType && destType.name === 'XYZ') {
            // XYZ类型：[page, /XYZ, left, top, zoom]
            if (typeof dest[3] === 'number') {
              yOffset = dest[3];
            }
          } else if (destType && destType.name === 'FitH') {
            // FitH类型：[page, /FitH, top]
            if (typeof dest[2] === 'number') {
              yOffset = dest[2];
            }
          }
        }
      }

      if (pageIndex !== null) {
        const title = (item.title || `第${pageIndex + 1}页`).trim();
        chapters.push({
          label: title,
          href: `#pdf-page-${pageIndex + 1}`,
          pageIndex: pageIndex,
          yOffset: yOffset,
          level: lvl,
          originalDest: dest
        });
      }
    } catch (error) {
      console.warn('Failed to resolve outline item:', item.title, error);
    }

    // 递归处理子项
    if (Array.isArray(item.items)) {
      for (const sub of item.items) {
        await resolveItem(sub, level + 1);
      }
    }
  }

  // 处理所有大纲项
  for (const item of outline) {
    await resolveItem(item, 1);
  }

  // 按页面索引排序并去重
  chapters.sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) {
      return a.pageIndex - b.pageIndex;
    }
    // 同一页面按Y坐标排序（如果有的话）
    if (a.yOffset !== null && b.yOffset !== null) {
      return b.yOffset - a.yOffset; // PDF坐标系Y轴向上为正
    }
    return 0;
  });

  // 去重：相同页面且标题相同的项目只保留一个
  const uniqueChapters = [];
  const seen = new Set();

  for (const chapter of chapters) {
    const key = `${chapter.pageIndex}-${chapter.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueChapters.push({
        label: chapter.label,
        href: chapter.href,
        pageIndex: chapter.pageIndex,
        yOffset: chapter.yOffset,
        level: chapter.level
      });
    }
  }

  return uniqueChapters;
}

function scrollToPdfPage(index, yOffset = null) {
  const pageEl = document.getElementById(`pdf-page-${index + 1}`);
  if (!pageEl) return;

  const scroller = document.querySelector('.main');
  if (!scroller) {
    pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
    return;
  }

  // 强制渲染目标页面
  if (window.forceRenderPdfPage) {
    window.forceRenderPdfPage(index + 1);
  }

  // 使用简单可靠的滚动方式
  pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });

  // 如果有精确位置要求，等待渲染后再调整
  if (yOffset !== null && typeof yOffset === 'number') {
    const adjustPosition = async () => {
      // 等待一段时间确保页面渲染
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = pageEl.querySelector('canvas');
      if (canvas && canvas.offsetHeight > 0) {
        try {
          const pageNum = index + 1;
          const pdfDoc = state.book;
          if (pdfDoc) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1 });

            // 计算缩放比例和偏移
            const canvasHeight = canvas.offsetHeight;
            const scale = canvasHeight / viewport.height;
            const pdfHeight = viewport.height;

            // PDF坐标转换：Y轴向上为正 -> 浏览器Y轴向下为正
            const offsetFromTop = pdfHeight - yOffset;
            const pixelOffset = Math.max(0, offsetFromTop * scale);

            // 获取页面当前位置并调整
            const pageRect = pageEl.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            const currentPageTop = scroller.scrollTop + pageRect.top - scrollerRect.top;

            scroller.scrollTo({
              top: currentPageTop + pixelOffset,
              behavior: 'smooth'
            });
          }
        } catch (error) {
          console.warn('Failed to adjust scroll position:', error);
        }
      }
    };

    adjustPosition();
  }
}

function setupScrollIndexSync() {
  if (pdfScrollSyncBound) return;
  pdfScrollSyncBound = true;
  const scroller = document.querySelector('.main');
  if (!scroller) return;

  let ticking = false;
  let lastUpdateTime = 0;

  function update() {
    ticking = false;

    // 如果正在导航，跳过更新
    if (state.isNavigating) return;

    // 限制更新频率
    const now = Date.now();
    if (now - lastUpdateTime < 100) return;
    lastUpdateTime = now;

    const pages = Array.from(document.querySelectorAll('.pdf-page'));
    if (pages.length === 0) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const viewportCenter = scrollerRect.top + scrollerRect.height / 2;

    let bestIdx = state.currentIndex || 0;
    let bestDelta = Infinity;

    pages.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const pageCenter = rect.top + rect.height / 2;
      const delta = Math.abs(pageCenter - viewportCenter);

      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    });

    if (bestIdx !== state.currentIndex) {
      updateState({ currentIndex: bestIdx });

      // 更新章节索引
      const chapters = state.chapters || [];
      let chapterIndex = -1;
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (typeof chapters[i].pageIndex === 'number' && chapters[i].pageIndex <= bestIdx) {
          chapterIndex = i;
          break;
        }
      }
      if (chapterIndex >= 0) {
        updateState({ currentChapterIndex: chapterIndex });
      }

      updateActiveTOC();
      renderChapterNav();
    }
  }

  scroller.addEventListener('scroll', () => {
    if (!ticking && !state.isNavigating) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!state.isNavigating) {
      requestAnimationFrame(update);
    }
  });
}

function createPdfRenderProgress(total) {
  const host = DOM.reader && DOM.reader();
  const wrapper = document.createElement('div');
  wrapper.id = 'pdfRenderProgress';
  wrapper.style.cssText = [
    'position:fixed',
    'left:16px',
    'bottom:16px',
    'z-index:1000',
    'pointer-events:none',
    'opacity:1',
    'transition:opacity .4s ease',
  ].join(';');

  const isDark = (typeof state.theme === 'string' && state.theme.toLowerCase() === 'dark');
  const accent = isDark ? 'rgba(102,204,255,0.9)' : 'rgba(59,130,246,0.9)';
  const trackBg = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)';
  const subTextColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
  const cardBg = isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.7)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';

  // 卡片容器，低调半透明
  const card = document.createElement('div');
  card.style.cssText = [
    `background:${cardBg}`,
    `backdrop-filter:blur(4px)`,
    `-webkit-backdrop-filter:blur(4px)`,
    `border:1px solid ${cardBorder}`,
    'border-radius:10px',
    'padding:10px 12px',
    'min-width:160px',
    'box-shadow:0 4px 12px rgba(0,0,0,.12)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '渲染中······';
  title.style.cssText = [
    `color:${textColor}`,
    'font-size:12px',
    'line-height:16px',
    'margin-bottom:6px'
  ].join(';');

  const barWrap = document.createElement('div');
  barWrap.style.cssText = [
    'width:140px',
    'height:6px',
    `background:${trackBg}`,
    'border-radius:999px',
    'overflow:hidden'
  ].join(';');

  const bar = document.createElement('div');
  bar.style.cssText = [
    'width:0%',
    'height:100%',
    `background:${accent}`,
    'transition:width .25s ease',
  ].join(';');

  const small = document.createElement('div');
  small.style.cssText = [
    `color:${subTextColor}`,
    'font-size:11px',
    'line-height:14px',
    'margin-top:6px',
    'text-align:right'
  ].join(';');
  small.textContent = `0页/${total}页`;

  barWrap.appendChild(bar);
  card.appendChild(title);
  card.appendChild(barWrap);
  card.appendChild(small);
  wrapper.appendChild(card);
  (host || document.body).appendChild(wrapper);

  let current = 0;
  const api = {
    set(n) {
      current = Math.max(0, Math.min(total, n));
      const pct = total > 0 ? (current / total) * 100 : 0;
      bar.style.width = pct.toFixed(1) + '%';
      small.textContent = `${current}页/${total}页`;
      wrapper.style.opacity = '1';
      if (current >= total) {
        title.textContent = '渲染完成';
        setTimeout(() => api.hide(), 900);
      }
    },
    hide() {
      wrapper.style.opacity = '0';
      setTimeout(() => {
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      }, 500);
    }
  };
  return api;
}

// 打开 PDF
export async function openPdf(arrayBuffer) {
  clearReader();
  // BUG-8: 重置滚动同步标志，确保新 PDF 重新绑定
  pdfScrollSyncBound = false;
  if (activePdfObserver) {
    activePdfObserver.disconnect();
    activePdfObserver = null;
  }
  try {
    const pdfjsLib = await ensurePdfJsLoaded();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    updateState({ type: 'pdf', book: pdfDoc });

    const container = createPdfContainer();
    if (!container) return;

    const pageCount = pdfDoc.numPages;
    const progress = createPdfRenderProgress(pageCount);

    // 目录优先用书签，无则用"第x页"
    let chapters = [];
    try {
      const outline = await pdfDoc.getOutline();
      if (outline && outline.length) {
        chapters = await buildChaptersFromOutline(pdfDoc, outline);
      }
    } catch { }
    if (!chapters || chapters.length === 0) {
      chapters = Array.from({ length: pageCount }, (_, i) => ({
        label: `第${i + 1}页`,
        href: `#pdf-page-${i + 1}`,
        level: 1,
        pageIndex: i
      }));
    }

    updateState({ chapters, currentIndex: 0 });
    renderTOC();
    renderChapterNav();

    // 占位并懒加载渲染
    const renderedSet = new Set();
    for (let i = 1; i <= pageCount; i++) {
      container.appendChild(makePagePlaceholder(i));
    }

    if (activePdfObserver) {
      activePdfObserver.disconnect();
      activePdfObserver = null;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id; // pdf-page-N
        const num = Number(id.split('-').pop());

        // 确保页面渲染
        if (!renderedSet.has(num)) {
          renderPdfPage(pdfDoc, num, container, renderedSet, progress).catch(() => { });
        }
      });
    }, {
      root: document.querySelector('.main') || null,
      rootMargin: '500px 0px', // 增大预渲染范围
      threshold: 0.01
    });

    // 添加强制渲染函数，用于目录跳转
    window.forceRenderPdfPage = (pageNum) => {
      if (!renderedSet.has(pageNum) && pageNum >= 1 && pageNum <= pageCount) {
        renderPdfPage(pdfDoc, pageNum, container, renderedSet, progress).catch(() => { });
      }
    };

    Array.from(container.children).forEach(ch => io.observe(ch));
    activePdfObserver = io;

    // 进度恢复（页索引）
    const saved = loadProgress(state.currentFileKey);
    if (saved && typeof saved.page === 'number' && saved.page >= 0 && saved.page < pageCount) {
      updateState({ currentIndex: saved.page });
      requestAnimationFrame(() => scrollToPdfPage(saved.page));
    } else {
      requestAnimationFrame(() => scrollToPdfPage(0));
    }

    setupScrollIndexSync();
  } catch (err) {
    console.error('Error opening PDF:', err);
    alert('打开 PDF 出错。文件可能损坏或不受支持。');
  }
}

// 章节跳转（页跳转）
export function goToPdfChapter(target) {
  const pageCount = state.book?.numPages || 0;
  const chapters = state.chapters || [];

  let page = 0;
  let yOffset = null;
  let chapterIndex = -1;

  // 判断调用方式
  if (typeof target === 'number' && target >= 0 && target < chapters.length) {
    // 目录点击：传入章节索引
    const chapter = chapters[target];
    if (chapter && typeof chapter.pageIndex === 'number') {
      page = chapter.pageIndex;
      yOffset = chapter.yOffset;
      chapterIndex = target;
    }
  } else {
    // 直接页面跳转：传入页码
    page = Math.max(0, Math.min(pageCount - 1, Number(target) || 0));

    // 找到对应的章节索引（用于高亮目录）
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (chapters[i].pageIndex <= page) {
        chapterIndex = i;
        break;
      }
    }
  }

  // 设置导航状态，防止滚动同步干扰
  setNavigating(true);

  // 更新状态
  updateState({
    currentIndex: page,
    currentChapterIndex: chapterIndex >= 0 ? chapterIndex : -1
  });

  // 立即执行跳转
  scrollToPdfPage(page, yOffset);

  // 延迟更新UI，确保跳转完成
  setTimeout(() => {
    updateActiveTOC();
    renderChapterNav();
    setNavigating(false);
  }, 100);
}

// 手动保存 PDF 进度（页索引）
export function manualSavePdfProgress() {
  saveProgress(state.currentFileKey, { page: state.currentIndex });
}
