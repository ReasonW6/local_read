// scripts/launch-electron.js
// 跨平台 Electron 启动脚本，自动清除可能影响 Electron 初始化的环境变量
const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

const env = Object.assign({}, process.env);
// 清除 ELECTRON_RUN_AS_NODE：该变量会使 Electron 以 Node.js 模式运行，导致 app API 不可用
delete env.ELECTRON_RUN_AS_NODE;

const args = [path.join(__dirname, '..'), ...process.argv.slice(2)];
const proc = spawn(electron, args, { stdio: 'inherit', env });
proc.on('close', code => process.exit(code || 0));
