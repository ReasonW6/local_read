// 服务端 API 功能集成测试
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const supertest = require('supertest');
const fs = require('fs');
const path = require('path');

let app, DIRS, request;

beforeAll(() => {
    const server = require('../../server.js');
    app = server.app;
    DIRS = server.DIRS;
    request = supertest(app);

    // 确保测试目录存在
    [DIRS.books, DIRS.config, DIRS.fonts].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
});

/* ========== 书籍管理功能测试 ========== */

describe('GET /api/bookshelf — 获取书籍列表', () => {
    it('应返回 200 和书籍数组', async () => {
        const res = await request.get('/api/bookshelf');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('每本书应包含 name 和 path 字段', async () => {
        const res = await request.get('/api/bookshelf');
        if (res.body.length > 0) {
            const book = res.body[0];
            expect(book).toHaveProperty('name');
            expect(book).toHaveProperty('path');
        }
    });
});

describe('POST /api/upload — 上传书籍', () => {
    const testFilePath = path.join(__dirname, 'test-upload.txt');

    beforeEach(() => {
        fs.writeFileSync(testFilePath, '这是一本测试书籍的内容\n第一章 开始\n正文内容...');
    });

    afterAll(() => {
        if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
        // 清理上传的文件
        const uploadedPath = path.join(DIRS.books, 'test-upload.txt');
        if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    });

    it('应成功上传 .txt 文件', async () => {
        const res = await request
            .post('/api/upload')
            .attach('books', testFilePath);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
    });

    it('应拒绝不支持的文件格式', async () => {
        const badFile = path.join(__dirname, 'test.xyz');
        fs.writeFileSync(badFile, 'bad content');
        try {
            const res = await request
                .post('/api/upload')
                .attach('books', badFile);
            expect(res.status).toBeGreaterThanOrEqual(400);
        } finally {
            if (fs.existsSync(badFile)) fs.unlinkSync(badFile);
        }
    });
});

describe('GET /api/book — 读取书籍内容', () => {
    const testBookPath = 'api-test-book.txt';

    beforeAll(() => {
        const fullPath = path.join(DIRS.books, testBookPath);
        fs.writeFileSync(fullPath, '测试内容，用于API测试');
    });

    afterAll(() => {
        const fullPath = path.join(DIRS.books, testBookPath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    });

    it('应返回书籍文件内容', async () => {
        const res = await request
            .get(`/api/book?path=${encodeURIComponent(testBookPath)}`);
        expect(res.status).toBe(200);
    });

    it('应返回 404 对不存在的书籍', async () => {
        const res = await request
            .get('/api/book?path=nonexistent-book-12345.epub');
        expect(res.status).toBe(404);
    });
});

/* ========== 配置管理功能测试 ========== */

describe('配置管理 — 保存/加载/列表/删除', () => {
    const testConfigName = 'vitest-test-config.json';

    afterAll(() => {
        const configPath = path.join(DIRS.config, testConfigName);
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    });

    it('POST /api/save-config — 应保存配置', async () => {
        const config = {
            settings: { theme: 'dark', fontSize: 18 },
            readingPrefs: { lineHeight: 1.8 },
            metadata: { version: '1.0.0' }
        };

        const res = await request
            .post('/api/save-config')
            .send({ config, filename: testConfigName });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('filename');
    });

    it('GET /api/config-list — 应返回配置列表', async () => {
        const res = await request.get('/api/config-list');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('configs');
        expect(Array.isArray(res.body.configs)).toBe(true);
    });

    it('GET /api/load-config/:filename — 应加载已保存的配置', async () => {
        const res = await request.get(`/api/load-config/${testConfigName}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('config');
        expect(res.body.config).toHaveProperty('settings');
        expect(res.body.config.settings.theme).toBe('dark');
    });

    it('GET /api/load-config/:filename — 应返回 404 对不存在的配置', async () => {
        const res = await request.get('/api/load-config/nonexistent-config.json');
        expect(res.status).toBe(404);
    });

    it('DELETE /api/config/:filename — 应删除配置文件', async () => {
        const tempName = 'vitest-temp-delete.json';
        await request
            .post('/api/save-config')
            .send({ config: { test: true }, filename: tempName });

        const res = await request.delete(`/api/config/${tempName}`);
        expect(res.status).toBe(200);

        const configPath = path.join(DIRS.config, tempName);
        expect(fs.existsSync(configPath)).toBe(false);
    });
});

/* ========== 书籍删除功能测试 ========== */

describe('DELETE /api/book — 删除书籍', () => {
    it('应成功删除存在的书籍', async () => {
        const testPath = 'delete-test-book.txt';
        const fullPath = path.join(DIRS.books, testPath);
        fs.writeFileSync(fullPath, 'test content for deletion');

        // DELETE /api/book 使用 query 参数 path
        const res = await request
            .delete(`/api/book?path=${encodeURIComponent(testPath)}`);
        expect(res.status).toBe(200);
        expect(fs.existsSync(fullPath)).toBe(false);
    });

    it('应返回 404 对不存在的书籍', async () => {
        const res = await request
            .delete('/api/book?path=nonexistent-book-xyz.epub');
        expect(res.status).toBe(404);
    });
});

/* ========== 字体管理功能测试 ========== */

describe('GET /api/fonts — 字体列表', () => {
    it('应返回字体数组', async () => {
        const res = await request.get('/api/fonts');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

/* ========== 封面功能测试 ========== */

describe('GET /api/book-cover — 书籍封面', () => {
    it('应返回 404 对不存在的书籍', async () => {
        const res = await request
            .get('/api/book-cover?path=nonexistent-book-cover.epub');
        expect(res.status).toBe(404);
    });

    it('对 TXT 文件应返回 cover: null', async () => {
        const testPath = 'cover-test.txt';
        const fullPath = path.join(DIRS.books, testPath);
        fs.writeFileSync(fullPath, 'test content');

        try {
            const res = await request
                .get(`/api/book-cover?path=${encodeURIComponent(testPath)}`);
            expect(res.status).toBe(200);
            expect(res.body.cover).toBeNull();
        } finally {
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
    });
});
