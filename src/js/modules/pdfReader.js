// PDF reader functionality
import { state, updateState, setNavigating } from '../core/state.js';
import { DOM } from '../core/config.js';
import { loadProgress, saveProgress } from './fileManager.js';
import { clearReader, renderTOC, updateActiveTOC, renderChapterNav } from './uiController.js';

const PDFJS_CDN_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_CDN_VERSION}`;

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
      if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest);
      let pageIndex = null;
      if (Array.isArray(dest) && dest[0]) {
        pageIndex = await pdfDoc.getPageIndex(dest[0]);
      }
      if (pageIndex !== null) {
        chapters.push({
          label: (item.title || `第${pageIndex + 1}页`).trim(),
          href: `#pdf-page-${pageIndex + 1}`,
          _pageIndex: pageIndex,
          level: lvl
        });
      }
    } catch {
      // 忽略解析失败
    }
    if (Array.isArray(item.items)) {
      for (const sub of item.items) await resolveItem(sub, level + 1);
    }
  }
  for (const it of outline) await resolveItem(it, 1);

  // 去重+排序
  chapters.sort((a, b) => (a._pageIndex ?? 0) - (b._pageIndex ?? 0));
  const seen = new Set();
  const uniq = [];
  for (const c of chapters) {
    const k = c._pageIndex ?? c.href;
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push({ label: c.label, href: c.href, level: Math.max(1, Math.min(3, c.level || 1)) });
    }
  }
  return uniq;
}

function scrollToPdfPage(index) {
  const pageEl = document.getElementById(`pdf-page-${index + 1}`);
  if (!pageEl) return;
  pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
}

function setupScrollIndexSync() {
  const scroller = document.querySelector('.main');
  if (!scroller) return;

  let ticking = false;
  function update() {
    ticking = false;
    const pages = Array.from(document.querySelectorAll('.pdf-page'));
    if (pages.length === 0) return;
    const top = scroller.getBoundingClientRect().top;
    let bestIdx = state.currentIndex || 0;
    let bestDelta = Infinity;
    pages.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top - top);
      if (d < bestDelta) { bestDelta = d; bestIdx = i; }
    });
    if (bestIdx !== state.currentIndex) {
      updateState({ currentIndex: bestIdx });
      updateActiveTOC();
      renderChapterNav();
    }
  }

  scroller.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    requestAnimationFrame(update);
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
  try {
    const pdfjsLib = await ensurePdfJsLoaded();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    updateState({ type: 'pdf', book: pdfDoc });

    const container = createPdfContainer();
    if (!container) return;

    const pageCount = pdfDoc.numPages;
    const progress = createPdfRenderProgress(pageCount);

    // 目录优先用书签，无则用“第x页”
    let chapters = [];
    try {
      const outline = await pdfDoc.getOutline();
      if (outline && outline.length) {
        chapters = await buildChaptersFromOutline(pdfDoc, outline);
      }
    } catch {}
    if (!chapters || chapters.length === 0) {
      chapters = Array.from({ length: pageCount }, (_, i) => ({
        label: `第${i + 1}页`,
        href: `#pdf-page-${i + 1}`,
        level: 1
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

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id; // pdf-page-N
        const num = Number(id.split('-').pop());
        renderPdfPage(pdfDoc, num, container, renderedSet, progress).catch(() => {});
      });
    }, { root: document.querySelector('.main') || null, rootMargin: '300px 0px', threshold: 0.01 });

    Array.from(container.children).forEach(ch => io.observe(ch));

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
export function goToPdfChapter(index) {
  if (index < 0 || index >= state.chapters.length || state.isNavigating) return;
  setNavigating(true);
  updateState({ currentIndex: index });
  updateActiveTOC();
  renderChapterNav();
  scrollToPdfPage(index);
  setTimeout(() => setNavigating(false), 50);
}

// 手动保存 PDF 进度（页索引）
export function manualSavePdfProgress() {
  saveProgress(state.currentFileKey, { page: state.currentIndex });
}