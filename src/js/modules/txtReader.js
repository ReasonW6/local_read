// TXT reader functionality
import { state, updateState, setNavigating } from '../core/state.js';
import { DOM } from '../core/config.js';
import { loadProgress, saveProgress } from './fileManager.js';
import { clearReader, renderTOC, updateActiveTOC, renderChapterNav } from './uiController.js';

// Open TXT file
export async function openTxt(text, fileName) {
  clearReader();
  const chapterRegex = /(^\s*第[零一二三四五六七八九十百千万\d\s]+章.*$)/m;
  const parts = text.split(chapterRegex);
  const chapters = [];
  const txtPages = [];
  
  updateState({ type: 'txt' });
  
  let intro = parts.shift()?.trim();
  if (intro) {
    chapters.push({ label: '前言', href: '#txt-0' });
    txtPages.push(intro);
  }
  
  for (let i = 0; i < parts.length; i += 2) {
    const title = parts[i]?.trim();
    const content = parts[i + 1];
    if (title) {
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
    readerInner.innerHTML = `<h1>${titleText}</h1>${contentHtml}`;
  }
  
  // 滚动到页面顶部
  const mainContainer = document.querySelector('.main');
  if (mainContainer) {
    mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  updateActiveTOC();
  renderChapterNav();
  applyTxtFontSize();
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