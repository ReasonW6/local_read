// 前端配置模块单元测试
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { CONFIG, getFileKey } from '../../src/js/core/config.js';

/* ========== getFileKey ========== */

describe('getFileKey', () => {
    it('应在路径前添加 server_reader_ 前缀', () => {
        expect(getFileKey('books/test.epub')).toBe('server_reader_books/test.epub');
    });

    it('应处理空字符串', () => {
        expect(getFileKey('')).toBe('server_reader_');
    });

    it('应处理 Windows 路径', () => {
        expect(getFileKey('books\\test.epub')).toBe('server_reader_books\\test.epub');
    });

    it('应处理含中文的路径', () => {
        expect(getFileKey('书籍/测试.epub')).toBe('server_reader_书籍/测试.epub');
    });
});

/* ========== CONFIG 常量 ========== */

describe('CONFIG', () => {
    it('应包含字体大小限制', () => {
        expect(CONFIG.MIN_FONT_SIZE).toBeDefined();
        expect(CONFIG.MAX_FONT_SIZE).toBeDefined();
        expect(CONFIG.MIN_FONT_SIZE).toBeLessThan(CONFIG.MAX_FONT_SIZE);
    });

    it('应包含 API 路径', () => {
        expect(CONFIG.SERVER_API).toBeDefined();
        expect(CONFIG.SERVER_API.BOOKSHELF).toBeDefined();
        expect(CONFIG.SERVER_API.BOOK).toBeDefined();
        expect(CONFIG.SERVER_API.UPLOAD).toBeDefined();
        expect(CONFIG.SERVER_API.BOOK_COVER).toBeDefined();
    });

    it('应包含存储键', () => {
        expect(CONFIG.STORAGE_KEYS).toBeDefined();
        expect(CONFIG.STORAGE_KEYS.BOOKMARKS).toBeDefined();
        expect(CONFIG.STORAGE_KEYS.LAST_READ_BOOK).toBeDefined();
        expect(CONFIG.STORAGE_KEYS.READING_HISTORY).toBeDefined();
    });

    it('应包含主题定义', () => {
        expect(CONFIG.THEMES.LIGHT).toBe('light');
        expect(CONFIG.THEMES.DARK).toBe('dark');
    });

    it('应包含侧边栏视图定义', () => {
        expect(CONFIG.SIDEBAR_VIEWS.TOC).toBe('toc');
        expect(CONFIG.SIDEBAR_VIEWS.BOOKSHELF).toBe('bookshelf');
        expect(CONFIG.SIDEBAR_VIEWS.BOOKMARK).toBe('bookmark');
    });
});
