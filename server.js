// server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const app = express();
const port = 3000;

const booksDirectory = path.join(__dirname, 'books');
const configDirectory = path.join(__dirname, 'user-data');

// 确保目录存在
if (!fs.existsSync(booksDirectory)) {
  fs.mkdirSync(booksDirectory);
}
if (!fs.existsSync(configDirectory)) {
  fs.mkdirSync(configDirectory);
}

// 中间件：解析JSON请求体
app.use(express.json({ limit: '10mb' }));

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(booksDirectory)) {
      fs.mkdirSync(booksDirectory, { recursive: true });
    }
    cb(null, booksDirectory);
  },
  filename: function (req, file, cb) {
    // 保持原文件名，如果文件已存在则添加数字后缀
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    let finalName = originalName;
    let counter = 1;
    
    while (fs.existsSync(path.join(booksDirectory, finalName))) {
      const ext = path.extname(originalName);
      const nameWithoutExt = path.basename(originalName, ext);
      finalName = `${nameWithoutExt}(${counter})${ext}`;
      counter++;
    }
    
    cb(null, finalName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const allowedExtensions = ['.epub', '.txt', '.pdf'];
    const ext = path.extname(originalName).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .epub, .txt, .pdf 文件格式'));
    }
  }
});

// 递归地读取目录中的所有书籍文件
const IMAGE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

const coverCache = new Map();

const normalizeRelativePath = (p = '') => p.split(path.sep).join('/');

const resolveBookPath = (relativePath = '') => {
  const normalized = path.normalize(relativePath).replace(/^([\.\\/])+/, '');
  const resolved = path.resolve(booksDirectory, normalized);
  const booksRoot = path.resolve(booksDirectory);
  if (!resolved.toLowerCase().startsWith(booksRoot.toLowerCase())) {
    throw new Error('Invalid book path');
  }
  return resolved;
};

const cleanupEmptyFolders = (startPath) => {
  let current = path.dirname(startPath);
  const booksRoot = path.resolve(booksDirectory);
  while (current.toLowerCase().startsWith(booksRoot.toLowerCase()) && current !== booksRoot) {
    try {
      const remaining = fs.readdirSync(current);
      if (remaining.length === 0) {
        fs.rmdirSync(current);
        current = path.dirname(current);
      } else {
        break;
      }
    } catch (error) {
      break;
    }
  }
};

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

const findBooks = (dir, fileList = [], parentDir = '') => {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const fileStat = fs.statSync(filePath);
    const relativePath = path.join(parentDir, file);

    if (fileStat.isDirectory()) {
      findBooks(filePath, fileList, relativePath);
    } else if (file.toLowerCase().endsWith('.epub') || file.toLowerCase().endsWith('.txt') || file.toLowerCase().endsWith('.pdf')) {
      const ext = path.extname(file).toLowerCase();
      const normalizedPath = normalizeRelativePath(relativePath);
      fileList.push({
        name: file,
        path: normalizedPath,
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

// API: 获取书架列表
app.get('/api/bookshelf', (req, res) => {
  try {
    if (!fs.existsSync(booksDirectory)) {
      fs.mkdirSync(booksDirectory);
    }
    const books = findBooks(booksDirectory);
    res.json(books);
  } catch (error) {
    console.error('Error reading bookshelf:', error);
    res.status(500).json({ error: 'Failed to read bookshelf directory.' });
  }
});

// API: 获取书籍封面
app.get('/api/book-cover', (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: '缺少书籍路径' });
    }

    const absolutePath = resolveBookPath(relPath);
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

// API: 保存用户配置
app.post('/api/save-config', (req, res) => {
  try {
    const { config, filename } = req.body;
    
    if (!config) {
      return res.status(400).json({ error: '配置数据不能为空' });
    }
    
    // 生成文件名（如果没有提供）
    const configFilename = filename || `reader-config-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    const configPath = path.join(configDirectory, configFilename);
    
    // 添加元数据
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
    
    res.json({ 
      success: true, 
      message: '配置保存成功',
      filename: configFilename,
      path: configPath
    });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: '保存配置失败: ' + error.message });
  }
});

// API: 加载用户配置
app.get('/api/load-config/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const configPath = path.join(configDirectory, filename);
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: '配置文件不存在' });
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    res.json({
      success: true,
      config: config,
      filename: filename
    });
  } catch (error) {
    console.error('Error loading config:', error);
    res.status(500).json({ error: '加载配置失败: ' + error.message });
  }
});

// API: 获取所有保存的配置文件列表
app.get('/api/config-list', (req, res) => {
  try {
    const files = fs.readdirSync(configDirectory)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(configDirectory, file);
        const stats = fs.statSync(filePath);
        
        // 尝试读取文件元数据
        let metadata = null;
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          metadata = content.metadata;
        } catch (e) {
          // 忽略解析错误
        }
        
        return {
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
          metadata: metadata
        };
      })
      .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt)); // 按修改时间倒序
    
    res.json({
      success: true,
      configs: files
    });
  } catch (error) {
    console.error('Error listing configs:', error);
    res.status(500).json({ error: '获取配置列表失败: ' + error.message });
  }
});

// API: 删除配置文件
app.delete('/api/config/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const configPath = path.join(configDirectory, filename);
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: '配置文件不存在' });
    }
    
    fs.unlinkSync(configPath);
    
    res.json({
      success: true,
      message: '配置文件删除成功'
    });
  } catch (error) {
    console.error('Error deleting config:', error);
    res.status(500).json({ error: '删除配置失败: ' + error.message });
  }
});

// API: 下载配置文件
app.get('/api/download-config/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const configPath = path.join(configDirectory, filename);
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: '配置文件不存在' });
    }
    
    res.download(configPath, filename);
  } catch (error) {
    console.error('Error downloading config:', error);
    res.status(500).json({ error: '下载配置失败: ' + error.message });
  }
});

// API: 上传书籍文件
app.post('/api/upload', upload.array('books'), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '没有选择文件' });
    }
    
    const uploadedFiles = req.files.map(file => ({
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
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

// API: 根据路径获取单本书籍的内容
app.get('/api/book', (req, res) => {
  const bookPath = req.query.path;
  if (!bookPath) {
    return res.status(400).send('Book path is required.');
  }

  // 安全性检查：确保请求的文件路径在 `books` 目录内
  let safePath;
  try {
    safePath = resolveBookPath(bookPath);
  } catch (error) {
    return res.status(403).send('Forbidden.');
  }

  if (fs.existsSync(safePath)) {
    res.sendFile(safePath);
  } else {
    res.status(404).send('Book not found.');
  }
});

// API: 删除书籍
app.delete('/api/book', (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: '缺少书籍路径' });
    }

    const absolutePath = resolveBookPath(relPath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    fs.unlinkSync(absolutePath);
    cleanupEmptyFolders(absolutePath);
    coverCache.delete(absolutePath);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: '删除书籍失败: ' + error.message });
  }
});

// 托管前端静态文件 (index.html)
app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
  console.log(`E-book reader server listening at http://localhost:${port}`);
  console.log(`Place your .epub, .txt and .pdf files in the "${booksDirectory}" folder.`);
});