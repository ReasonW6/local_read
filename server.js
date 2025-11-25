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
  config: path.join(__dirname, 'user-data')
};

// 支持的文件扩展名
const ALLOWED_EXTENSIONS = ['.epub', '.txt', '.pdf'];

// 图片MIME类型映射
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
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

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
  }
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
    if (!coverEntry) {
      coverEntry = imageEntries[0];
    }

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
app.get('/api/load-config/:filename', (req, res) => {
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
app.get('/api/config-list', (req, res) => {
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
app.delete('/api/config/:filename', (req, res) => {
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
app.get('/api/download-config/:filename', (req, res) => {
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

// 启动服务器
app.listen(PORT, () => {
  console.log(`E-book reader server listening at http://localhost:${PORT}`);
  console.log(`Place your .epub, .txt and .pdf files in the "${DIRS.books}" folder.`);
});