@echo off
REM 设置命令行窗口的标题
title Local E-Book Reader

REM 显示提示信息
echo ==================================================
echo  正在启动本地电子书阅读器服务器...
echo  请不要关闭新弹出的黑色命令行窗口。
echo ==================================================

REM 在一个新的窗口中启动 Node.js 服务器
REM 这能让服务器在后台持续运行，同时本脚本可以继续执行
start "Node Server" node server.js

REM 等待3秒，给服务器足够的时间来初始化
echo.
echo  正在等待服务器响应 (3秒)...
timeout /t 3 /nobreak >nul

REM 在默认浏览器中打开阅读器页面
echo.
echo  正在浏览器中打开阅读器...
start http://localhost:3000

REM 退出本脚本窗口
exit
