// server.js - Local E-Book Reader Server (浏览器模式)
const path = require('path');
const express = require('express');
const { createApp } = require('./shared/server-core');

const PORT = 3000;

// 目录配置
const DIRS = {
  books: path.join(__dirname, 'books'),
  config: path.join(__dirname, 'user-data'),
  fonts: path.join(__dirname, 'user-data', 'fonts')
};

// 创建 Express 应用（复用共享核心）
const { app, utils, ALLOWED_EXTENSIONS } = createApp(DIRS);

// PERF-3: 浏览器模式添加静态文件缓存头，减少重复文件读取
app.use(express.static(__dirname, { maxAge: '1h' }));

// 启动服务器（仅直接运行时监听，被 require 时不监听，便于测试）
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`E-book reader server listening at http://localhost:${PORT}`);
    console.log(`Place your .epub, .txt and .pdf files in the "${DIRS.books}" folder.`);
  });
}

// 导出供测试使用
module.exports = { app, utils, DIRS, ALLOWED_EXTENSIONS };
