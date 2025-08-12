# 本地电子书阅读器 (Local E-Book Reader)

一个运行在本地的电子书阅读网页，通过 Node.js 服务器，它可以稳定地访问你本地的书库，需要手动记录你的阅读进度。

---
## ✨ 主要功能
- **浏览器阅读**：通过浏览器进行阅读，无需下载额外软件。
- **本地书库**: 将你所有的 `.epub` 和 `.txt` 格式的电子书存放在本地 `books` 文件夹中，实现集中管理。
- **流畅阅读**: 专为沉浸式阅读设计的界面，支持亮色/暗色模式切换（目前存在bug）。
- **个性化设置**: 自由调整字体大小，找到最舒适的阅读版式。
- **章节目录**: 清晰的目录结构，方便在书籍的不同章节间快速跳转。
- **手动进度保存**: 完全掌控你的阅读进度。只需点击“保存”按钮，即可精确记录当前阅读位置，下次打开时自动恢复。
- **跨平台**: 只要有 Node.js 环境和现代浏览器，即可在 Windows, macOS, 或 Linux 上运行。

## 📂 项目结构
```
/local_read
├── books/            <-- 存放你所有 .epub 和 .txt 电子书的地方
│   └── .gitkeep      <-- 这是一个占位符，以确保空文件夹能被Git跟踪
├── node_modules/     <-- (由npm生成) 存放项目依赖
├── index.html        <-- 阅读器的前端界面
├── server.js         <-- 后端服务器，负责读取文件和提供API
├── package.json      <-- 项目配置文件
├── package-lock.json <-- 锁定依赖版本
└── README.md         <-- 项目说明文档
```

## 🚀 如何开始

请按照以下步骤来设置并运行本项目：

**1. 准备环境:**

- 确保你的电脑上已经安装了 [Node.js](https://nodejs.org/) (推荐LTS版本)。

**2. 克隆或下载项目:**

- 如果你使用 Git, 可以通过以下命令克隆仓库：
  ```bash
  #克隆仓库
  git clone https://github.com/ReasonW6/local_read.git
  #到仓库目录  
  cd local_read

或者，直接下载项目的 ZIP 文件并解压。

**3. 安装依赖:**

在项目的根目录下，打开终端或命令行工具，然后运行以下命令来安装 Express 框架：
```Bash
    #初始化项目
    npm init -y
    #安装 Express 框架
    npm install express
```
**4. 添加你的书籍:**

将你想要阅读的 .epub 或 .txt 文件复制到项目中的 books 文件夹内。

**5. 启动服务器:**

在终端中运行以下命令：
```Bash
    node server.js
```
当你看到以下提示时，说明服务器已成功启动：
```
    E-book reader server listening at http://localhost:3000
```
**或者**  

打开`start.bat`，会自动帮你运行server并打开浏览器。

**6. 开始阅读:**

打开你的浏览器 (推荐 Chrome, Firefox, Edge)，访问 http://localhost:3000。

点击右侧工具栏的“书架”图标，即可看到你在 books 文件夹中存放的所有书籍。

享受阅读吧！

---
🛠️ 技术栈

    后端: Node.js, Express.js

    前端: HTML5, CSS3, Vanilla JavaScript

    核心库: ePub.js - 用于解析和渲染 EPUB 文件