// server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

const booksDirectory = path.join(__dirname, 'books');

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
const findBooks = (dir, fileList = [], parentDir = '') => {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const fileStat = fs.statSync(filePath);
    const relativePath = path.join(parentDir, file);

    if (fileStat.isDirectory()) {
      findBooks(filePath, fileList, relativePath);
    } else if (file.toLowerCase().endsWith('.epub') || file.toLowerCase().endsWith('.txt') || file.toLowerCase().endsWith('.pdf')) {
      fileList.push({
        name: file,
        path: relativePath, // 使用相对路径作为唯一标识
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
  const safePath = path.join(booksDirectory, bookPath);
  if (safePath.indexOf(booksDirectory) !== 0) {
      return res.status(403).send('Forbidden.');
  }

  if (fs.existsSync(safePath)) {
    res.sendFile(safePath);
  } else {
    res.status(404).send('Book not found.');
  }
});

// 托管前端静态文件 (index.html)
app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
  console.log(`E-book reader server listening at http://localhost:${port}`);
  console.log(`Place your .epub, .txt and .pdf files in the "${booksDirectory}" folder.`);
});