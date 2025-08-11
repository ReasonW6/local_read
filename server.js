// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

const booksDirectory = path.join(__dirname, 'books');

// 递归地读取目录中的所有书籍文件
const findBooks = (dir, fileList = [], parentDir = '') => {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const fileStat = fs.statSync(filePath);
    const relativePath = path.join(parentDir, file);

    if (fileStat.isDirectory()) {
      findBooks(filePath, fileList, relativePath);
    } else if (file.toLowerCase().endsWith('.epub') || file.toLowerCase().endsWith('.txt')) {
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
  console.log(`Place your .epub and .txt files in the "${booksDirectory}" folder.`);
});