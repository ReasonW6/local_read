// preload.js - Electron 预加载脚本
const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 打开书籍文件夹
  openBooksFolder: () => ipcRenderer.invoke('open-books-folder'),
  
  // 打开外部链接
  openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
  
  // 检测是否在 Electron 环境中
  isElectron: true
});

// 在 DOM 准备好后执行
window.addEventListener('DOMContentLoaded', () => {
  // 可以在这里添加一些 DOM 操作
  console.log('Electron preload script loaded');
});
