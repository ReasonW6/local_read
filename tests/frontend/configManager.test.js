// 配置管理器回归测试
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../../src/js/modules/configManager.js';
import { updateState } from '../../src/js/core/state.js';
import { getFileKey } from '../../src/js/core/config.js';

function setupDom() {
    document.body.innerHTML = `
      <div id="bookmarkList"></div>
      <button id="themeToggle"><span></span></button>
      <span id="currentTheme"></span>
      <span id="currentFontSize"></span>
      <input id="progressBarToggle" type="checkbox" />
      <input id="paraSpacingInput" />
      <input id="letterSpacingInput" />
      <input id="lineHeightInput" />
      <input id="pageWidthInput" />
      <input id="pageMarginInput" />
      <span id="paraSpacingVal"></span>
      <span id="letterSpacingVal"></span>
      <span id="lineHeightVal"></span>
      <span id="pageWidthVal"></span>
      <span id="pageMarginVal"></span>
    `;
}

beforeEach(() => {
    localStorage.clear();
    setupDom();
    updateState({
        type: null,
        book: null,
        rendition: null,
        chapters: [],
        currentIndex: 0,
        currentChapterIndex: -1,
        fontSize: 18,
        theme: 'light',
        txtPages: [],
        currentFileKey: getFileKey('book.epub'),
        bookshelf: [],
        sidebarView: 'toc',
        isNavigating: false,
        lastReadBook: null,
        readingHistory: {},
        currentlyReading: null,
        bookmarks: []
    });
});

describe('ConfigManager.applyConfig', () => {
    it('导入书签后应使用安全渲染并保留 location 结构', async () => {
        const manager = new ConfigManager();
        const maliciousTitle = '\"><img src=x onerror=alert(1)>';

        await manager.applyConfig({
            bookmarks: {
                'book.epub': [{
                    id: 'bm-1',
                    title: maliciousTitle,
                    timestamp: Date.now(),
                    createdAt: '2026/03/25 12:00:00',
                    location: {
                        type: 'txt',
                        chapterIndex: 1,
                        chapterTitle: '第二章'
                    }
                }]
            }
        });

        const bookmarkList = document.getElementById('bookmarkList');
        const titleEl = bookmarkList.querySelector('.bookmark-title');
        const deleteBtn = bookmarkList.querySelector('.bookmark-delete');

        expect(titleEl).not.toBeNull();
        expect(titleEl.textContent).toContain(maliciousTitle);
        expect(bookmarkList.querySelectorAll('img')).toHaveLength(0);
        expect(deleteBtn.getAttribute('onclick')).toContain("bm-1");

        const stored = JSON.parse(localStorage.getItem('bookmarks'));
        expect(stored[getFileKey('book.epub')][0].location.chapterIndex).toBe(1);
    });
});
