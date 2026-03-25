// TXT reader functionality
import { state, updateState, setNavigating } from '../core/state.js';
import { DOM } from '../core/config.js';
import { loadProgress, saveProgress } from './fileManager.js';
import { clearReader, renderTOC, updateActiveTOC, renderChapterNav } from './uiController.js';

// Open TXT file
export async function openTxt(text, fileName) {
  clearReader();
  // 多规则章节检测（按行扫描更可靠）
  const CHAPTER_RULES = [
    /^\s*第[零一二三四五六七八九十百千万\d\s]+章.*$/u,
    /^[ 　\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\s{0,4}[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|篇(?!张))).{0,30}$/u
  ];

  const isTitleLine = (line) => {
    if (!line) return false;
    return CHAPTER_RULES.some((r) => {
      try { return r.test(line); } catch (e) { return false; }
    });
  };

  const lines = text.replace(/\r/g, '').split('\n');
  const chapters = [];
  const txtPages = [];

  updateState({ type: 'txt' });

  // 扫描每一行，收集章节索引
  const chapterIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (isTitleLine(lines[i])) {
      chapterIndices.push(i);
    }
  }

  if (chapterIndices.length === 0) {
    // 回退：全文视为单章
    chapters.push({ label: fileName, href: '#txt-0' });
    txtPages.push(text);
  } else {
    // 如果文件开头有导语（章节前内容），处理为前言
    if (chapterIndices[0] > 0) {
      const intro = lines.slice(0, chapterIndices[0]).join('\n').trim();
      if (intro) {
        chapters.push({ label: '前言', href: '#txt-0' });
        txtPages.push(intro);
      }
    }

    for (let ci = 0; ci < chapterIndices.length; ci++) {
      const startLine = chapterIndices[ci];
      const endLine = (ci + 1 < chapterIndices.length) ? chapterIndices[ci + 1] : lines.length;
      const title = lines[startLine].trim();
      const content = lines.slice(startLine + 1, endLine).join('\n');
      chapters.push({ label: title, href: '#txt-' + chapters.length });
      txtPages.push((title + '\n\n' + (content || '')).trim());
    }
  }

  if (chapters.length === 0) {
    chapters.push({ label: fileName, href: '#txt-0' });
    txtPages.push(text);
  }

  updateState({ chapters, txtPages });
  renderTOC();

  const saved = loadProgress(state.currentFileKey);
  displayTxtChapter(saved?.idx || 0);
}

// Display specific TXT chapter
export function displayTxtChapter(idx) {
  if (idx < 0 || idx >= state.txtPages.length) return;

  updateState({ currentIndex: idx });
  const raw = state.txtPages[idx] || '';
  const lines = raw.replace(/\r/g, '').split('\n');
  const titleText = state.chapters[idx]?.label || lines[0] || '';
  const contentHtml = lines.map(line => {
    if (line.trim() === '') return '<br>';
    return '<p>' + line.trim().replace(/</g, '&lt;') + '</p>';
  }).join('');

  const readerInner = DOM.readerInner();
  if (readerInner) {
    // BUG-3: 转义标题防止 XSS
    const escapedTitle = titleText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    readerInner.innerHTML = `<h1>${escapedTitle}</h1>${contentHtml}`;
  }

  updateActiveTOC();
  renderChapterNav();
  applyTxtFontSize();

  // 滚动到页面顶部 - 使用 requestAnimationFrame 确保在DOM更新后执行
  requestAnimationFrame(() => {
    const mainContainer = document.querySelector('.main');
    if (mainContainer) {
      mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

// Apply font size to TXT
export function applyTxtFontSize() {
  const reader = DOM.reader();
  if (reader) {
    reader.style.fontSize = state.fontSize + 'px';
  }
}

// Navigate to chapter in TXT
export function goToTxtChapter(index) {
  if (index < 0 || index >= state.chapters.length || state.isNavigating) return;

  setNavigating(true); // 上锁
  displayTxtChapter(index);
  setNavigating(false); // TXT是同步操作，立即解锁
}

// Manual save progress for TXT
export function manualSaveTxtProgress() {
  // 对于 TXT，我们保存当前的章节索引
  saveProgress(state.currentFileKey, { idx: state.currentIndex });
}