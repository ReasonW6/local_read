@echo off
chcp 65001 >nul
REM 本地电子书阅读器的启动脚本
title Local E-Book Reader

REM 显示提示信息
echo ==================================================
echo  正在启动本地电子书阅读器服务器...
echo  请不要关闭此窗口的黑色命令行窗口。
echo ==================================================

REM 在一个新的窗口中启动 Node.js 服务器
REM 这样既方便在后台运行服务，同时脚本自己会继续执行
start "Node Server" node server.js

REM 等待1秒，让服务器有足够的时间来启动
echo.
echo  正在等待服务器响应 (1秒)...
timeout /t 1 /nobreak >nul

REM 在默认浏览器中打开阅读器页面
echo.
echo  正在打开电子书阅读器...
start http://localhost:3000

REM 退出启动脚本自身
exit
