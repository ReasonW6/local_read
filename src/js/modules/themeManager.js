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
    state.rendition.themes.select(newTheme);
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