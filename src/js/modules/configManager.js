// Configuration management module
import { state, updateState } from '../core/state.js';
import { CONFIG } from '../core/config.js';

// 配置管理器
export class ConfigManager {
  constructor() {
    this.currentConfigName = null;
  }

  // 收集所有用户数据
  collectAllData() {
    const allData = {
      // 应用设置
      settings: {
        theme: state.theme,
        fontSize: state.fontSize,
      },
      
      // 阅读偏好
      readingPrefs: this.getReadingPrefs(),
      
      // 最后阅读的书籍
      lastReadBook: state.lastReadBook,
      
      // 阅读历史记录
      readingHistory: state.readingHistory || {},
      
      // 当前正在阅读的书籍
      currentlyReading: state.currentlyReading,
      
      // 所有书籍的阅读进度
      readingProgress: this.getAllReadingProgress(),
      
      // 所有书签
      bookmarks: this.getAllBookmarks(),
      
      // 元数据
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        appName: 'Local E-Book Reader',
        booksCount: state.bookshelf.length,
        description: '本地电子书阅读器完整配置文件'
      }
    };
    
    return allData;
  }

  // 获取阅读偏好设置
  getReadingPrefs() {
    try {
      const raw = localStorage.getItem('reader_prefs_v1');
      return raw ? JSON.parse(raw) : { paraSpacing: 1, letterSpacing: 0.2 };
    } catch (e) {
      return { paraSpacing: 1, letterSpacing: 0.2 };
    }
  }

  // 获取所有阅读进度
  getAllReadingProgress() {
    const progress = {};
    
    // 遍历localStorage中所有以'server_reader_'开头的键
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('server_reader_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          const bookPath = key.replace('server_reader_', '');
          progress[bookPath] = data;
        } catch (e) {
          console.warn(`Failed to parse progress for ${key}:`, e);
        }
      }
    }
    
    return progress;
  }

  // 获取所有书签
  getAllBookmarks() {
    const allBookmarks = {};
    
    // 遍历localStorage中所有以'bookmarks_'开头的键
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('bookmarks_')) {
        try {
          const bookmarks = JSON.parse(localStorage.getItem(key));
          const bookPath = key.replace('bookmarks_', '');
          allBookmarks[bookPath] = bookmarks;
        } catch (e) {
          console.warn(`Failed to parse bookmarks for ${key}:`, e);
        }
      }
    }
    
    return allBookmarks;
  }

  // 保存配置到服务器
  async saveConfig(customName = null) {
    try {
      const config = this.collectAllData();
      
      const response = await fetch('/api/save-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: config,
          filename: customName
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save config');
      }
      
      const result = await response.json();
      this.currentConfigName = result.filename;
      
      // 显示成功消息
      this.showMessage('配置保存成功！文件名: ' + result.filename, 'success');
      
      return result;
    } catch (error) {
      console.error('Error saving config:', error);
      this.showMessage('保存配置失败: ' + error.message, 'error');
      throw error;
    }
  }

  // 从服务器加载配置
  async loadConfig(filename) {
    try {
      const response = await fetch(`/api/load-config/${filename}`);
      
      if (!response.ok) {
        throw new Error('Failed to load config');
      }
      
      const result = await response.json();
      await this.applyConfig(result.config);
      
      this.currentConfigName = filename;
      this.showMessage('配置加载成功！', 'success');
      
      return result.config;
    } catch (error) {
      console.error('Error loading config:', error);
      this.showMessage('加载配置失败: ' + error.message, 'error');
      throw error;
    }
  }

  // 应用配置
  async applyConfig(config) {
    try {
      // 应用设置
      if (config.settings) {
        if (config.settings.theme && config.settings.theme !== state.theme) {
          updateState({ theme: config.settings.theme });
          document.body.setAttribute('data-theme', config.settings.theme);
          this.updateThemeUI();
        }
        
        if (config.settings.fontSize && config.settings.fontSize !== state.fontSize) {
          updateState({ fontSize: config.settings.fontSize });
          this.updateFontSizeUI();
        }
      }

      // 应用阅读偏好
      if (config.readingPrefs) {
        localStorage.setItem('reader_prefs_v1', JSON.stringify(config.readingPrefs));
        this.applyReadingPrefs(config.readingPrefs);
      }

      // 应用最后阅读的书籍
      if (config.lastReadBook) {
        updateState({ lastReadBook: config.lastReadBook });
        localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_READ_BOOK, JSON.stringify(config.lastReadBook));
      }

      // 应用阅读历史记录
      if (config.readingHistory) {
        updateState({ readingHistory: config.readingHistory });
        localStorage.setItem(CONFIG.STORAGE_KEYS.READING_HISTORY, JSON.stringify(config.readingHistory));
      }

      // 注意：不恢复 currentlyReading 状态，因为应用重启时用户并未实际在阅读
      // currentlyReading 只应在用户真正打开书籍时设置

      // 应用阅读进度
      if (config.readingProgress) {
        Object.entries(config.readingProgress).forEach(([bookPath, progress]) => {
          const key = 'server_reader_' + bookPath;
          localStorage.setItem(key, JSON.stringify(progress));
        });
      }

      // 应用书签
      if (config.bookmarks) {
        Object.entries(config.bookmarks).forEach(([bookPath, bookmarks]) => {
          const key = 'bookmarks_' + bookPath;
          localStorage.setItem(key, JSON.stringify(bookmarks));
        });
      }

      // 如果当前有打开的书籍，重新加载书签
      if (state.currentFileKey) {
        const bookmarks = this.loadBookmarksForCurrentBook();
        updateState({ bookmarks });
        this.renderBookmarks();
      }

      // 重新渲染书架以显示更新的阅读历史
      if (state.bookshelf && state.bookshelf.length > 0) {
        // 导入renderBookshelf函数并重新渲染
        import('./fileManager.js').then(({ renderBookshelf }) => {
          renderBookshelf();
        });
      }

      this.showMessage('所有配置已成功应用！', 'success');
    } catch (error) {
      console.error('Error applying config:', error);
      this.showMessage('应用配置时出错: ' + error.message, 'error');
    }
  }

  // 应用阅读偏好
  applyReadingPrefs(prefs) {
    document.documentElement.style.setProperty('--para-spacing', String(prefs.paraSpacing));
    document.documentElement.style.setProperty('--letter-spacing', `${prefs.letterSpacing}px`);
    
    // 更新设置面板中的滑块值
    const paraSpacingInput = document.getElementById('paraSpacingInput');
    const letterSpacingInput = document.getElementById('letterSpacingInput');
    const paraSpacingVal = document.getElementById('paraSpacingVal');
    const letterSpacingVal = document.getElementById('letterSpacingVal');
    
    if (paraSpacingInput) {
      paraSpacingInput.value = prefs.paraSpacing;
      if (paraSpacingVal) paraSpacingVal.textContent = prefs.paraSpacing;
    }
    
    if (letterSpacingInput) {
      letterSpacingInput.value = prefs.letterSpacing;
      if (letterSpacingVal) letterSpacingVal.textContent = prefs.letterSpacing + 'px';
    }
  }

  // 更新主题UI
  updateThemeUI() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      const span = themeToggle.querySelector('span');
      if (span) {
        span.textContent = state.theme === 'dark' ? '日间' : '夜间';
      }
    }
    
    const currentTheme = document.getElementById('currentTheme');
    if (currentTheme) {
      currentTheme.textContent = state.theme === 'dark' ? '夜间模式' : '日间模式';
    }
  }

  // 更新字体大小UI
  updateFontSizeUI() {
    const currentFontSize = document.getElementById('currentFontSize');
    if (currentFontSize) {
      currentFontSize.textContent = state.fontSize + 'px';
    }
  }

  // 加载当前书籍的书签
  loadBookmarksForCurrentBook() {
    if (!state.currentFileKey) return [];
    
    try {
      const bookPath = state.currentFileKey.replace('server_reader_', '');
      const key = 'bookmarks_' + bookPath;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('Failed to load bookmarks:', e);
      return [];
    }
  }

  // 渲染书签
  renderBookmarks() {
    const bookmarkList = document.getElementById('bookmarkList');
    if (!bookmarkList) return;
    
    bookmarkList.innerHTML = '';
    
    if (state.bookmarks.length === 0) {
      bookmarkList.innerHTML = '<div class="muted" style="padding: 10px;">暂无书签</div>';
      return;
    }
    
    state.bookmarks.forEach((bookmark, index) => {
      const el = document.createElement('div');
      el.className = 'chapter-item';
      el.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:600">${bookmark.title || '书签 ' + (index + 1)}</div>
          <div class="muted" style="font-size:12px">${new Date(bookmark.timestamp).toLocaleString()}</div>
        </div>
        <button onclick="removeBookmark(${index})" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;" title="删除书签">×</button>
      `;
      el.onclick = (e) => {
        if (e.target.tagName !== 'BUTTON') {
          this.goToBookmark(bookmark);
        }
      };
      bookmarkList.appendChild(el);
    });
  }

  // 跳转到书签
  goToBookmark(bookmark) {
    if (state.type === 'epub' && state.rendition) {
      state.rendition.display(bookmark.cfi);
    } else if (state.type === 'txt' && typeof bookmark.pageIndex === 'number') {
      state.currentIndex = bookmark.pageIndex;
      this.renderTxtPage();
    }
  }

  // 获取配置文件列表
  async getConfigList() {
    try {
      const response = await fetch('/api/config-list');
      
      if (!response.ok) {
        throw new Error('Failed to get config list');
      }
      
      const result = await response.json();
      return result.configs;
    } catch (error) {
      console.error('Error getting config list:', error);
      throw error;
    }
  }

  // 删除配置文件
  async deleteConfig(filename) {
    try {
      const response = await fetch(`/api/config/${filename}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete config');
      }
      
      const result = await response.json();
      this.showMessage('配置文件删除成功！', 'success');
      return result;
    } catch (error) {
      console.error('Error deleting config:', error);
      this.showMessage('删除配置失败: ' + error.message, 'error');
      throw error;
    }
  }

  // 下载配置文件
  downloadConfig(filename) {
    const link = document.createElement('a');
    link.href = `/api/download-config/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 显示消息
  showMessage(message, type = 'info') {
    // 创建消息元素
    const messageEl = document.createElement('div');
    messageEl.className = `config-message config-message-${type}`;
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 4px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      ${type === 'success' ? 'background: #4CAF50;' : ''}
      ${type === 'error' ? 'background: #f44336;' : ''}
      ${type === 'info' ? 'background: #2196F3;' : ''}
    `;
    
    document.body.appendChild(messageEl);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (document.body.contains(messageEl)) {
        document.body.removeChild(messageEl);
      }
    }, 3000);
  }
}

// 创建全局配置管理器实例
export const configManager = new ConfigManager();
