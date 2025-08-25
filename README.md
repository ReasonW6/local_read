# 🔖 本地电子书阅读器 (Local E-Book Reader)

[![Node.js](https://img.shields.io/badge/Node.js-v14%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ReasonW6/local_read/pulls)

> 一个运行在本地的电子书阅读网页应用，通过 Node.js 服务器稳定访问你的本地书库，支持手动记录阅读进度。

[⚡快速开始](#-快速开始) | [📝使用说明](#-使用说明)
## ✨ 主要功能

- 📖 **浏览器阅读**：通过浏览器进行阅读，无需下载额外软件
- 📚 **本地书库**：支持 `.epub` 和 `.txt` 格式，集中管理所有电子书
- 🎨 **流畅阅读**：专为沉浸式阅读设计，支持亮色/暗色模式切换
- 🔧 **个性化设置**：自由调整字体大小，找到最舒适的阅读版式
- 📑 **章节目录**：清晰的目录结构，快速跳转章节
- 💾 **手动进度保存**：精确记录阅读位置，下次打开自动恢复
- 🌐 **跨平台**：支持 Windows、macOS、Linux

## 🐛 已知问题

- 暂无（未知）


## 🚀 快速开始

### 📋 环境要求

- [Node.js](https://nodejs.org/) v14.0+ (推荐 LTS 版本)
- 现代浏览器 (Chrome, Firefox, Edge, Safari)

### ⚡ 安装步骤

1. **克隆项目**

   ```bash
   # 克隆仓库
   git clone https://github.com/ReasonW6/local_read.git
   
   # 进入项目目录
   cd local_read
   ```

   或者直接下载 ZIP 文件并解压。

2. **安装依赖**

    ```bash
    #初始化项目
    npm init -y
    #安装 Express 框架
    npm install express
    ```
3. **添加电子书**

   将你的 `.epub` 或 `.txt` 文件复制到 `books/` 文件夹中。

4. **启动服务器**

   ```bash
   # 启动服务器
   node server.js
   ```

   看到以下提示表示启动成功：
   ```
   E-book reader server listening at http://localhost:3000
   ```

   **💡 Windows 用户快捷方式：** 双击 `start.bat` 文件，会自动启动服务器并打开浏览器。

5. **开始阅读**

   在浏览器中访问 [http://localhost:3000](http://localhost:3000)，点击右侧工具栏的"书架"图标即可看到所有书籍。

## 📝 使用说明

1. **书籍管理**：将电子书文件放入 `books/` 文件夹
2. **阅读控制**：使用工具栏进行字体大小调整、主题切换等
3. **进度保存**：点击"保存"按钮记录当前阅读位置
4. **章节导航**：通过目录快速跳转到指定章节

## 📂 项目结构

```
local_read/
├── books/                # 📚 存放电子书文件 (.epub, .txt)
│   └── .gitkeep          # Git占位符文件
├── src/                  # 💻 前端与辅助源码
├── node_modules/         # 📦 项目依赖 (npm自动生成)
├── .gitignore            # 🙈 Git忽略规则
├── index.html            # 🎨 前端阅读界面
├── server.js             # ⚙️ 后端服务器
├── package.json          # 📄 项目配置文件
├── package-lock.json     # 🔒 依赖版本锁定
├── start.bat             # 🚀 一键启动脚本 (Windows)
└── README.md             # 📖 项目说明文档
```

## 🛠️ 技术栈

- **后端**: Node.js, Express.js
- **前端**: HTML5, CSS3, Vanilla JavaScript  
- **核心库**: ePub.js - 用于解析和渲染 EPUB 文件


---

⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！