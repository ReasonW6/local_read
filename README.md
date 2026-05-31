# 🔖 本地电子书阅读器 (Local E-Book Reader)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ReasonW6/local_read/pulls)

语言: [中文](README.md) | [English](README.en.md)

> 一个本地优先的电子书阅读应用，同时提供 Web 浏览器模式和 Tauri 桌面版。Web 端继续使用 Express HTTP API；桌面端使用 Tauri + Rust 本地 command 访问书库、配置、字体和封面数据。支持 EPUB、TXT、PDF 格式，具备完整的配置管理和数据持久化功能。

[⚡快速开始](#-快速开始) | [📝使用说明](#-使用说明) | [🔧配置管理](#-配置管理)

## ✨ 主要功能

### 📖 **核心阅读功能**
- 📚 **多格式支持**: `.epub`、`.txt`、`.pdf` 格式电子书
- 📤 **便捷添加**: 支持拖拽上传和文件选择，快速添加书籍到本地书库
- 🎨 **沉浸式阅读**: 专为阅读优化的界面设计
- 🌓 **主题切换**: 亮色/暗色模式自由切换
- 🔧 **字体调节**: 字体大小、段落间距、字间距精细调整
- 📏 **排版定制**: 页宽、页边距、行距、段落间距、字间距全面可调
- 📑 **章节导航**: 清晰的目录结构，快速跳转章节
- 🔖 **书签系统**: 添加、管理、跳转书签
- ⚡ **键盘快捷键**: 全面的键盘操作支持

### 💾 **数据管理功能**
- 🔄 **一键保存**: 一键保存所有阅读数据和设置
- 🚀 **自动加载**: 启动时自动恢复所有配置
- 📦 **完整备份**: 包含阅读进度、书签、设置的完整配置文件
- 🔒 **数据安全**: 服务器端存储，不依赖浏览器缓存
- 🌐 **跨设备同步**: 通过配置文件实现设备间数据迁移

### 🎯 **特色功能**
- 📖 **最近阅读提示**: 自动标记上次阅读的书籍
- 🛡️ **隐私保护**: 完全本地运行，保护用户隐私
- 📊 **阅读进度**: 实时显示阅读进度条
- 🔤 **自定义字体**: 支持上传和切换 `.ttf`、`.otf`、`.woff`、`.woff2` 字体
- 🎨 **灵活定制**: 极宽范围的排版参数调整（页宽400-2000px，边距10-150px等）
- 🔄 **智能滚动**: 章节切换自动回到顶部，提供流畅阅读体验
- 🌐 **跨平台**: 支持 Windows、macOS、Linux

## 🐛 已知问题

- PDF目录导航精度有限，具体效果取决于 PDF 文件自身目录信息
- 大型EPUB文件可能加载较慢
- 个别大型文件首次提取封面或渲染页面时可能需要等待

## 🚀 快速开始

### 📋 环境要求

- [Node.js](https://nodejs.org/) v18.0+ (推荐 LTS 版本)
- 现代浏览器 (Chrome, Firefox, Edge, Safari，仅 Web 模式需要)
- [Rust](https://www.rust-lang.org/tools/install) stable 工具链（Windows 推荐 `stable-msvc`）
- Windows 桌面开发需要 Microsoft C++ Build Tools 和 WebView2 Runtime

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
    # 安装项目依赖
    npm install
    ```
    
    > **注意**: 依赖已在 `package.json` 和 `package-lock.json` 中声明，直接执行 `npm install` 即可安装 Express、Multer、AdmZip、Tauri CLI、Vitest 等运行和开发依赖。

3. **选择运行方式**

   **Web 服务器模式（浏览器）**
   ```bash
   # 启动服务器
   node server.js
   ```
   看到以下提示表示启动成功：
   ```
   E-book reader server listening at http://localhost:3000
   ```
   **💡 Windows 用户快捷方式：** 双击 `start.bat` 文件，会自动启动服务器并打开浏览器。

   **Tauri 桌面模式（开发运行）**
   ```bash
   npm run tauri dev
   ```
   Tauri 会加载现有 HTML/CSS/Vanilla JS 前端，但桌面端 API 通过 Rust command 执行，不启动 Electron 或内嵌 Express。

   **Tauri 打包**
   ```bash
   npm run tauri build
   ```

4. **添加电子书**

   Web 模式：将 `.epub`、`.txt` 或 `.pdf` 文件复制到项目内 `books/` 文件夹，或使用应用内添加书籍弹窗。<br>
   Tauri 桌面模式：使用应用内“打开书库”按钮打开桌面端数据目录，或通过添加书籍弹窗导入。

5. **开始阅读**

   Web 模式：在浏览器中访问 [http://localhost:3000](http://localhost:3000)。  
   Tauri 版：直接在桌面窗口中使用阅读器。

## 📝 使用说明

### 📚 **书籍管理**
- **手动添加**: 将电子书文件放入 `books/` 文件夹
- **界面添加**: 点击"添加书籍"按钮，通过拖拽或文件选择上传

### 📖 **阅读控制**
- **工具栏**: 字体大小调整、主题切换、章节导航
- **设置面板**: 
  - 页宽调整（400-2000px）
  - 页边距设置（10-150px）
  - 行距调整（1.0-3.5）
  - 段落间距（0.2-4）
  - 字间距（0-5px）
  - 阅读进度条显示/隐藏
  - 自定义字体上传与切换
- **键盘快捷键**: 
  - `←/→`: 上一章/下一章
  - `+/-`: 增大/减小字体
  - `T`: 切换主题
  - `B`: 添加书签
  - `S`: 保存进度

### 💾 **数据保存**
- **一键保存**: 点击"保存"按钮保存所有数据和设置
- **自动恢复**: 下次启动时自动加载所有配置

## 🔧 配置管理

### 🆕 **数据持久化功能**

本阅读器具备完整的配置管理系统，确保您的阅读数据永不丢失：

#### 📦 **自动保存的数据**
- ✅ **阅读进度**: 每本书的精确阅读位置
- ✅ **主题设置**: 日间/夜间模式偏好
- ✅ **字体配置**: 字体大小、段落间距、字间距
- ✅ **书签数据**: 所有书籍的书签记录
- ✅ **最近阅读**: 最后阅读的书籍标识
- ✅ **阅读偏好**: 个性化的排版设置

#### 🔄 **使用方法**

1. **保存数据**:
   ```
   点击工具栏的"保存"按钮 → 所有数据自动保存到 user-data/user-config.json
   ```

2. **自动恢复**:
   ```
   重新打开网站 → 自动加载配置文件 → 恢复所有设置和进度
   ```

3. **数据迁移**:
   ```
   复制 user-data/user-config.json 文件 → 在其他设备上覆盖同名文件 → 实现跨设备同步
   ```

#### 🛡️ **数据安全**
- **本地存储**: 配置文件保存在服务器端，不依赖浏览器缓存
- **自动备份**: 页面关闭时自动保存，防止数据丢失
- **格式标准**: 使用JSON格式，便于备份和迁移

## 📁 数据目录说明

- Web 模式与 Tauri 开发模式使用项目目录作为数据根目录：
  - `books/`：电子书文件
  - `user-data/`：配置文件
  - `user-data/fonts/`：自定义字体
- Tauri 打包版默认使用系统 app data 目录作为数据根目录：
  - Windows：AppData
  - macOS：Application Support / Library
  - Linux：`.config`
- 可通过环境变量 `LOCAL_READ_DATA_DIR` 覆盖 Tauri 桌面端数据根目录，适合便携版或自定义同步目录。

## 📂 项目结构

```
local_read/
├── books/                                # 📚 Web/Tauri 开发模式书库 (.epub, .txt, .pdf)
├── shared/
│   └── server-core.js                    # Web 模式 Express API 核心逻辑
├── src-tauri/                            # 🦀 Tauri 桌面壳与 Rust 本地 API
│   ├── src/
│   │   ├── commands.rs                   # 书籍、配置、字体、封面等 Tauri commands
│   │   ├── paths.rs                      # 数据目录与路径安全逻辑
│   │   └── models.rs                     # Rust/前端共享数据结构
│   └── tests/                            # Rust 路径安全测试
├── src/                                  # 💻 前端源码
│   ├── css/                              # 🎨 样式文件
│   │   ├── base.css                            # 基础样式和CSS变量（包含EPUB图片保护样式）
│   │   ├── components.css                      # 组件样式
│   │   ├── qidian.css                          # 书架首页样式
│   │   └── responsive.css                      # 响应式设计
│   └── js/                               # 📜 JavaScript模块
│       ├── app.js                        # 阅读器主应用逻辑
│       ├── bookshelfApp.js               # 书架页面应用逻辑
│       ├── core/                         # ⚙️ 核心模块
│       │   ├── config.js                       # 配置常量和DOM引用
│       │   └── state.js                        # 应用状态管理
│       ├── platform/
│       │   ├── apiClient.js                    # Web HTTP / Tauri Rust API 适配层
│       │   └── desktopBridge.js                # Tauri 窗口与桌面能力桥接
│       └── modules/                      # 🧩 功能模块
│           ├── bookmarkManager.js              # 书签管理
│           ├── bookmarkStorage.js              # 书签存储兼容层
│           ├── addBooksModal.js                # 添加书籍弹窗
│           ├── configManager.js                # 配置管理（扩展的排版参数范围）
│           ├── epubCore.js                     # EPUB核心功能（主题和图片样式处理）
│           ├── epubReader.js                   # EPUB阅读器
│           ├── desktopScrollbar.js             # 桌面端滚动条状态
│           ├── fileManager.js                  # 文件管理
│           ├── fontManager.js                  # 自定义字体管理
│           ├── pdfReader.js                    # PDF阅读器
│           ├── readingPrefs.js                 # 阅读排版偏好
│           ├── themeManager.js                 # 主题管理
│           ├── txtReader.js                    # TXT阅读器（章节导航优化）
│           └── uiController.js                 # UI控制器
├── tests/                                # 🧪 Vitest 测试
│   ├── frontend/                         # 前端单元测试
│   └── server/                           # 服务端单元与 API 测试
├── user-data/                            # 💾 Web/Tauri 开发模式用户数据目录
│   └── user-config.json                  # 用户配置文件 (自动生成)
├── dist-tauri/                           # 📦 Tauri 前端静态资源输出目录（自动生成）
├── scripts/
│   ├── build-tauri-assets.js             # Tauri 前端资源复制脚本
│   └── tauri-dev-server.js               # Tauri 开发模式静态资源服务
├── .gitignore                            # 🙈 Git忽略规则
├── index.html                            # 📚 书架首页
├── reader.html                           # 📖 阅读器页面
├── server.js                             # ⚙️ 后端服务器
├── package.json                          # 📄 项目配置文件
├── package-lock.json                     # 🔒 依赖版本锁定
├── start.bat                             # 🚀 一键启动脚本 (Windows)
└── README.md                             # 📖 项目说明文档
```

## 🛠️ 技术栈

- **后端**: Node.js, Express.js
- **桌面端**: Tauri 2, Rust
- **前端**: HTML5, CSS3, Vanilla JavaScript (ES6 Modules)
- **核心库**: 
  - **ePub.js**: 用于解析和渲染 EPUB 文件
  - **PDF.js**: 用于解析和渲染 PDF 文件
  - **JSZip**: 用于处理压缩文件
  - **AdmZip**: 用于服务端 EPUB 封面提取
  - **Multer**: 用于书籍和字体上传
- **测试框架**: Vitest, Supertest
- **Rust 验证**: cargo test / cargo check

## 🧪 测试用例

项目包含完整的单元测试和集成测试，使用 Vitest 作为测试框架。

### 📋 测试结构

```
tests/
├── frontend/           # 前端单元测试
│   ├── apiClient.test.js
│   ├── addBooksModal.test.js
│   ├── bookmarkStorage.test.js
│   ├── configManager.test.js
│   ├── config.test.js      # 配置模块测试
│   └── utils.test.js       # 工具函数测试
└── server/             # 服务端测试
    ├── api.test.js         # API 集成测试
    ├── tauriDev.test.js    # Tauri 开发启动配置测试
    └── utils.test.js       # 服务端工具函数测试

src-tauri/tests/
└── path_safety.rs      # Rust 数据目录与路径穿越防护测试
```

### 🔍 测试覆盖范围

#### **前端测试** (`tests/frontend/`)

**API 适配层测试** (`apiClient.test.js`)
- ✅ Web 模式调用 Express HTTP API
- ✅ Tauri 模式调用 Rust commands
- ✅ 书籍/字体二进制数据转换为 `ArrayBuffer`
- ✅ 文件导入时转换为安全的字节数组 payload

**配置模块测试** (`config.test.js`)
- ✅ `getFileKey` - 文件路径键生成函数
  - 路径前缀添加测试
  - 空字符串处理测试
  - Windows 路径处理测试
  - 中文路径处理测试
- ✅ `CONFIG` - 配置常量验证
  - 字体大小限制常量
  - API 路径定义
  - 存储键定义
  - 主题定义
  - 侧边栏视图定义

**工具函数测试** (`utils.test.js`)
- ✅ `DEFAULT_READING_PREFS` - 默认阅读偏好设置
- ✅ `clamp` - 数值范围限制函数（11个测试用例）
- ✅ `normalizePrefs` - 阅读偏好标准化（5个测试用例）
- ✅ `computeVerticalPadding` - 垂直边距计算（3个测试用例）
- ✅ `formatFileSize` - 文件大小格式化（4个测试用例）
- ✅ `formatDecimal` - 小数格式化（4个测试用例）
- ✅ `formatTimeAgo` - 时间相对显示（6个测试用例）
- ✅ `getFileExtension` - 文件扩展名提取（3个测试用例）
- ✅ `deriveBookNameFromPath` - 从路径提取书名（5个测试用例）
- ✅ `debounce` - 防抖函数（2个测试用例）
- ✅ `throttle` - 节流函数（3个测试用例）

**其他前端测试**
- ✅ `bookmarkStorage` - 书签数据迁移和兼容读取
- ✅ `addBooksModal` - 添加书籍弹窗的文件列表渲染安全性
- ✅ `configManager` - 配置导出时的书签键名兼容

#### **服务端测试** (`tests/server/`)

**API 集成测试** (`api.test.js`)
- ✅ **书籍管理功能**
  - `GET /api/bookshelf` - 获取书籍列表
  - `POST /api/upload` - 上传书籍（支持的格式、格式验证）
  - `GET /api/book` - 读取书籍内容（成功读取、404处理）
  - `DELETE /api/book` - 删除书籍（成功删除、404处理）
  - `GET /api/book-cover` - 获取书籍封面（不同格式处理）
- ✅ **配置管理功能**
  - `POST /api/save-config` - 保存配置
  - `GET /api/config-list` - 获取配置列表
  - `GET /api/load-config/:filename` - 加载配置（成功加载、404处理）
  - `DELETE /api/config/:filename` - 删除配置
- ✅ **字体管理功能**
  - `GET /api/fonts` - 获取字体列表

**服务端工具函数测试** (`utils.test.js`)
- ✅ `normalizePath` - 路径标准化（4个测试用例）
- ✅ `resolveBookPath` - 书籍路径解析（含安全性测试，5个测试用例）
- ✅ `resolveConfigPath` - 配置文件路径解析（含安全性测试，5个测试用例）
- ✅ `resolveFontPath` - 字体路径解析（含安全性测试）
- ✅ `decodeFilename` - 文件名解码（2个测试用例）
- ✅ `isAllowedExtension` - 文件扩展名验证（7个测试用例）

### 🚀 运行测试

```bash
# 运行所有测试
npm test

# 监听模式运行测试（开发时使用）
npm run test:watch

# 仅运行前端测试
npx vitest tests/frontend

# 仅运行服务端测试
npx vitest tests/server

# 运行 Rust/Tauri 侧测试
cargo test --manifest-path src-tauri/Cargo.toml

# 检查 Rust/Tauri 侧编译
cargo check --manifest-path src-tauri/Cargo.toml
```

### 📊 测试统计

- **JS 总测试用例数**: 113 个
- **JS 测试文件数**: 9 个
- **前端测试**: 63 个用例
- **服务端测试**: 50 个用例
- **Rust 测试**: 4 个用例
- **测试环境**: 
  - 前端测试使用 JSDOM 环境
  - 服务端测试使用 Node 环境
  - Rust 测试使用 Cargo 测试环境

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！


---

⭐ **如果这个项目对你有帮助，请给个 Star 支持一下！**
