// Theme management functionality
import { state, updateState } from '../core/state.js';
import { DOM, CONFIG } from '../core/config.js';
import { applyFontSize } from './epubReader.js';
import { applyTxtFontSize } from './txtReader.js';

// Toggle theme between light and dark
export function toggleTheme() {
  const newTheme = (state.theme === CONFIG.THEMES.LIGHT) ? CONFIG.THEMES.DARK : CONFIG.THEMES.LIGHT;
  updateState({ theme: newTheme });
  
  // Update body theme attribute
  document.body.dataset.theme = newTheme;
  
  // Update theme toggle button text
  const themeToggle = DOM.themeToggle();
  if (themeToggle) {
    const themeLabel = themeToggle.querySelector('span');
    if (themeLabel) {
      themeLabel.textContent = newTheme === CONFIG.THEMES.LIGHT ? '夜间' : '日间';
    }
  }
  
  // Apply theme to EPUB if applicable
  if (state.rendition && state.type === 'epub') {
    // 使用增强的主题应用功能
    import('./epubCore.js').then(({ registerAndApplyEpubTheme }) => {
      registerAndApplyEpubTheme(newTheme);
    });
  }
}

// Change font size
export function changeFontSize(delta) {
  const newSize = state.fontSize + delta;
  if (newSize < CONFIG.MIN_FONT_SIZE || newSize > CONFIG.MAX_FONT_SIZE) return;
  
  updateState({ fontSize: newSize });
  
  // Apply font size based on current book type
  if (state.type === 'epub') {
    applyFontSize();
  } else if (state.type === 'txt') {
    applyTxtFontSize();
  }
}

// Set font size directly (for loading saved state)
export function setFontSize(fontSize) {
  if (fontSize < CONFIG.MIN_FONT_SIZE || fontSize > CONFIG.MAX_FONT_SIZE) return;
  
  updateState({ fontSize });
  
  // Apply font size based on current book type
  if (state.type === 'epub') {
    applyFontSize();
  } else if (state.type === 'txt') {
    applyTxtFontSize();
  }
}

// Set theme directly (for loading saved state)
export function setTheme(theme) {
  if (theme !== CONFIG.THEMES.LIGHT && theme !== CONFIG.THEMES.DARK) return;
  
  updateState({ theme });
  
  // Update body theme attribute
  document.body.dataset.theme = theme;
  
  // Update theme toggle button text
  const themeToggle = DOM.themeToggle();
  if (themeToggle) {
    const themeLabel = themeToggle.querySelector('span');
    if (themeLabel) {
      themeLabel.textContent = theme === CONFIG.THEMES.LIGHT ? '夜间' : '日间';
    }
  }
  
  // Apply theme to EPUB if applicable
  if (state.rendition && state.type === 'epub') {
    // 使用增强的主题应用功能
    import('./epubCore.js').then(({ registerAndApplyEpubTheme }) => {
      registerAndApplyEpubTheme(theme);
    });
  }
}

// Initialize theme on page load
export function initializeTheme() {
  // Set initial theme
  document.body.dataset.theme = state.theme;
  
  // Update theme toggle button text
  const themeToggle = DOM.themeToggle();
  if (themeToggle) {
    const themeLabel = themeToggle.querySelector('span');
    if (themeLabel) {
      themeLabel.textContent = state.theme === CONFIG.THEMES.LIGHT ? '夜间' : '日间';
    }
  }
}
