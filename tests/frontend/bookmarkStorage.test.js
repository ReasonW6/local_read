// 书签存储兼容性测试
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getFileKey } from '../../src/js/core/config.js';
import {
    getStoredBookmarkMap,
    getBookmarksForStorageKey,
    normalizeImportedBookmarkMap,
    persistBookmarkMap
} from '../../src/js/modules/bookmarkStorage.js';

beforeEach(() => {
    localStorage.clear();
});

describe('bookmarkStorage', () => {
    it('应合并 canonical 与 legacy 书签存储', () => {
        localStorage.setItem('bookmarks', JSON.stringify({
            [getFileKey('book-a.epub')]: [{ id: 'a1' }]
        }));
        localStorage.setItem('bookmarks_book-b.epub', JSON.stringify([{ id: 'b1' }]));

        const result = getStoredBookmarkMap();

        expect(result[getFileKey('book-a.epub')]).toEqual([{ id: 'a1' }]);
        expect(result[getFileKey('book-b.epub')]).toEqual([{ id: 'b1' }]);
    });

    it('应将导入配置中的书籍路径规范化为运行时 key', () => {
        const result = normalizeImportedBookmarkMap({
            'folder/book.epub': [{ id: '1' }],
            [getFileKey('other.epub')]: [{ id: '2' }],
            invalid: 'not-an-array'
        });

        expect(result[getFileKey('folder/book.epub')]).toEqual([{ id: '1' }]);
        expect(result[getFileKey('other.epub')]).toEqual([{ id: '2' }]);
        expect(result[getFileKey('invalid')]).toBeUndefined();
    });

    it('应写回 canonical 存储并清理 legacy 键', () => {
        localStorage.setItem('bookmarks_old.epub', JSON.stringify([{ id: 'old' }]));

        persistBookmarkMap({
            'folder/book.epub': [{ id: '1' }]
        });

        expect(localStorage.getItem('bookmarks_old.epub')).toBeNull();
        expect(JSON.parse(localStorage.getItem('bookmarks'))).toEqual({
            [getFileKey('folder/book.epub')]: [{ id: '1' }]
        });
        expect(getBookmarksForStorageKey('folder/book.epub')).toEqual([{ id: '1' }]);
    });
});
