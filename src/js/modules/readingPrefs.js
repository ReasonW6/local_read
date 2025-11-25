// 阅读偏好管理模块
import { state } from '../core/state.js';
import { 
  normalizePrefs, 
  computeVerticalPadding, 
  formatDecimal,
  applyProgressBarPreference,
  DEFAULT_READING_PREFS
} from '../core/utils.js';

const PREFS_KEY = 'reader_prefs_v1';

/**
 * 获取阅读偏好设置
 */
export function getReadingPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_READING_PREFS };
    const parsed = JSON.parse(raw);
    return normalizePrefs(parsed);
  } catch {
    return { ...DEFAULT_READING_PREFS };
  }
}

/**
 * 保存阅读偏好设置
 */
export function saveReadingPrefs(prefs) {
  const normalized = normalizePrefs(prefs);
  localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
  return normalized;
}

/**
 * 应用排版样式到页面
 */
export function applyTypography(prefs, updateProgress = null) {
  const normalized = normalizePrefs(prefs);
  const verticalPadding = computeVerticalPadding(normalized.pagePadding);
  
  document.documentElement.style.setProperty('--para-spacing', String(normalized.paraSpacing));
  document.documentElement.style.setProperty('--letter-spacing', `${normalized.letterSpacing}px`);
  document.documentElement.style.setProperty('--line-height', String(normalized.lineHeight));
  document.documentElement.style.setProperty('--page-width', `${normalized.pageWidth}px`);
  document.documentElement.style.setProperty('--page-padding-x', `${normalized.pagePadding}px`);
  document.documentElement.style.setProperty('--page-padding-y', `${verticalPadding}px`);
  
  applyEpubTypographyToContents(normalized);
  
  if (updateProgress) {
    requestAnimationFrame(updateProgress);
  }
}

/**
 * 应用排版样式到 EPUB 内容
 */
export function applyEpubTypographyToContents(prefs) {
  if (!state.rendition) return;
  const normalized = normalizePrefs(prefs);
  const verticalPadding = computeVerticalPadding(normalized.pagePadding);
  const contents = state.rendition.getContents();
  
  contents.forEach(content => {
    try {
      const doc = content?.document;
      if (!doc) return;
      const id = 'epub-typography-override';
      let style = doc.getElementById(id);
      if (!style) {
        style = doc.createElement('style');
        style.id = id;
        doc.head.appendChild(style);
      }
      style.textContent = `
        html, body {
          margin: 0 auto !important;
          padding: ${verticalPadding}px ${normalized.pagePadding}px !important;
          max-width: ${normalized.pageWidth}px !important;
          line-height: ${normalized.lineHeight} !important;
        }
        p { 
          letter-spacing: ${normalized.letterSpacing}px !important; 
          margin-bottom: calc(${normalized.paraSpacing} * 1em) !important; 
          line-height: inherit !important;
        }
      `;
    } catch {}
  });
  
  // 钩子函数，确保后续渲染也应用排版
  if (!state.rendition._typographyHooked) {
    try {
      state.rendition.on('rendered', () => {
        applyEpubTypographyToContents(getReadingPrefs());
      });
      state.rendition._typographyHooked = true;
    } catch {}
  }
  
  // 强制重新渲染 EPUB 内容
  try {
    if (state.rendition && state.rendition.manager && state.rendition.manager.layout) {
      requestAnimationFrame(() => {
        state.rendition.resize();
      });
    }
  } catch (e) {
    // 忽略错误
  }
}

/**
 * 更新设置面板UI显示
 */
export function updateSettingsPanelUI(prefs) {
  const normalized = normalizePrefs(prefs);

  const inputs = {
    paraSpacing: document.getElementById('paraSpacingInput'),
    letterSpacing: document.getElementById('letterSpacingInput'),
    lineHeight: document.getElementById('lineHeightInput'),
    pageWidth: document.getElementById('pageWidthInput'),
    pagePadding: document.getElementById('pageMarginInput')
  };

  const values = {
    paraSpacing: document.getElementById('paraSpacingVal'),
    letterSpacing: document.getElementById('letterSpacingVal'),
    lineHeight: document.getElementById('lineHeightVal'),
    pageWidth: document.getElementById('pageWidthVal'),
    pagePadding: document.getElementById('pageMarginVal')
  };
  
  const progressToggle = document.getElementById('progressBarToggle');

  if (inputs.paraSpacing) inputs.paraSpacing.value = String(normalized.paraSpacing);
  if (inputs.letterSpacing) inputs.letterSpacing.value = String(normalized.letterSpacing);
  if (inputs.lineHeight) inputs.lineHeight.value = String(normalized.lineHeight);
  if (inputs.pageWidth) inputs.pageWidth.value = String(normalized.pageWidth);
  if (inputs.pagePadding) inputs.pagePadding.value = String(normalized.pagePadding);

  if (values.paraSpacing) values.paraSpacing.textContent = formatDecimal(normalized.paraSpacing);
  if (values.letterSpacing) values.letterSpacing.textContent = `${formatDecimal(normalized.letterSpacing)}px`;
  if (values.lineHeight) values.lineHeight.textContent = formatDecimal(normalized.lineHeight);
  if (values.pageWidth) values.pageWidth.textContent = `${Math.round(normalized.pageWidth)}px`;
  if (values.pagePadding) values.pagePadding.textContent = `${Math.round(normalized.pagePadding)}px`;
  if (progressToggle) progressToggle.checked = normalized.progressBarEnabled !== false;
}

/**
 * 更新设置面板中的状态显示
 */
export function updateSettingsStatus() {
  const currentFontSize = document.getElementById('currentFontSize');
  const currentTheme = document.getElementById('currentTheme');
  
  if (currentFontSize) {
    currentFontSize.textContent = `${state.fontSize}px`;
  }
  
  if (currentTheme) {
    currentTheme.textContent = state.theme === 'light' ? '日间模式' : '夜间模式';
  }
}
