// 服务端工具函数单元测试
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');

let utils, DIRS, ALLOWED_EXTENSIONS;

beforeAll(() => {
    const server = require('../../server.js');
    utils = server.utils;
    DIRS = server.DIRS;
    ALLOWED_EXTENSIONS = server.ALLOWED_EXTENSIONS;
});

/* ========== normalizePath ========== */

describe('utils.normalizePath', () => {
    it('应将反斜杠转为正斜杠', () => {
        expect(utils.normalizePath('books\\test\\file.epub')).toBe('books/test/file.epub');
    });

    it('应保留正斜杠不变', () => {
        expect(utils.normalizePath('books/test/file.epub')).toBe('books/test/file.epub');
    });

    it('处理空字符串', () => {
        expect(utils.normalizePath('')).toBe('');
    });

    it('处理 undefined', () => {
        expect(utils.normalizePath()).toBe('');
    });
});

/* ========== resolveBookPath ========== */

describe('utils.resolveBookPath', () => {
    it('应解析正常的相对路径', () => {
        const result = utils.resolveBookPath('test.epub');
        expect(result).toContain('test.epub');
        expect(path.isAbsolute(result)).toBe(true);
    });

    it('应解析含子目录的路径', () => {
        const result = utils.resolveBookPath('subfolder/test.epub');
        expect(result).toContain('subfolder');
        expect(result).toContain('test.epub');
    });

    it('路径遍历攻击 (..) 应被安全化（解析到 books 目录内）', () => {
        // 正则会剥离开头的 ../，所以结果仍在 books 目录内
        const result = utils.resolveBookPath('../../etc/passwd');
        const booksRoot = path.resolve(DIRS.books);
        expect(result.toLowerCase().startsWith(booksRoot.toLowerCase())).toBe(true);
    });

    it('路径遍历攻击 (..\\\\) 应被安全化', () => {
        const result = utils.resolveBookPath('..\\..\\windows\\system32');
        const booksRoot = path.resolve(DIRS.books);
        expect(result.toLowerCase().startsWith(booksRoot.toLowerCase())).toBe(true);
    });

    it('处理空字符串', () => {
        const result = utils.resolveBookPath('');
        expect(path.isAbsolute(result)).toBe(true);
    });
});

/* ========== resolveConfigPath ========== */

describe('utils.resolveConfigPath', () => {
    it('应解析 .json 配置文件', () => {
        const result = utils.resolveConfigPath('user-config.json');
        expect(result).toContain('user-config.json');
        expect(path.isAbsolute(result)).toBe(true);
    });

    it('应拒绝非 .json 文件', () => {
        expect(() => utils.resolveConfigPath('config.txt')).toThrow('Invalid config file type');
    });

    it('应拒绝非 .json 扩展名', () => {
        expect(() => utils.resolveConfigPath('evil.exe')).toThrow('Invalid config file type');
    });

    it('路径遍历攻击应被安全化（解析到 config 目录内）', () => {
        // 正则剥离 ../，结果在 config 目录内但扩展名不是 .json 时会报错
        expect(() => utils.resolveConfigPath('../../etc/passwd')).toThrow('Invalid config file type');
    });

    it('即使路径遍历带 .json，也应安全化到 config 目录内', () => {
        const result = utils.resolveConfigPath('../../etc/config.json');
        const configRoot = path.resolve(DIRS.config);
        expect(result.toLowerCase().startsWith(configRoot.toLowerCase())).toBe(true);
    });
});

/* ========== decodeFilename ========== */

describe('utils.decodeFilename', () => {
    it('应正确解码 ASCII 文件名', () => {
        expect(utils.decodeFilename('test.epub')).toBe('test.epub');
    });

    it('处理含空格的文件名', () => {
        expect(utils.decodeFilename('my book.epub')).toBe('my book.epub');
    });
});

/* ========== isAllowedExtension ========== */

describe('utils.isAllowedExtension', () => {
    it('应接受 .epub 文件', () => {
        expect(utils.isAllowedExtension('book.epub')).toBe(true);
    });

    it('应接受 .txt 文件', () => {
        expect(utils.isAllowedExtension('book.txt')).toBe(true);
    });

    it('应接受 .pdf 文件', () => {
        expect(utils.isAllowedExtension('book.pdf')).toBe(true);
    });

    it('应拒绝 .exe 文件', () => {
        expect(utils.isAllowedExtension('virus.exe')).toBe(false);
    });

    it('应拒绝 .js 文件', () => {
        expect(utils.isAllowedExtension('script.js')).toBe(false);
    });

    it('应拒绝 .html 文件', () => {
        expect(utils.isAllowedExtension('page.html')).toBe(false);
    });

    it('应不区分大小写', () => {
        expect(utils.isAllowedExtension('book.EPUB')).toBe(true);
        expect(utils.isAllowedExtension('book.Pdf')).toBe(true);
    });
});
