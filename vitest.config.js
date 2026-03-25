import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // 全局超时
        testTimeout: 10000,
        // 测试文件匹配模式
        include: ['tests/**/*.test.{js,mjs}'],
        // 环境配置
        environmentMatchGlobs: [
            // 前端测试使用 jsdom 环境
            ['tests/frontend/**', 'jsdom'],
            // 服务端测试使用 node 环境
            ['tests/server/**', 'node']
        ]
    }
});
