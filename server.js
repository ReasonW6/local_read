// server.js - Local E-Book Reader Server
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const app = express();
const PORT = 3000;

// 目录配置
const DIRS = {
  books: path.join(__dirname, 'books'),
  config: path.join(__dirname, 'user-data'),
  fonts: path.join(__dirname, 'user-data', 'fonts')
};

// 支持的文件扩展名
const ALLOWED_EXTENSIONS = ['.epub', '.txt', '.pdf'];

// 支持的字体扩展名
const ALLOWED_FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];

// 字体MIME类型映射
const FONT_MIME_TYPES = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// 图片MIME类型映射
const IMAGE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

// 封面缓存（限制大小，避免大书库占用过多内存）
const coverCache = new Map();
const COVER_CACHE_LIMIT = 200;

function setCoverCache(key, mtime, data) {
  coverCache.set(key, { mtime, data });
  if (coverCache.size > COVER_CACHE_LIMIT) {
    const oldestKey = coverCache.keys().next().value;
    if (oldestKey) coverCache.delete(oldestKey);
  }
}

// 确保目录存在
Object.values(DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 中间件配置
app.use(express.json({ limit: '10mb' }));
// PERF-3: 添加静态文件缓存头，减少重复文件读取
app.use(express.static(__dirname, { maxAge: '1h' }));

// 工具函数
const utils = {
  // 规范化相对路径
  normalizePath: (p = '') => p.split(path.sep).join('/'),

  // 解析书籍路径（带安全检查）
  resolveBookPath: (relativePath = '') => {
    const normalized = path.normalize(relativePath).replace(/^([\.\\/])+/, '');
    const resolved = path.resolve(DIRS.books, normalized);
    const booksRoot = path.resolve(DIRS.books);
    if (!resolved.toLowerCase().startsWith(booksRoot.toLowerCase())) {
      throw new Error('Invalid book path');
    }
    return resolved;
  },

  // 解析配置路径（带安全检查）
  resolveConfigPath: (filename = '') => {
    const normalized = path.normalize(filename).replace(/^([\.\\/])+/, '');
    const resolved = path.resolve(DIRS.config, normalized);
    const configRoot = path.resolve(DIRS.config);
    if (!resolved.toLowerCase().startsWith(configRoot.toLowerCase())) {
      throw new Error('Invalid config path');
    }
    if (path.extname(resolved).toLowerCase() !== '.json') {
      throw new Error('Invalid config file type');
    }
    return resolved;
  },

  // 清理空文件夹
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

  // 解码文件名
  decodeFilename: (filename) => Buffer.from(filename, 'latin1').toString('utf8'),

  // 检查文件扩展名是否支持
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
  },
  // BUG-7: 添加文件大小限制（500MB），防止超大文件占满磁盘/内存
  limits: { fileSize: 500 * 1024 * 1024 }
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

    if (imageEntries.length === 0) {
      setCoverCache(cacheKey, stats.mtimeMs, null);
      return null;
    }

    let coverEntry = imageEntries.find(entry => /cover/i.test(path.basename(entry.entryName)));
    if (!coverEntry) {
      coverEntry = imageEntries[0];
    }

    if (!coverEntry) {
      setCoverCache(cacheKey, stats.mtimeMs, null);
      return null;
    }

    const data = coverEntry.getData();
    if (!data) {
      setCoverCache(cacheKey, stats.mtimeMs, null);
      return null;
    }

    const ext = path.extname(coverEntry.entryName).toLowerCase();
    const mime = IMAGE_MIME_TYPES[ext] || 'image/jpeg';
    const base64 = data.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    setCoverCache(cacheKey, stats.mtimeMs, dataUrl);
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
app.get('/api/bookshelf', (req, res) => {
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
app.get('/api/book-cover', (req, res) => {
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
app.post('/api/save-config', (req, res) => {
  try {
    const { config, filename } = req.body;
    if (!config) {
      return res.status(400).json({ error: '配置数据不能为空' });
    }

    const configFilename = filename || `reader-config-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    let configPath;
    try {
      configPath = utils.resolveConfigPath(configFilename);
    } catch {
      return res.status(400).json({ error: '无效的配置文件名' });
    }

    const configWithMeta = {
      ...config,
      metadata: {
        ...config.metadata,
        savedAt: new Date().toISOString(),
        version: '1.0.0',
        appName: 'Local E-Book Reader'
      }
    };
    if (!fs.existsSync(DIRS.config)) {
      fs.mkdirSync(DIRS.config, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(configWithMeta, null, 2));
    res.json({ success: true, message: '配置保存成功', filename: configFilename, path: configPath });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: '保存配置失败: ' + error.message });
  }
});

// 加载用户配置
app.get('/api/load-config/:filename', (req, res) => {
  try {
    let configPath;
    try {
      configPath = utils.resolveConfigPath(req.params.filename);
    } catch {
      return res.status(400).json({ error: '无效的配置文件' });
    }
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
app.get('/api/config-list', (req, res) => {
  try {
    if (!fs.existsSync(DIRS.config)) {
      return res.json({ success: true, configs: [] });
    }
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
app.delete('/api/config/:filename', (req, res) => {
  try {
    let configPath;
    try {
      configPath = utils.resolveConfigPath(req.params.filename);
    } catch {
      return res.status(400).json({ error: '无效的配置文件' });
    }
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
app.get('/api/download-config/:filename', (req, res) => {
  try {
    let configPath;
    try {
      configPath = utils.resolveConfigPath(req.params.filename);
    } catch {
      return res.status(400).json({ error: '无效的配置文件' });
    }
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
app.post('/api/upload', upload.array('books'), (req, res) => {
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
app.get('/api/book', (req, res) => {
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
app.delete('/api/book', (req, res) => {
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
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB 限制
  }
});

// 获取字体列表
app.get('/api/fonts', (req, res) => {
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
app.post('/api/fonts/upload', fontUpload.single('font'), (req, res) => {
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
app.get('/api/fonts/file/:fontId', (req, res) => {
  try {
    const fontId = req.params.fontId;
    const fontPath = path.join(DIRS.fonts, fontId);

    // 安全检查
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

    // BUG-5: 使用 resolved 绝对路径，Express 5 的 sendFile 要求绝对路径
    res.sendFile(resolved);
  } catch (error) {
    console.error('Error serving font:', error);
    res.status(500).json({ error: '获取字体失败' });
  }
});

// 删除字体
app.delete('/api/fonts/:fontId', (req, res) => {
  try {
    const fontId = req.params.fontId;
    const fontPath = path.join(DIRS.fonts, fontId);

    // 安全检查
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
app.listen(PORT, () => {
  console.log(`E-book reader server listening at http://localhost:${PORT}`);
  console.log(`Place your .epub, .txt and .pdf files in the "${DIRS.books}" folder.`);
});
