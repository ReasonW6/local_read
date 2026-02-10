// 前端核心工具函数单元测试
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    DEFAULT_READING_PREFS,
    clamp,
    normalizePrefs,
    computeVerticalPadding,
    formatFileSize,
    formatDecimal,
    formatTimeAgo,
    getFileExtension,
    deriveBookNameFromPath,
    debounce,
    throttle
} from '../../src/js/core/utils.js';

/* ========== DEFAULT_READING_PREFS ========== */

describe('DEFAULT_READING_PREFS', () => {
    it('应包含所有必要字段', () => {
        expect(DEFAULT_READING_PREFS).toHaveProperty('paraSpacing');
        expect(DEFAULT_READING_PREFS).toHaveProperty('letterSpacing');
        expect(DEFAULT_READING_PREFS).toHaveProperty('lineHeight');
        expect(DEFAULT_READING_PREFS).toHaveProperty('pageWidth');
        expect(DEFAULT_READING_PREFS).toHaveProperty('pagePadding');
        expect(DEFAULT_READING_PREFS).toHaveProperty('progressBarEnabled');
    });

    it('默认值应合理', () => {
        expect(DEFAULT_READING_PREFS.pageWidth).toBeGreaterThanOrEqual(400);
        expect(DEFAULT_READING_PREFS.pageWidth).toBeLessThanOrEqual(2000);
        expect(DEFAULT_READING_PREFS.progressBarEnabled).toBe(true);
    });
});

/* ========== clamp ========== */

describe('clamp', () => {
    it('正常范围内的值不变', () => {
        expect(clamp(5, 0, 10, 0)).toBe(5);
    });

    it('小于最小值时返回最小值', () => {
        expect(clamp(-1, 0, 10, 0)).toBe(0);
    });

    it('大于最大值时返回最大值', () => {
        expect(clamp(15, 0, 10, 0)).toBe(10);
    });

    it('非数字值返回 fallback', () => {
        expect(clamp('abc', 0, 10, 5)).toBe(5);
        expect(clamp(undefined, 0, 10, 5)).toBe(5);
        expect(clamp(null, 0, 10, 5)).toBe(0); // Number(null) === 0
    });

    it('NaN 返回 fallback', () => {
        expect(clamp(NaN, 0, 10, 5)).toBe(5);
    });

    it('Infinity 返回 fallback', () => {
        expect(clamp(Infinity, 0, 10, 5)).toBe(5);
    });

    it('字符串数字应被正确转换', () => {
        expect(clamp('7', 0, 10, 5)).toBe(7);
    });
});

/* ========== normalizePrefs ========== */

describe('normalizePrefs', () => {
    it('无参数时返回默认值', () => {
        const result = normalizePrefs();
        expect(result).toEqual({
            paraSpacing: DEFAULT_READING_PREFS.paraSpacing,
            letterSpacing: DEFAULT_READING_PREFS.letterSpacing,
            lineHeight: DEFAULT_READING_PREFS.lineHeight,
            pageWidth: DEFAULT_READING_PREFS.pageWidth,
            pagePadding: DEFAULT_READING_PREFS.pagePadding,
            progressBarEnabled: true
        });
    });

    it('应将超出范围的值限制在有效范围内', () => {
        const result = normalizePrefs({
            paraSpacing: 100,
            letterSpacing: -10,
            lineHeight: 0.1,
            pageWidth: 50,
            pagePadding: 500
        });
        expect(result.paraSpacing).toBeLessThanOrEqual(4);
        expect(result.letterSpacing).toBeGreaterThanOrEqual(0);
        expect(result.lineHeight).toBeGreaterThanOrEqual(1.0);
        expect(result.pageWidth).toBeGreaterThanOrEqual(400);
        expect(result.pagePadding).toBeLessThanOrEqual(150);
    });

    it('应合并传入的部分设置', () => {
        const result = normalizePrefs({ lineHeight: 2.0 });
        expect(result.lineHeight).toBe(2.0);
        expect(result.pageWidth).toBe(DEFAULT_READING_PREFS.pageWidth);
    });

    it('progressBarEnabled 默认为 true', () => {
        expect(normalizePrefs({}).progressBarEnabled).toBe(true);
        expect(normalizePrefs({ progressBarEnabled: false }).progressBarEnabled).toBe(false);
    });

    it('pageWidth 和 pagePadding 应为整数', () => {
        const result = normalizePrefs({ pageWidth: 800.7, pagePadding: 40.3 });
        expect(Number.isInteger(result.pageWidth)).toBe(true);
        expect(Number.isInteger(result.pagePadding)).toBe(true);
    });
});

/* ========== computeVerticalPadding ========== */

describe('computeVerticalPadding', () => {
    it('应返回 horizontal * 0.75 的四舍五入值', () => {
        expect(computeVerticalPadding(40)).toBe(30);
        expect(computeVerticalPadding(100)).toBe(75);
    });

    it('最小值不低于 8', () => {
        expect(computeVerticalPadding(5)).toBe(8);
        expect(computeVerticalPadding(0)).toBe(8);
    });

    it('非数字参数使用默认边距', () => {
        const defaultResult = Math.round(DEFAULT_READING_PREFS.pagePadding * 0.75);
        expect(computeVerticalPadding('abc')).toBe(defaultResult);
        expect(computeVerticalPadding(NaN)).toBe(defaultResult);
    });
});

/* ========== formatFileSize ========== */

describe('formatFileSize', () => {
    it('应正确格式化字节', () => {
        expect(formatFileSize(0)).toBe('0 B');
        expect(formatFileSize(500)).toBe('500 B');
    });

    it('应正确格式化 KB', () => {
        expect(formatFileSize(1024)).toBe('1 KB');
        expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('应正确格式化 MB', () => {
        expect(formatFileSize(1048576)).toBe('1 MB');
        expect(formatFileSize(5242880)).toBe('5 MB');
    });

    it('应正确格式化 GB', () => {
        expect(formatFileSize(1073741824)).toBe('1 GB');
    });
});

/* ========== formatDecimal ========== */

describe('formatDecimal', () => {
    it('整数不显示小数', () => {
        expect(formatDecimal(1)).toBe('1');
        expect(formatDecimal(2.0)).toBe('2');
    });

    it('一位小数正确显示', () => {
        expect(formatDecimal(1.5)).toBe('1.5');
        expect(formatDecimal(2.3)).toBe('2.3');
    });

    it('两位小数正确显示', () => {
        expect(formatDecimal(1.25)).toBe('1.25');
    });

    it('多位小数截断到两位', () => {
        expect(formatDecimal(1.999)).toBe('2');
        expect(formatDecimal(1.234)).toBe('1.23');
    });
});

/* ========== formatTimeAgo ========== */

describe('formatTimeAgo', () => {
    it('空值返回空字符串', () => {
        expect(formatTimeAgo(null)).toBe('');
        expect(formatTimeAgo(0)).toBe('');
        expect(formatTimeAgo(undefined)).toBe('');
    });

    it('刚刚（少于1分钟）', () => {
        expect(formatTimeAgo(Date.now() - 10000)).toBe('刚刚');
    });

    it('几分钟前', () => {
        expect(formatTimeAgo(Date.now() - 5 * 60 * 1000)).toBe('5分钟前');
    });

    it('几小时前', () => {
        expect(formatTimeAgo(Date.now() - 3 * 60 * 60 * 1000)).toBe('3小时前');
    });

    it('几天前', () => {
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
        expect(formatTimeAgo(threeDaysAgo)).toBe('3天前');
    });

    it('几周前', () => {
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        expect(formatTimeAgo(twoWeeksAgo)).toBe('2周前');
    });

    it('超过30天显示日期', () => {
        const longAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
        const result = formatTimeAgo(longAgo);
        expect(result).toMatch(/\d+\/\d+/);
    });
});

/* ========== getFileExtension ========== */

describe('getFileExtension', () => {
    it('应返回文件扩展名（小写）', () => {
        expect(getFileExtension('book.epub')).toBe('epub');
        expect(getFileExtension('book.TXT')).toBe('txt');
        expect(getFileExtension('book.Pdf')).toBe('pdf');
    });

    it('应处理多个点', () => {
        expect(getFileExtension('my.book.epub')).toBe('epub');
    });

    it('无扩展名返回文件名本身', () => {
        expect(getFileExtension('README')).toBe('readme');
    });
});

/* ========== deriveBookNameFromPath ========== */

describe('deriveBookNameFromPath', () => {
    it('应从路径中提取文件名', () => {
        expect(deriveBookNameFromPath('books/test.epub')).toBe('test.epub');
        expect(deriveBookNameFromPath('/path/to/book.txt')).toBe('book.txt');
    });

    it('应处理 Windows 路径', () => {
        expect(deriveBookNameFromPath('C:\\books\\test.epub')).toBe('test.epub');
    });

    it('空路径返回默认值', () => {
        expect(deriveBookNameFromPath('')).toBe('未知书籍');
        expect(deriveBookNameFromPath(null)).toBe('未知书籍');
        expect(deriveBookNameFromPath(undefined)).toBe('未知书籍');
    });

    it('只有文件名时直接返回', () => {
        expect(deriveBookNameFromPath('mybook.epub')).toBe('mybook.epub');
    });
});

/* ========== debounce ========== */

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('应在等待时间后执行', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('多次调用应只执行最后一次', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('a');
        debounced('b');
        debounced('c');

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith('c');
    });
});

/* ========== throttle ========== */

describe('throttle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('应立即执行第一次调用', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        expect(fn).toHaveBeenCalledOnce();
    });

    it('在节流期间不执行', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        throttled();
        throttled();

        expect(fn).toHaveBeenCalledOnce();
    });

    it('节流期过后可再次执行', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        expect(fn).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        throttled();
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
