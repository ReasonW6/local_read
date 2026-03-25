// electron-main.js - Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

// 数据目录支持：可通过环境变量覆盖（适合便携版/自定义路径）
const DATA_DIR_ENV = 'LOCAL_READ_DATA_DIR';
const PORTABLE_DIR_ENV = 'PORTABLE_EXECUTABLE_DIR';

const getDataRoot = () => {
  if (!app.isPackaged) {
    return __dirname;
  }
  return process.env[DATA_DIR_ENV] || process.env[PORTABLE_DIR_ENV] || app.getPath('userData');
};

const getRuntimeDirs = () => {
  const dataRoot = getDataRoot();
  return {
    dataRoot,
    books: path.join(dataRoot, 'books'),
    config: path.join(dataRoot, 'user-data'),
    fonts: path.join(dataRoot, 'user-data', 'fonts')
  };
};

// ==================== 性能优化：启动加速 ====================
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-color-profile', 'srgb');

let server = null;
const PORT = 31337;

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
      backgroundThrottling: false,
      spellcheck: false,
      enableWebSQL: false
    },
    show: false,
    backgroundColor: '#1a1a2e',
    frame: false,
    autoHideMenuBar: true
  });

  // 窗口准备好后显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 加载应用
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 窗口最大化/还原事件 -> 通知渲染进程更新标题栏按钮图标
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('maximize-change', false);
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 启动内嵌服务器（复用共享核心模块）
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      const express = require('express');
      const { createApp } = require('./shared/server-core');

      const DIRS = getRuntimeDirs();
      const { app: expressApp } = createApp(DIRS);

      // 静态文件服务 - 支持打包后的路径
      expressApp.use(express.static(__dirname));
      // 书籍/配置目录可能在可执行文件目录之外，统一显式挂载
      expressApp.use('/books', express.static(DIRS.books));
      expressApp.use('/user-data', express.static(DIRS.config));

      // 启动服务器（仅绑定本地回环地址）
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
    await startServer();
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

// ==================== IPC 通信处理 ====================

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-books-folder', () => {
  const fs = require('fs');
  const { books } = getRuntimeDirs();
  if (!fs.existsSync(books)) {
    fs.mkdirSync(books, { recursive: true });
  }
  shell.openPath(books);
});

ipcMain.handle('open-external-link', (event, url) => {
  shell.openExternal(url);
});

// 窗口控制 IPC（自定义标题栏）
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize-toggle', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});
