// 字体管理模块
import { state } from '../core/state.js';

// 预设字体列表
export const PRESET_FONTS = [
  { id: 'system', name: '系统默认', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'serif', name: '宋体/衬线', family: '"Noto Serif SC", "Source Han Serif SC", "思源宋体", SimSun, "宋体", serif' },
  { id: 'sans', name: '黑体/无衬线', family: '"Noto Sans SC", "Source Han Sans SC", "思源黑体", "Microsoft YaHei", "微软雅黑", sans-serif' },
  { id: 'kai', name: '楷体', family: '"楷体", KaiTi, "楷体_GB2312", STKaiti, serif' },
  { id: 'fangsong', name: '仿宋', family: '"仿宋", FangSong, "仿宋_GB2312", STFangsong, serif' },
  { id: 'mono', name: '等宽字体', family: '"JetBrains Mono", "Fira Code", "Source Code Pro", Consolas, monospace' }
];

// 存储键
const FONT_STORAGE_KEY = 'reader_font_v1';
const CUSTOM_FONTS_KEY = 'reader_custom_fonts_v1';

// 当前加载的自定义字体
let loadedCustomFonts = new Map();

/**
 * 获取当前字体设置
 */
export function getFontSettings() {
  try {
    const raw = localStorage.getItem(FONT_STORAGE_KEY);
    if (!raw) return { fontId: 'system', customFontId: null };
    return JSON.parse(raw);
  } catch {
    return { fontId: 'system', customFontId: null };
  }
}

/**
 * 保存字体设置
 */
export function saveFontSettings(settings) {
  localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(settings));
  return settings;
}

/**
 * 获取已安装的自定义字体列表
 */
export async function getCustomFonts() {
  try {
    const response = await fetch('/api/fonts');
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn('获取自定义字体列表失败:', e);
  }
  return [];
}

/**
 * 上传自定义字体
 */
export async function uploadFont(file) {
  const formData = new FormData();
  formData.append('font', file);
  
  const response = await fetch('/api/fonts/upload', {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '上传失败' }));
    throw new Error(error.error || '上传失败');
  }
  
  return await response.json();
}

/**
 * 删除自定义字体
 */
export async function deleteFont(fontId) {
  const response = await fetch(`/api/fonts/${encodeURIComponent(fontId)}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '删除失败' }));
    throw new Error(error.error || '删除失败');
  }
  
  // 移除已加载的字体
  if (loadedCustomFonts.has(fontId)) {
    loadedCustomFonts.delete(fontId);
  }
  
  return await response.json();
}

/**
 * 加载自定义字体到页面
 */
export async function loadCustomFont(font) {
  if (loadedCustomFonts.has(font.id)) {
    return loadedCustomFonts.get(font.id);
  }
  
  try {
    const fontFace = new FontFace(font.fontFamily, `url(/api/fonts/file/${encodeURIComponent(font.id)})`);
    await fontFace.load();
    document.fonts.add(fontFace);
    loadedCustomFonts.set(font.id, fontFace);
    return fontFace;
  } catch (e) {
    console.error('加载字体失败:', font.name, e);
    throw e;
  }
}

/**
 * 获取字体的 font-family 值
 */
export function getFontFamily(fontId, customFonts = []) {
  // 检查是否是预设字体
  const preset = PRESET_FONTS.find(f => f.id === fontId);
  if (preset) {
    return preset.family;
  }
  
  // 检查是否是自定义字体
  const custom = customFonts.find(f => f.id === fontId);
  if (custom) {
    return `"${custom.fontFamily}", sans-serif`;
  }
  
  // 默认返回系统字体
  return PRESET_FONTS[0].family;
}

/**
 * 应用字体到阅读器
 */
export async function applyFont(fontId, customFonts = []) {
  const fontFamily = getFontFamily(fontId, customFonts);
  
  // 如果是自定义字体，先确保加载
  const customFont = customFonts.find(f => f.id === fontId);
  if (customFont) {
    try {
      await loadCustomFont(customFont);
    } catch (e) {
      console.error('加载自定义字体失败，回退到系统字体');
      return applyFont('system', customFonts);
    }
  }
  
  // 应用到 CSS 变量
  document.documentElement.style.setProperty('--reader-font-family', fontFamily);
  
  // 应用到阅读器元素
  const reader = document.getElementById('reader');
  if (reader) {
    reader.style.fontFamily = fontFamily;
  }
  
  // 应用到 EPUB 内容
  applyFontToEpub(fontFamily);
  
  // 保存设置
  const settings = getFontSettings();
  settings.fontId = fontId;
  saveFontSettings(settings);
  
  return fontFamily;
}

/**
 * 应用字体到 EPUB 内容
 */
export function applyFontToEpub(fontFamily) {
  if (!state.rendition) return;
  
  const contents = state.rendition.getContents();
  contents.forEach(content => {
    try {
      const doc = content?.document;
      if (!doc) return;
      
      const id = 'epub-font-override';
      let style = doc.getElementById(id);
      if (!style) {
        style = doc.createElement('style');
        style.id = id;
        doc.head.appendChild(style);
      }
      
      style.textContent = `
        html, body, p, div, span, h1, h2, h3, h4, h5, h6, li, td, th {
          font-family: ${fontFamily} !important;
        }
      `;
    } catch (e) {
      console.warn('应用 EPUB 字体失败:', e);
    }
  });
  
  // 确保后续渲染也应用字体
  if (!state.rendition._fontHooked) {
    try {
      state.rendition.on('rendered', () => {
        const settings = getFontSettings();
        getCustomFonts().then(customFonts => {
          const fontFamily = getFontFamily(settings.fontId, customFonts);
          applyFontToEpub(fontFamily);
        });
      });
      state.rendition._fontHooked = true;
    } catch {}
  }
}

/**
 * 初始化字体管理器
 */
export async function initFontManager() {
  const settings = getFontSettings();
  const customFonts = await getCustomFonts();
  
  // 应用保存的字体设置
  if (settings.fontId) {
    await applyFont(settings.fontId, customFonts);
  }
  
  return { settings, customFonts };
}

/**
 * 渲染字体选择器UI（下拉菜单版本）
 */
export async function renderFontSelector(containerId = 'fontSelector') {
  const select = document.getElementById(containerId);
  if (!select) return;
  
  const settings = getFontSettings();
  const customFonts = await getCustomFonts();
  
  // 加载所有自定义字体
  for (const font of customFonts) {
    try {
      await loadCustomFont(font);
    } catch (e) {
      console.warn('预加载字体失败:', font.name);
    }
  }
  
  // 生成下拉菜单选项
  let html = '<optgroup label="预设字体">';
  PRESET_FONTS.forEach(font => {
    const selected = font.id === settings.fontId ? 'selected' : '';
    html += `<option value="${font.id}" ${selected}>${font.name}</option>`;
  });
  html += '</optgroup>';
  
  if (customFonts.length > 0) {
    html += '<optgroup label="自定义字体">';
    customFonts.forEach(font => {
      const selected = font.id === settings.fontId ? 'selected' : '';
      html += `<option value="${font.id}" data-custom="true" ${selected}>${font.name}</option>`;
    });
    html += '</optgroup>';
  }
  
  select.innerHTML = html;
  
  // 绑定字体切换事件
  select.onchange = async function() {
    const fontId = this.value;
    await applyFont(fontId, customFonts);
    showFontStatus('字体已切换', 'success');
  };
  
  // 右键删除自定义字体
  select.oncontextmenu = async function(e) {
    const selectedOption = this.options[this.selectedIndex];
    if (!selectedOption || !selectedOption.dataset.custom) return;
    
    e.preventDefault();
    const fontId = selectedOption.value;
    const fontName = selectedOption.textContent;
    
    if (!confirm(`确定删除字体"${fontName}"吗？`)) return;
    
    try {
      await deleteFont(fontId);
      
      // 如果删除的是当前使用的字体，切换回系统默认
      if (settings.fontId === fontId) {
        await applyFont('system', []);
      }
      
      // 刷新列表
      renderFontSelector(containerId);
      showFontStatus('字体已删除', 'success');
    } catch (e) {
      showFontStatus('删除失败: ' + e.message, 'error');
    }
  };
  
  return { customFonts, settings };
}

/**
 * 初始化字体上传功能
 */
export function initFontUpload(inputId = 'fontFileInput', btnId = 'uploadFontBtn', statusId = 'fontUploadStatus') {
  const fileInput = document.getElementById(inputId);
  const uploadBtn = document.getElementById(btnId);
  const statusEl = document.getElementById(statusId);
  
  if (!fileInput || !uploadBtn) return;
  
  uploadBtn.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 验证文件类型
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) {
      showFontStatus('不支持的字体格式', 'error', statusEl);
      return;
    }
    
    showFontStatus('上传中...', '', statusEl);
    
    try {
      const result = await uploadFont(file);
      showFontStatus('上传成功', 'success', statusEl);
      
      // 刷新字体选择器
      await renderFontSelector();
      
      // 清空文件输入
      fileInput.value = '';
    } catch (e) {
      showFontStatus('上传失败: ' + e.message, 'error', statusEl);
    }
  });
}

/**
 * 显示字体状态提示
 */
function showFontStatus(message, type = '', statusEl = null) {
  // 显示在状态元素
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'font-upload-status';
    if (type) statusEl.classList.add(type);
    
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'font-upload-status';
      }, 3000);
    }
    return;
  }
  
  // 使用保存指示器
  const indicator = document.getElementById('save-indicator');
  if (indicator) {
    indicator.textContent = message;
    indicator.style.opacity = '1';
    setTimeout(() => {
      indicator.style.opacity = '0';
      setTimeout(() => {
        indicator.textContent = '已保存';
      }, 500);
    }, 2000);
  }
}

/**
 * 获取当前字体ID
 */
export function getCurrentFont() {
  return getFontSettings().fontId || 'system';
}
