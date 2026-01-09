// electron-main.js - Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

// ==================== 性能优化：启动加速 ====================
// 禁用不必要的 Chromium 特性以加快启动速度
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// 高 DPI 支持
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-color-profile', 'srgb');

// 导入服务器模块
let server = null;
const PORT = 31337; // 使用非常见端口避免冲突

// 主窗口引用
let mainWindow = null;

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // 性能优化选项
      backgroundThrottling: false,
      spellcheck: false,
      enableWebSQL: false
    },
    show: false,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'default',
    autoHideMenuBar: true
  });

  // 窗口准备好后显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 加载应用
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // 开发环境下可按 F12 打开开发者工具（不再自动打开）
  // if (process.argv.includes('--dev')) {
  //   mainWindow.webContents.openDevTools();
  // }

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 启动内嵌服务器
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      // 延迟加载模块以加速启动
      const express = require('express');
      const multer = require('multer');
      const fs = require('fs');
      const AdmZip = require('adm-zip');

      const expressApp = express();

      // 目录配置 - 开发环境用项目目录，生产环境用用户目录
      const isPackaged = app.isPackaged;
      const dataPath = isPackaged ? app.getPath('userData') : __dirname;
      
      const DIRS = {
        books: path.join(dataPath, 'books'),
        config: path.join(dataPath, isPackaged ? 'config' : 'user-data'),
        fonts: path.join(dataPath, isPackaged ? 'config/fonts' : 'user-data/fonts')
      };

      // 支持的文件扩展名
      const ALLOWED_EXTENSIONS = ['.epub', '.txt', '.pdf'];
      const ALLOWED_FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];

      // MIME类型映射
      const FONT_MIME_TYPES = {
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
      };

      const IMAGE_MIME_TYPES = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };

      // 封面缓存
      const coverCache = new Map();

      // 确保目录存在
      Object.values(DIRS).forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      // 中间件配置
      expressApp.use(express.json({ limit: '10mb' }));
      // 静态文件服务 - 支持打包后的路径
      expressApp.use(express.static(__dirname));
      if (isPackaged) {
        expressApp.use('/books', express.static(DIRS.books));
        expressApp.use('/user-data', express.static(DIRS.config));
      }

      // 工具函数
      const utils = {
        normalizePath: (p = '') => p.split(path.sep).join('/'),
        resolveBookPath: (relativePath = '') => {
          const normalized = path.normalize(relativePath).replace(/^([\.\\/])+/, '');
          const resolved = path.resolve(DIRS.books, normalized);
          const booksRoot = path.resolve(DIRS.books);
          if (!resolved.toLowerCase().startsWith(booksRoot.toLowerCase())) {
            throw new Error('Invalid book path');
          }
          return resolved;
        },
        cleanupEmptyFolders: (startPath) => {
          let current = path.dirname(startPath);
          const booksRoot = path.resolve(DIRS.books);
          while (current.toLowerCase().startsWith(booksRoot.toLowerCase()) && current !== booksRoot) {
            try {
              if (fs.readdirSync(current).length === 0) {
                fs.rmdirSync(current);
                current = path.dirname(current);
              } else {
                break;
              }
            } catch {
              break;
            }
          }
        },
        decodeFilename: (filename) => Buffer.from(filename, 'latin1').toString('utf8'),
        isAllowedExtension: (filename) => {
          const ext = path.extname(filename).toLowerCase();
          return ALLOWED_EXTENSIONS.includes(ext);
        }
      };

      // 文件上传配置
      const storage = multer.diskStorage({
        destination: (req, file, cb) => {
          if (!fs.existsSync(DIRS.books)) {
            fs.mkdirSync(DIRS.books, { recursive: true });
          }
          cb(null, DIRS.books);
        },
        filename: (req, file, cb) => {
          const originalName = utils.decodeFilename(file.originalname);
          let finalName = originalName;
          let counter = 1;
          while (fs.existsSync(path.join(DIRS.books, finalName))) {
            const ext = path.extname(originalName);
            const nameWithoutExt = path.basename(originalName, ext);
            finalName = `${nameWithoutExt}(${counter})${ext}`;
            counter++;
          }
          cb(null, finalName);
        }
      });

      const upload = multer({
        storage,
        fileFilter: (req, file, cb) => {
          const originalName = utils.decodeFilename(file.originalname);
          if (utils.isAllowedExtension(originalName)) {
            cb(null, true);
          } else {
            cb(new Error('只支持 .epub, .txt, .pdf 文件格式'));
          }
        }
      });

      // 字体上传配置
      const fontStorage = multer.diskStorage({
        destination: (req, file, cb) => {
          if (!fs.existsSync(DIRS.fonts)) {
            fs.mkdirSync(DIRS.fonts, { recursive: true });
          }
          cb(null, DIRS.fonts);
        },
        filename: (req, file, cb) => {
          const originalName = utils.decodeFilename(file.originalname);
          let finalName = originalName;
          let counter = 1;
          while (fs.existsSync(path.join(DIRS.fonts, finalName))) {
            const ext = path.extname(originalName);
            const nameWithoutExt = path.basename(originalName, ext);
            finalName = `${nameWithoutExt}(${counter})${ext}`;
            counter++;
          }
          cb(null, finalName);
        }
      });

      const fontUpload = multer({
        storage: fontStorage,
        fileFilter: (req, file, cb) => {
          const originalName = utils.decodeFilename(file.originalname);
          const ext = path.extname(originalName).toLowerCase();
          if (ALLOWED_FONT_EXTENSIONS.includes(ext)) {
            cb(null, true);
          } else {
            cb(new Error('只支持 .ttf, .otf, .woff, .woff2 字体格式'));
          }
        },
        limits: { fileSize: 20 * 1024 * 1024 }
      });

      // EPUB封面提取
      const extractEpubCover = (absolutePath) => {
        try {
          const stats = fs.statSync(absolutePath);
          const cacheKey = absolutePath;
          const cached = coverCache.get(cacheKey);
          if (cached && cached.mtime === stats.mtimeMs) {
            return cached.data;
          }

          const zip = new AdmZip(absolutePath);
          const entries = zip.getEntries();
          if (!entries || entries.length === 0) return null;

          const imageEntries = entries.filter(entry => {
            if (entry.isDirectory) return false;
            const ext = path.extname(entry.entryName).toLowerCase();
            return Object.prototype.hasOwnProperty.call(IMAGE_MIME_TYPES, ext);
          });

          if (imageEntries.length === 0) return null;

          let coverEntry = imageEntries.find(entry => /cover/i.test(path.basename(entry.entryName)));
          if (!coverEntry) coverEntry = imageEntries[0];
          if (!coverEntry) return null;

          const data = coverEntry.getData();
          if (!data) return null;

          const ext = path.extname(coverEntry.entryName).toLowerCase();
          const mime = IMAGE_MIME_TYPES[ext] || 'image/jpeg';
          const base64 = data.toString('base64');
          const dataUrl = `data:${mime};base64,${base64}`;

          coverCache.set(cacheKey, { mtime: stats.mtimeMs, data: dataUrl });
          return dataUrl;
        } catch (error) {
          console.warn('Failed to extract EPUB cover:', error.message);
          return null;
        }
      };

      // 递归查找书籍
      const findBooks = (dir, fileList = [], parentDir = '') => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const fileStat = fs.statSync(filePath);
          const relativePath = path.join(parentDir, file);

          if (fileStat.isDirectory()) {
            findBooks(filePath, fileList, relativePath);
          } else if (utils.isAllowedExtension(file)) {
            const ext = path.extname(file).toLowerCase();
            fileList.push({
              name: file,
              path: utils.normalizePath(relativePath),
              extension: ext,
              size: fileStat.size,
              addedAt: fileStat.birthtimeMs || fileStat.ctimeMs,
              modifiedAt: fileStat.mtimeMs,
              coverAvailable: ext === '.epub'
            });
          }
        });
        return fileList;
      };

      // ==================== API 路由 ====================

      // 获取书架列表
      expressApp.get('/api/bookshelf', (req, res) => {
        try {
          if (!fs.existsSync(DIRS.books)) {
            fs.mkdirSync(DIRS.books);
          }
          const books = findBooks(DIRS.books);
          res.json(books);
        } catch (error) {
          console.error('Error reading bookshelf:', error);
          res.status(500).json({ error: 'Failed to read bookshelf directory.' });
        }
      });

      // 获取书籍封面
      expressApp.get('/api/book-cover', (req, res) => {
        try {
          const relPath = req.query.path;
          if (!relPath) {
            return res.status(400).json({ error: '缺少书籍路径' });
          }
          const absolutePath = utils.resolveBookPath(relPath);
          if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: '书籍不存在' });
          }
          const ext = path.extname(absolutePath).toLowerCase();
          if (ext !== '.epub') {
            return res.json({ success: true, cover: null });
          }
          const cover = extractEpubCover(absolutePath);
          res.json({ success: true, cover });
        } catch (error) {
          console.error('Error extracting cover:', error);
          res.status(500).json({ error: '封面提取失败: ' + error.message });
        }
      });

      // 保存用户配置
      expressApp.post('/api/save-config', (req, res) => {
        try {
          const { config, filename } = req.body;
          if (!config) {
            return res.status(400).json({ error: '配置数据不能为空' });
          }
          const configFilename = filename || `reader-config-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
          const configPath = path.join(DIRS.config, configFilename);
          const configWithMeta = {
            ...config,
            metadata: {
              ...config.metadata,
              savedAt: new Date().toISOString(),
              version: '1.0.0',
              appName: 'Local E-Book Reader'
            }
          };
          fs.writeFileSync(configPath, JSON.stringify(configWithMeta, null, 2));
          res.json({ success: true, message: '配置保存成功', filename: configFilename, path: configPath });
        } catch (error) {
          console.error('Error saving config:', error);
          res.status(500).json({ error: '保存配置失败: ' + error.message });
        }
      });

      // 加载用户配置
      expressApp.get('/api/load-config/:filename', (req, res) => {
        try {
          const configPath = path.join(DIRS.config, req.params.filename);
          if (!fs.existsSync(configPath)) {
            return res.status(404).json({ error: '配置文件不存在' });
          }
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          res.json({ success: true, config, filename: req.params.filename });
        } catch (error) {
          console.error('Error loading config:', error);
          res.status(500).json({ error: '加载配置失败: ' + error.message });
        }
      });

      // 获取配置文件列表
      expressApp.get('/api/config-list', (req, res) => {
        try {
          const files = fs.readdirSync(DIRS.config)
            .filter(file => file.endsWith('.json'))
            .map(file => {
              const filePath = path.join(DIRS.config, file);
              const stats = fs.statSync(filePath);
              let metadata = null;
              try {
                metadata = JSON.parse(fs.readFileSync(filePath, 'utf8')).metadata;
              } catch { /* ignore */ }
              return {
                filename: file,
                size: stats.size,
                createdAt: stats.birthtime.toISOString(),
                modifiedAt: stats.mtime.toISOString(),
                metadata
              };
            })
            .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
          res.json({ success: true, configs: files });
        } catch (error) {
          console.error('Error listing configs:', error);
          res.status(500).json({ error: '获取配置列表失败: ' + error.message });
        }
      });

      // 删除配置文件
      expressApp.delete('/api/config/:filename', (req, res) => {
        try {
          const configPath = path.join(DIRS.config, req.params.filename);
          if (!fs.existsSync(configPath)) {
            return res.status(404).json({ error: '配置文件不存在' });
          }
          fs.unlinkSync(configPath);
          res.json({ success: true, message: '配置文件删除成功' });
        } catch (error) {
          console.error('Error deleting config:', error);
          res.status(500).json({ error: '删除配置失败: ' + error.message });
        }
      });

      // 下载配置文件
      expressApp.get('/api/download-config/:filename', (req, res) => {
        try {
          const configPath = path.join(DIRS.config, req.params.filename);
          if (!fs.existsSync(configPath)) {
            return res.status(404).json({ error: '配置文件不存在' });
          }
          res.download(configPath, req.params.filename);
        } catch (error) {
          console.error('Error downloading config:', error);
          res.status(500).json({ error: '下载配置失败: ' + error.message });
        }
      });

      // 上传书籍文件
      expressApp.post('/api/upload', upload.array('books'), (req, res) => {
        try {
          if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '没有选择文件' });
          }
          const uploadedFiles = req.files.map(file => ({
            originalName: utils.decodeFilename(file.originalname),
            savedName: file.filename,
            size: file.size
          }));
          res.json({
            success: true,
            message: `成功上传 ${uploadedFiles.length} 个文件`,
            files: uploadedFiles
          });
        } catch (error) {
          console.error('Error uploading files:', error);
          res.status(500).json({ error: '文件上传失败: ' + error.message });
        }
      });

      // 获取书籍内容
      expressApp.get('/api/book', (req, res) => {
        const bookPath = req.query.path;
        if (!bookPath) {
          return res.status(400).send('Book path is required.');
        }
        try {
          const safePath = utils.resolveBookPath(bookPath);
          if (fs.existsSync(safePath)) {
            res.sendFile(safePath);
          } else {
            res.status(404).send('Book not found.');
          }
        } catch (error) {
          return res.status(403).send('Forbidden.');
        }
      });

      // 删除书籍
      expressApp.delete('/api/book', (req, res) => {
        try {
          const relPath = req.query.path;
          if (!relPath) {
            return res.status(400).json({ error: '缺少书籍路径' });
          }
          const absolutePath = utils.resolveBookPath(relPath);
          if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: '书籍不存在' });
          }
          fs.unlinkSync(absolutePath);
          utils.cleanupEmptyFolders(absolutePath);
          coverCache.delete(absolutePath);
          res.json({ success: true });
        } catch (error) {
          console.error('Error deleting book:', error);
          res.status(500).json({ error: '删除书籍失败: ' + error.message });
        }
      });

      // ==================== 字体管理 API ====================

      // 获取字体列表
      expressApp.get('/api/fonts', (req, res) => {
        try {
          if (!fs.existsSync(DIRS.fonts)) {
            return res.json([]);
          }
          const files = fs.readdirSync(DIRS.fonts);
          const fonts = files
            .filter(file => ALLOWED_FONT_EXTENSIONS.includes(path.extname(file).toLowerCase()))
            .map(file => {
              const ext = path.extname(file);
              const nameWithoutExt = path.basename(file, ext);
              const stats = fs.statSync(path.join(DIRS.fonts, file));
              return {
                id: file,
                name: nameWithoutExt,
                fontFamily: `CustomFont_${nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_')}`,
                filename: file,
                size: stats.size,
                addedAt: stats.birthtimeMs || stats.ctimeMs
              };
            });
          res.json(fonts);
        } catch (error) {
          console.error('Error getting fonts:', error);
          res.status(500).json({ error: '获取字体列表失败' });
        }
      });

      // 上传字体
      expressApp.post('/api/fonts/upload', fontUpload.single('font'), (req, res) => {
        try {
          if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
          }
          const ext = path.extname(req.file.filename);
          const nameWithoutExt = path.basename(req.file.filename, ext);
          res.json({
            success: true,
            font: {
              id: req.file.filename,
              name: nameWithoutExt,
              fontFamily: `CustomFont_${nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_')}`,
              filename: req.file.filename,
              size: req.file.size
            }
          });
        } catch (error) {
          console.error('Error uploading font:', error);
          res.status(500).json({ error: '上传字体失败: ' + error.message });
        }
      });

      // 获取字体文件
      expressApp.get('/api/fonts/file/:fontId', (req, res) => {
        try {
          const fontId = req.params.fontId;
          const fontPath = path.join(DIRS.fonts, fontId);
          const resolved = path.resolve(fontPath);
          if (!resolved.startsWith(path.resolve(DIRS.fonts))) {
            return res.status(403).json({ error: '无效的字体路径' });
          }
          if (!fs.existsSync(fontPath)) {
            return res.status(404).json({ error: '字体不存在' });
          }
          const ext = path.extname(fontId).toLowerCase();
          const mimeType = FONT_MIME_TYPES[ext] || 'application/octet-stream';
          res.set({
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=31536000'
          });
          res.sendFile(fontPath);
        } catch (error) {
          console.error('Error serving font:', error);
          res.status(500).json({ error: '获取字体失败' });
        }
      });

      // 删除字体
      expressApp.delete('/api/fonts/:fontId', (req, res) => {
        try {
          const fontId = req.params.fontId;
          const fontPath = path.join(DIRS.fonts, fontId);
          const resolved = path.resolve(fontPath);
          if (!resolved.startsWith(path.resolve(DIRS.fonts))) {
            return res.status(403).json({ error: '无效的字体路径' });
          }
          if (!fs.existsSync(fontPath)) {
            return res.status(404).json({ error: '字体不存在' });
          }
          fs.unlinkSync(fontPath);
          res.json({ success: true });
        } catch (error) {
          console.error('Error deleting font:', error);
          res.status(500).json({ error: '删除字体失败: ' + error.message });
        }
      });

      // 启动服务器
      server = expressApp.listen(PORT, '127.0.0.1', () => {
        console.log(`Electron embedded server running at http://localhost:${PORT}`);
        resolve();
      });

      server.on('error', (err) => {
        console.error('Server error:', err);
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`端口 ${PORT} 已被占用，请关闭其他程序后重试`));
        } else {
          reject(err);
        }
      });

    } catch (error) {
      console.error('Server startup error:', error);
      reject(error);
    }
  });
}

// 应用准备完成
app.whenReady().then(async () => {
  try {
    // 先启动服务器
    await startServer();
    // 再创建窗口
    createWindow();
  } catch (error) {
    console.error('Failed to start server:', error);
    dialog.showErrorBox('启动失败', `无法启动内置服务器: ${error.message}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前关闭服务器
app.on('before-quit', () => {
  if (server) {
    server.close(() => {
      console.log('Server closed');
    });
    server = null;
  }
});

// 应用退出时确保清理
app.on('quit', () => {
  if (server) {
    server.close();
    server = null;
  }
});

// IPC 通信处理
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-books-folder', () => {
  const isPackaged = app.isPackaged;
  const dataPath = isPackaged ? app.getPath('userData') : __dirname;
  const booksPath = path.join(dataPath, 'books');
  shell.openPath(booksPath);
});

ipcMain.handle('open-external-link', (event, url) => {
  shell.openExternal(url);
});
