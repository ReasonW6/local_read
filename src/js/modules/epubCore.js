// Enhanced EPUB core functionality with improved theme handling
import { state, updateState } from '../core/state.js';
import { DOM } from '../core/config.js';

// Enhanced theme registration with forced refresh
export function registerAndApplyEpubTheme(theme) {
  if (!state.rendition) return;
  
  const commonStyles = { 
    "line-height": "2", 
    "font-family": '"Microsoft YaHei", sans-serif', 
    "padding": "0 !important", 
    "margin": "0 !important",
    "box-sizing": "border-box !important"
  };
  
  const imageStyles = {
    "max-width": "100% !important",
    "height": "auto !important",
    "display": "block !important",
    "margin": "1em auto !important"
  };
  
  // 强制清除所有现有样式
  const contents = state.rendition.getContents();
  contents.forEach(content => {
    if (content && content.document) {
      const existingStyles = content.document.querySelectorAll('style[data-epub-theme]');
      existingStyles.forEach(style => style.remove());
    }
  });
  
  // 重新注册主题
  try {
    state.rendition.themes.clear();
  } catch (e) {
    // 忽略清除错误
  }
  
  const lightTheme = {
    "body": { 
      ...commonStyles, 
      "color": "#3D3D3D !important", 
      "background-color": "#FAF7ED !important" 
    },
    "p, div, span, h1, h2, h3, h4, h5, h6, li, td, th": { 
      "color": "#3D3D3D !important" 
    },
    "img, image, svg": {
      ...imageStyles
    },
    "*": { 
      "background-color": "transparent !important" 
    }
  };
  
  const darkTheme = {
    "body": { 
      ...commonStyles, 
      "color": "#BDBDBD !important", 
      "background-color": "#121212 !important" 
    }, 
    "p, div, span, h1, h2, h3, h4, h5, h6, li, td, th": { 
      "color": "#BDBDBD !important" 
    },
    "img, image, svg": {
      ...imageStyles
    },
    "*": { 
      "background-color": "transparent !important" 
    }
  };
  
  state.rendition.themes.register("light", lightTheme);
  state.rendition.themes.register("dark", darkTheme);
  
  // 应用主题并强制刷新
  state.rendition.themes.select(theme);
  
  // 延迟再次应用确保生效
  setTimeout(() => {
    state.rendition.themes.select(theme);
    
    // 直接注入CSS样式作为备用方案
    const contents = state.rendition.getContents();
    contents.forEach(content => {
      if (content && content.document) {
        const styleId = 'epub-theme-override';
        let existingStyle = content.document.getElementById(styleId);
        if (existingStyle) {
          existingStyle.remove();
        }
        
        const style = content.document.createElement('style');
        style.id = styleId;
        style.setAttribute('data-epub-theme', theme);
        
        const themeStyles = theme === 'light' ? 
          `body, p, div, span, h1, h2, h3, h4, h5, h6, li, td, th { 
             color: #3D3D3D !important; 
             background-color: transparent !important; 
           }
           body { background-color: #FAF7ED !important; }
           img, image, svg { 
             max-width: 100% !important; 
             height: auto !important; 
             display: block !important; 
             margin: 1em auto !important; 
           }` :
          `body, p, div, span, h1, h2, h3, h4, h5, h6, li, td, th { 
             color: #BDBDBD !important; 
             background-color: transparent !important; 
           }
           body { background-color: #121212 !important; }
           img, image, svg { 
             max-width: 100% !important; 
             height: auto !important; 
             display: block !important; 
             margin: 1em auto !important; 
           }`;
        
        style.textContent = themeStyles;
        content.document.head.appendChild(style);
      }
    });
  }, 150);
}

// Enhanced font size application
export function applyEpubFontSize(fontSize) {
  if (!state.rendition) return;
  
  const reader = DOM.reader();
  if (reader) {
    reader.style.fontSize = fontSize + 'px';
  }
  
  state.rendition.themes.fontSize(fontSize + 'px');
  
  // 直接设置容器字体大小
  const container = document.getElementById('epub-container');
  if (container) {
    container.style.fontSize = fontSize + 'px';
  }
}